// Configuration de l'agent (server-only). Valeurs publiques testnet par défaut, lues dans
// ./deployment.json (copie écrite par contracts/scripts/reset-agent.ts) ; l'env a priorité.
// L'id de la règle de l'agent est retrouvé on-chain (agentRuleId), pas besoin de redéployer après un reset.
import "server-only";
import { Keypair, findAgentRule } from "./core";
import D from "./deployment.json";

export const AGENT_CONFIG = {
  smartAccount: process.env.NEXT_PUBLIC_SMART_ACCOUNT_ID || D.smartAccount,
  usdcSac: process.env.NEXT_PUBLIC_USDC_SAC || D.usdcSac,
  ed25519Verifier: process.env.ED25519_VERIFIER_ID || D.ed25519Verifier,
  spendingLimitPolicy: process.env.SPENDING_LIMIT_POLICY_ID || D.spendingLimitPolicy,
  /** Règle A : owner (Delegated), plein pouvoir. */
  ruleOwner: Number(process.env.RULE_OWNER_ID ?? D.ruleOwner),
  /** Règle B : agent (External Ed25519), spending_limit. Valeur de repli si la lecture on-chain échoue. */
  ruleAgentFallback: D.ruleAgent,
  /** Compte G de l'agent (clé publique). Sert à retrouver sa règle quand AGENT_SECRET_KEY est absent. */
  agentAddress: process.env.AGENT_PUBLIC_KEY || "GAJDU7KW7ZZ7DOOTEHV5WILNF2CPBAWJE332I7PEAFLSU7LIVIVDUD33",
  /** Compte G de l'owner (Freighter) : source des tx d'approbation. Adresse publique. */
  ownerAddress: process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B",
};

/** Clé de l'agent : uniquement côté serveur, jamais NEXT_PUBLIC. */
export function agentKeypair(): Keypair {
  const secret = process.env.AGENT_SECRET_KEY;
  if (!secret) throw new Error("AGENT_SECRET_KEY manquant (app/.env.local)");
  return Keypair.fromSecret(secret.trim());
}

const RULE_CACHE_MS = 60_000;
export type AgentRuleStatus = { state: "active"; id: number } | { state: "paused" } | { state: "unknown"; error: string };
let ruleCache: { status: AgentRuleStatus; at: number } | null = null;

/** Oublie le cache (après une pause / réactivation soumise par l'owner). */
export const invalidateAgentRuleCache = () => {
  ruleCache = null;
};

/**
 * État de la règle B, lu on-chain (cache 60 s) : « active » (id), « paused » (aucune règle avec le
 * signer de l'agent + la spending-limit : B4), ou « unknown » si le RPC ne répond pas.
 */
export async function agentRuleStatus(): Promise<AgentRuleStatus> {
  if (process.env.RULE_AGENT_ID) return { state: "active", id: Number(process.env.RULE_AGENT_ID) };
  if (ruleCache && Date.now() - ruleCache.at < RULE_CACHE_MS) return ruleCache.status;
  const C = AGENT_CONFIG;
  const agentKey = process.env.AGENT_SECRET_KEY ? agentKeypair() : Keypair.fromPublicKey(C.agentAddress);
  let status: AgentRuleStatus;
  try {
    const id = await findAgentRule(C.ownerAddress, C.smartAccount, C.ed25519Verifier, agentKey.rawPublicKey(), C.spendingLimitPolicy);
    status = id === null ? { state: "paused" } : { state: "active", id };
    ruleCache = { status, at: Date.now() };
  } catch (err) {
    status = { state: "unknown", error: err instanceof Error ? err.message : String(err) };
  }
  return status;
}

/**
 * Id de la règle B (agent). Ordre : RULE_AGENT_ID (surcharge) → règle trouvée on-chain (cache 60 s)
 * → deployment.json si le RPC ne répond pas ou si l'agent est en pause (la tx échouera alors on-chain).
 * Après `npm run reset-agent`, l'app suit toute seule.
 */
export async function agentRuleId(): Promise<number> {
  const s = await agentRuleStatus();
  if (s.state === "active") return s.id;
  console.error(`[config] règle de l'agent ${s.state === "paused" ? "absente (pause)" : "illisible"}, repli sur deployment.json (${AGENT_CONFIG.ruleAgentFallback})`);
  return AGENT_CONFIG.ruleAgentFallback;
}
