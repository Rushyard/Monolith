// Carnet de contacts de la démo : nom (+ alias) → compte G testnet (adresses publiques).
// Alice : identité CLI « alice », hors coffre (petite caisse publique de la démo).
// Bob : compte « bob » du run e2e du coffre (deployments/testnet-e2e.json), inscrit, auditeur 1.
// Carol : compte de P2, destinataire du transfert confidentiel 75db195e (run validé), inscrit, auditeur 1.
import { StrKey } from "@stellar/stellar-sdk";
import { T, pickLang, type Lang } from "./i18n";

export type Contact = { name: string; address: string; aliases: string[] };

export const BOOK: Contact[] = [
  { name: "Alice", address: "GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6", aliases: ["alice"] },
  { name: "Bob", address: "GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV", aliases: ["bob", "bobby", "robert"] },
  { name: "Carol", address: "GDTMYTVUVK24YS33DC7LH2LXF6C4TKOYLPBWZNKKJIIRSAKRJZLSXPH3", aliases: ["carol", "caroline"] },
];

/** Minuscules, sans accents ni espaces superflus : « Àlice » → « alice ». */
export const normaliseName = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** nom ou alias normalisé → adresse. */
export const CONTACTS: Record<string, string> = Object.fromEntries(
  BOOK.flatMap((c) => [normaliseName(c.name), ...c.aliases.map(normaliseName)].map((k) => [k, c.address])),
);

export type Recipient = { address: string; label: string; known: boolean };

const byAddress = (a: string) => BOOK.find((c) => c.address === a);

/** Résout un destinataire écrit par l'utilisateur : nom ou alias du carnet, ou adresse G valide. */
export function resolveRecipient(to: string | undefined): Recipient | null {
  if (!to) return null;
  const raw = to.trim();
  const address = CONTACTS[normaliseName(raw)];
  if (address) return { address, label: byAddress(address)!.name, known: true };
  if (StrKey.isValidEd25519PublicKey(raw)) {
    const c = byAddress(raw);
    return { address: raw, label: c?.name ?? `${raw.slice(0, 4)}…${raw.slice(-4)}`, known: !!c };
  }
  return null;
}

// ---------- A1 : fautes de frappe (après le planner, côté serveur) ----------

/** Distance de Damerau-Levenshtein (variante « optimal string alignment ») : insertions, suppressions, substitutions, transpositions adjacentes. */
export function damerauLevenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export type NameMatch =
  | { kind: "exact"; contact: Contact }
  | { kind: "close"; names: string[]; distance: number }
  | { kind: "unknown" };

/** Compare un nom (pas une adresse) aux noms et alias du carnet. Distance ≤ 2 → suggestion, jamais exécution. */
export function matchName(raw: string): NameMatch {
  const q = normaliseName(raw);
  let best = Infinity;
  let names: string[] = [];
  for (const c of BOOK) {
    for (const key of [c.name, ...c.aliases].map(normaliseName)) {
      const dist = damerauLevenshtein(q, key);
      if (dist === 0) return { kind: "exact", contact: c };
      if (dist < best) [best, names] = [dist, [c.name]];
      else if (dist === best && !names.includes(c.name)) names.push(c.name);
    }
  }
  return best <= 2 ? { kind: "close", names, distance: best } : { kind: "unknown" };
}

/**
 * Clarification à renvoyer pour un destinataire écrit par le planner, ou null s'il est résolu
 * (nom exact du carnet ou adresse G valide). Un nom corrigé ne déclenche jamais de paiement.
 */
export function recipientClarification(to: string, message?: string, lang: Lang = pickLang(message)): string | null {
  const t = T[lang];
  const resolved = resolveRecipient(to);
  if (resolved) {
    // Le LLM a pu corriger lui-même une faute (« Alise » → « Alice ») : le nom doit figurer tel quel
    // dans le message brut (ou l'adresse G), sinon on demande confirmation.
    if (message === undefined || mentions(message, resolved.address)) return null;
    const typed = closestWordTo(message, resolved.address);
    return t.didYouMeanTyped(resolved.label, typed);
  }
  const raw = to.trim();
  if (/^G[A-Z2-7]{10,}/.test(raw)) return t.invalidAddress(raw.slice(0, 8));
  const m = matchName(raw);
  if (m.kind === "close") return t.didYouMean(m.names);
  return t.unknownName(raw);
}

const words = (message: string) => normaliseName(message).split(/[^a-z0-9]+/).filter(Boolean);

/** Le message brut cite ce destinataire : son adresse G, ou un de ses noms / alias exacts. */
function mentions(message: string, address: string): boolean {
  if (message.includes(address)) return true;
  const c = BOOK.find((b) => b.address === address);
  if (!c) return false;
  const keys = new Set([c.name, ...c.aliases].map(normaliseName));
  return words(message).some((w) => keys.has(w));
}

/** Mot du message le plus proche (≤ 2) d'un nom du contact, pour montrer ce qui a été tapé. */
function closestWordTo(message: string, address: string): string | null {
  const c = BOOK.find((b) => b.address === address);
  if (!c) return null;
  const keys = [c.name, ...c.aliases].map(normaliseName);
  let best: [number, string] | null = null;
  for (const w of words(message)) for (const k of keys) {
    const d = damerauLevenshtein(w, k);
    if (d <= 2 && (!best || d < best[0])) best = [d, w];
  }
  return best?.[1] ?? null;
}
