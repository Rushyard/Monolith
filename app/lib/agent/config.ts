// Configuration de l'agent (server-only). Valeurs publiques testnet par défaut, lues dans
// ./deployment.json (copie écrite par contracts/scripts/reset-agent.ts) ; l'env a priorité.
import "server-only";
import { Keypair } from "./core";
import D from "./deployment.json";

export const AGENT_CONFIG = {
  smartAccount: process.env.NEXT_PUBLIC_SMART_ACCOUNT_ID || D.smartAccount,
  usdcSac: process.env.NEXT_PUBLIC_USDC_SAC || D.usdcSac,
  ed25519Verifier: process.env.ED25519_VERIFIER_ID || D.ed25519Verifier,
  spendingLimitPolicy: process.env.SPENDING_LIMIT_POLICY_ID || D.spendingLimitPolicy,
  /** Règle A : owner (Delegated), plein pouvoir. */
  ruleOwner: Number(process.env.RULE_OWNER_ID ?? D.ruleOwner),
  /** Règle B : agent (External Ed25519), spending_limit. */
  ruleAgent: Number(process.env.RULE_AGENT_ID ?? D.ruleAgent),
  /** Compte G de l'owner (Freighter) : source des tx d'approbation. Adresse publique. */
  ownerAddress: process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B",
};

/** Clé de l'agent : uniquement côté serveur, jamais NEXT_PUBLIC. */
export function agentKeypair(): Keypair {
  const secret = process.env.AGENT_SECRET_KEY;
  if (!secret) throw new Error("AGENT_SECRET_KEY manquant (app/.env.local)");
  return Keypair.fromSecret(secret.trim());
}
