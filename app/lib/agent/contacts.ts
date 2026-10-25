// Carnet de contacts de la démo : nom → compte G testnet (adresses publiques).
import { StrKey } from "@stellar/stellar-sdk";

export const CONTACTS: Record<string, string> = {
  alice: "GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6",
};

export type Recipient = { address: string; label: string; known: boolean };

/** Résout un destinataire écrit par l'utilisateur : nom du carnet, ou adresse G valide. */
export function resolveRecipient(to: string | undefined): Recipient | null {
  if (!to) return null;
  const raw = to.trim();
  const byName = CONTACTS[raw.toLowerCase()];
  if (byName) return { address: byName, label: raw[0].toUpperCase() + raw.slice(1).toLowerCase(), known: true };
  if (StrKey.isValidEd25519PublicKey(raw)) {
    const name = Object.entries(CONTACTS).find(([, a]) => a === raw)?.[0];
    return { address: raw, label: name ?? `${raw.slice(0, 4)}…${raw.slice(-4)}`, known: !!name };
  }
  return null;
}
