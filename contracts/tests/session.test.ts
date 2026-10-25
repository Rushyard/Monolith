// B12 (protéger la démo), sans réseau : défi signé SEP-53, cookie HMAC, fail-closed, limite par IP.
// La « Sarah » de test est une paire de clés générée ici : jamais la vraie clé owner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "../../app/lib/agent/core.ts";
import {
  CHALLENGE_TTL_S,
  SESSION_TTL_S,
  createChallenge,
  isOwnerRequest,
  makeSessionToken,
  rateLimit,
  readSessionToken,
  sep53Digest,
  sessionCookieHeader,
  verifyLogin,
} from "../../app/lib/agent/session.ts";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const sarah = Keypair.random();
const mallory = Keypair.random();
/** Ce que fait Freighter (extension, signBlob.ts) : ed25519 sur sha256("Stellar Signed Message:\n" + message), base64. */
const freighterSign = (kp: Keypair, message: string) => Buffer.from(kp.sign(sep53Digest(message))).toString("base64");

test("SEP-53 : digest = sha256(préfixe + message)", async () => {
  const { createHash } = await import("node:crypto");
  assert.deepEqual(sep53Digest("hi"), createHash("sha256").update("Stellar Signed Message:\nhi").digest());
});

test("connexion : signature de l'owner → OK, une seule fois (nonce à usage unique)", () => {
  const c = createChallenge(SECRET);
  const input = { message: c.message, token: c.token, signature: freighterSign(sarah, c.message) };
  assert.deepEqual(verifyLogin(input, sarah.publicKey(), SECRET), { ok: true });
  assert.equal(verifyLogin(input, sarah.publicKey(), SECRET).ok, false); // rejoué
});

test("connexion refusée : autre compte, message modifié, défi expiré, signature brute non SEP-53", () => {
  const c = createChallenge(SECRET);
  assert.equal(verifyLogin({ ...c, signature: freighterSign(mallory, c.message) }, sarah.publicKey(), SECRET).ok, false);
  const forged = c.message.replace(/nonce: \w+/, "nonce: " + "0".repeat(32));
  assert.equal(verifyLogin({ message: forged, token: c.token, signature: freighterSign(sarah, forged) }, sarah.publicKey(), SECRET).ok, false);
  const old = createChallenge(SECRET, Date.now() - (CHALLENGE_TTL_S + 1) * 1000);
  assert.equal(verifyLogin({ ...old, signature: freighterSign(sarah, old.message) }, sarah.publicKey(), SECRET).ok, false);
  const raw = Buffer.from(sarah.sign(Buffer.from(c.message))).toString("base64");
  assert.equal(verifyLogin({ ...c, signature: raw }, sarah.publicKey(), SECRET).ok, false);
});

test("cookie : valide 8 h, falsifié ou expiré → pas owner", () => {
  const t = makeSessionToken(sarah.publicKey(), SECRET);
  assert.equal(readSessionToken(t, sarah.publicKey(), SECRET), true);
  assert.equal(readSessionToken(t, mallory.publicKey(), SECRET), false);
  assert.equal(readSessionToken(t.replace(/.$/, (ch) => (ch === "A" ? "B" : "A")), sarah.publicKey(), SECRET), false);
  assert.equal(readSessionToken(t, sarah.publicKey(), "autre-secret-0123456789abcdef0123456789"), false);
  assert.equal(readSessionToken(t, sarah.publicKey(), SECRET, Date.now() + (SESSION_TTL_S + 1) * 1000), false);
  assert.match(sessionCookieHeader(t), /HttpOnly; Secure; SameSite=Strict; Max-Age=28800/);
});

test("FAIL-CLOSED : sans SESSION_SECRET, même un cookie valide ne donne pas la main", () => {
  const req = new Request("http://x", { headers: { cookie: `monolith_owner=${encodeURIComponent(makeSessionToken(sarah.publicKey(), SECRET))}` } });
  delete process.env.SESSION_SECRET;
  assert.equal(isOwnerRequest(req, sarah.publicKey()), false);
  process.env.SESSION_SECRET = SECRET;
  assert.equal(isOwnerRequest(req, sarah.publicKey()), true);
  process.env.SESSION_SECRET = "trop-court";
  assert.equal(isOwnerRequest(req, sarah.publicKey()), false);
  delete process.env.SESSION_SECRET;
});

test("limite par IP : 20 messages / 10 min, le 21e est refusé, une autre IP passe", () => {
  const now = Date.now();
  for (let i = 0; i < 20; i++) assert.equal(rateLimit("1.2.3.4", 20, 600_000, now + i).ok, true);
  const r = rateLimit("1.2.3.4", 20, 600_000, now + 21);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfterS > 0);
  assert.equal(rateLimit("5.6.7.8", 20, 600_000, now).ok, true);
  assert.equal(rateLimit("1.2.3.4", 20, 600_000, now + 600_001).ok, true);
});
