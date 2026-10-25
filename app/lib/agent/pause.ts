// B4 : mettre en pause la petite caisse de l'agent (server-only). L'owner (Sarah) signe dans Freighter :
//   pause    = remove_context_rule(règle de l'agent, trouvée par findAgentRule), owner = source de la tx
//   reprise  = add_context_rule(mêmes paramètres que reset-agent.ts : AGENT_RULE dans core.ts)
// Le serveur ne prépare que des XDR NON signés ; seule la signature de l'owner les rend valides.
// La pause ne coupe QUE la petite caisse : dans le coffre, Sarah signe déjà chaque paiement.
import "server-only";
import { AGENT_CONFIG, agentKeypair, agentRuleStatus } from "./config";
import {
  Keypair,
  NETWORK_PASSPHRASE,
  TransactionBuilder,
  addAgentRuleArgs,
  invokeAsSmartAccountUnsigned,
  nativeToScVal,
  type SmartAccountCall,
} from "./core";

const C = AGENT_CONFIG;

export const PAUSE_SCOPE =
  "La pause ne coupe que la petite caisse publique de l'agent. Dans le coffre, rien ne change : c'est déjà Sarah qui signe chaque paiement.";

export type PausePrep =
  | { ok: true; action: "pause" | "resume"; unsignedXdr: string; owner: string; feeXlm: number; validUntilLedger: number; ruleId?: number }
  | { ok: false; error: string };

const asOwner = (fn: string, args: SmartAccountCall["args"]): SmartAccountCall => ({
  contract: C.smartAccount,
  fn,
  args,
  smartAccount: C.smartAccount,
  ruleId: C.ruleOwner,
  signer: { kind: "delegated-source", address: C.ownerAddress },
  source: C.ownerAddress,
});

async function prepare(action: "pause" | "resume", call: SmartAccountCall, ruleId?: number): Promise<PausePrep> {
  const r = await invokeAsSmartAccountUnsigned(call);
  if (!r.ok) return { ok: false, error: `simulation de ${call.fn} : ${r.error.split("\n")[0]}` };
  const fee = Number(TransactionBuilder.fromXDR(r.unsignedXdr, NETWORK_PASSPHRASE).fee) / 1e7;
  return { ok: true, action, unsignedXdr: r.unsignedXdr, owner: C.ownerAddress, feeXlm: fee, validUntilLedger: r.validUntilLedger, ruleId };
}

/** XDR non signé qui retire la règle de l'agent. */
export async function preparePause(): Promise<PausePrep> {
  const s = await agentRuleStatus();
  if (s.state === "paused") return { ok: false, error: "l'agent est déjà en pause (aucune règle de l'agent on-chain)" };
  if (s.state === "unknown") return { ok: false, error: `règle de l'agent illisible : ${s.error}` };
  return prepare("pause", asOwner("remove_context_rule", [nativeToScVal(s.id, { type: "u32" })]), s.id);
}

/** XDR non signé qui recrée la règle de l'agent avec les paramètres de reset-agent.ts. */
export async function prepareResume(): Promise<PausePrep> {
  const s = await agentRuleStatus();
  if (s.state === "active") return { ok: false, error: `l'agent n'est pas en pause (règle ${s.id} active)` };
  if (s.state === "unknown") return { ok: false, error: `règle de l'agent illisible : ${s.error}` };
  const agentKey = process.env.AGENT_SECRET_KEY ? agentKeypair() : Keypair.fromPublicKey(C.agentAddress);
  return prepare("resume", asOwner("add_context_rule", addAgentRuleArgs(C.usdcSac, C.ed25519Verifier, agentKey.rawPublicKey(), C.spendingLimitPolicy)));
}
