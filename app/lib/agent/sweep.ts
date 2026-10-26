// Retour au coffre, étape 1 (server-only) : tout l'USDC de la petite caisse (smart account) part vers le compte
// de Sarah, via la règle A (owner = source de la tx, même mécanique que la carte d'approbation). Le serveur ne
// signe rien : il renvoie un XDR non signé que Sarah signe dans Freighter. L'étape 2 (dépôt dans le coffre,
// montant public puis caché) se fait dans le navigateur de Sarah, avec la clé du coffre qu'elle seule possède.
import "server-only";
import { AGENT_CONFIG } from "./config";
import { Address, fromUsdc, invokeAsSmartAccountUnsigned, nativeToScVal, readTokenBalance } from "./core";

const C = AGENT_CONFIG;

export type SweepPrep =
  | { ok: true; unsignedXdr: string; owner: string; validUntilLedger: number; amount: string; amountUsdc: number }
  | { ok: false; empty: boolean; error: string };

export async function prepareSweep(): Promise<SweepPrep> {
  const balance = await readTokenBalance(C.ownerAddress, C.usdcSac, C.smartAccount);
  if (balance <= 0n) return { ok: false, empty: true, error: "petty cash is empty" };
  const prepared = await invokeAsSmartAccountUnsigned({
    contract: C.usdcSac,
    fn: "transfer",
    args: [new Address(C.smartAccount).toScVal(), new Address(C.ownerAddress).toScVal(), nativeToScVal(balance, { type: "i128" })],
    smartAccount: C.smartAccount,
    ruleId: C.ruleOwner,
    signer: { kind: "delegated-source", address: C.ownerAddress },
    source: C.ownerAddress,
  });
  if (!prepared.ok) return { ok: false, empty: false, error: prepared.error };
  return {
    ok: true,
    unsignedXdr: prepared.unsignedXdr,
    owner: C.ownerAddress,
    validUntilLedger: prepared.validUntilLedger,
    amount: balance.toString(),
    amountUsdc: fromUsdc(balance),
  };
}
