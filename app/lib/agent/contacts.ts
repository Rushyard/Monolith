// Carnet de contacts de la démo : nom (+ alias) → compte G testnet (adresses publiques).
// Alice : identité CLI « alice », hors coffre (petite caisse publique de la démo).
// Bob : compte « bob » du run e2e du coffre (deployments/testnet-e2e.json), inscrit, auditeur 1.
import { StrKey } from "@stellar/stellar-sdk";

export type Contact = { name: string; address: string; aliases: string[] };

export const BOOK: Contact[] = [
  { name: "Alice", address: "GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6", aliases: ["alice"] },
  { name: "Bob", address: "GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV", aliases: ["bob", "bobby", "robert"] },
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
