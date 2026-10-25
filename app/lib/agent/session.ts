// Session owner (server-only) : seule Sarah fait payer l'agent pour de vrai ; les visiteurs sont
// en simulation. Connexion par défi signé :
//   1. GET  /api/agent/challenge → { message, token } : nonce aléatoire, expire dans 5 min,
//      `token` = HMAC(SESSION_SECRET, message) (le serveur n'a rien à stocker entre les deux appels).
//   2. le navigateur signe `message` avec Freighter `signMessage` → signature base64.
//      Format vérifié dans l'extension (stellar/freighter, background/messageListener/handlers/signBlob.ts
//      + helpers/stellar.ts encodeSep53Message) : SEP-53, ed25519 sur sha256("Stellar Signed Message:\n" + message).
//   3. POST /api/agent/session { message, token, signature } → vérifié contre la clé publique owner de la
//      config, nonce à usage unique (mémoire de l'instance, best effort), puis cookie httpOnly 8 h signé HMAC.
// FAIL-CLOSED : sans SESSION_SECRET, personne n'est owner (tout le monde en simulation).
// La clé owner ne vient jamais sur le serveur : il ne voit que la signature d'un message.
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Keypair } from "./core";
import { T, type Lang } from "./i18n";

export const SESSION_COOKIE = "monolith_owner";
export const SESSION_TTL_S = 8 * 3600;
export const CHALLENGE_TTL_S = 5 * 60;
export const SEP53_PREFIX = "Stellar Signed Message:\n";

const usedNonces = new Map<string, number>(); // nonce → expiration (ms)

const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url");
const sameMac = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

/** Texte signé par Sarah dans Freighter. Lisible, et lié à ce site et à cette heure. */
export function createChallenge(secret: string, now = Date.now(), lang: Lang = "en") {
  const nonce = randomBytes(16).toString("hex");
  const expires = new Date(now + CHALLENGE_TTL_S * 1000).toISOString();
  const message = `${T[lang].loginTitle}\nnonce: ${nonce}\nexpires: ${expires}`;
  return { message, token: mac(secret, message), expires };
}

/** Digest SEP-53 que Freighter signe. */
export const sep53Digest = (message: string) => createHash("sha256").update(SEP53_PREFIX + message, "utf8").digest();

export type LoginCheck = { ok: true } | { ok: false; error: string };

export function verifyLogin(
  input: { message: string; token: string; signature: string },
  ownerAddress: string,
  secret: string,
  now = Date.now(),
  lang: Lang = "en",
): LoginCheck {
  const t = T[lang];
  if (!sameMac(mac(secret, input.message), input.token)) return { ok: false, error: t.loginUnknown };
  const nonce = /\nnonce: ([0-9a-f]{32})\n/.exec(input.message)?.[1];
  const expires = Date.parse(/\nexpires: (\S+)$/.exec(input.message)?.[1] ?? "");
  if (!nonce || !Number.isFinite(expires)) return { ok: false, error: t.loginUnreadable };
  if (now > expires) return { ok: false, error: t.loginExpired };
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n);
  if (usedNonces.has(nonce)) return { ok: false, error: t.loginReplayed };
  let valid = false;
  try {
    const sig = Buffer.from(input.signature, "base64");
    valid = sig.length === 64 && Keypair.fromPublicKey(ownerAddress).verify(sep53Digest(input.message), sig);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: t.loginBadSignature };
  usedNonces.set(nonce, expires);
  return { ok: true };
}

/** Valeur du cookie : `<payload base64url>.<hmac>`. */
export function makeSessionToken(ownerAddress: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ sub: ownerAddress, exp: now + SESSION_TTL_S * 1000 })).toString("base64url");
  return `${payload}.${mac(secret, payload)}`;
}

export function readSessionToken(token: string | undefined, ownerAddress: string, secret: string | null, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !sameMac(mac(secret, payload), sig)) return false;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string; exp: number };
    return sub === ownerAddress && now < exp;
  } catch {
    return false;
  }
}

export function cookieValue(req: Request, name = SESSION_COOKIE): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function isOwnerRequest(req: Request, ownerAddress: string): boolean {
  return readSessionToken(cookieValue(req), ownerAddress, sessionSecret());
}

export const sessionCookieHeader = (token: string) =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_S}`;
export const clearSessionCookieHeader = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

// ---------- limite par IP (mémoire de l'instance, best effort sur serverless) ----------

const hits = new Map<string, number[]>();

export function rateLimit(key: string, max = 20, windowMs = 10 * 60_000, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false, retryAfterS: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryAfterS: 0 };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
