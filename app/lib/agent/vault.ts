// Appartenance au coffre confidentiel (server-only), lue par simulation (`confidential_balance`,
// via ChainClient.isRegistered du SDK, comme dans scripts/). Cache 60 s.
// FAIL-CLOSED : une erreur de lecture est propagée, jamais traduite en « pas inscrit » : basculer
// en public un paiement destiné au coffre révélerait son montant.
import "server-only";
import { ChainClient } from "stellar-confidential-token-sdk";
import { CT } from "../ct/deployment";

const CACHE_MS = 60_000;
const cache = new Map<string, { inVault: boolean; at: number }>();

export const ctClient = () =>
  new ChainClient({
    rpcUrl: CT.rpcUrl,
    networkPassphrase: CT.networkPassphrase,
    contracts: { token: CT.token, verifier: CT.verifier, auditor: CT.auditor },
  });

/** true si `address` a un compte confidentiel. Lève une erreur si la chaîne est illisible. */
export async function isInVault(address: string): Promise<boolean> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.inVault;
  const inVault = await ctClient().isRegistered(address);
  cache.set(address, { inVault, at: Date.now() });
  return inVault;
}

/** Message renvoyé quand l'appartenance au coffre n'a pas pu être vérifiée. */
export const VAULT_CHECK_FAILED =
  "Je n'ai pas pu vérifier si ce destinataire est dans le coffre. Je ne paie pas en public à l'aveugle, ça révélerait le montant : réessaie dans un instant.";

export type ChannelCheck = { ok: true; inVault: boolean } | { ok: false; error: string };

/** Canal d'un destinataire. `check` est injectable pour les tests ; toute erreur → ok: false (fail-closed). */
export async function vaultChannel(address: string, check: (a: string) => Promise<boolean> = isInVault): Promise<ChannelCheck> {
  try {
    return { ok: true, inVault: await check(address) };
  } catch (err) {
    console.error("[vault] lecture du coffre impossible", err instanceof Error ? err.message : err);
    return { ok: false, error: VAULT_CHECK_FAILED };
  }
}
