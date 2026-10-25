// Configuration de l'agent (server-only). Valeurs publiques testnet par défaut, issues de
// contracts/deployments.testnet.json ; chaque valeur peut être surchargée par l'env.
import "server-only";
import { Keypair } from "./core";

export const AGENT_CONFIG = {
  smartAccount: process.env.NEXT_PUBLIC_SMART_ACCOUNT_ID || "CC5D2NUS2GXAWMTK2DMSNJHVRGRH5GBEZNUMEPIOPBPQQJN6GDLO43KA",
  usdcSac: process.env.NEXT_PUBLIC_USDC_SAC || "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  ed25519Verifier: process.env.ED25519_VERIFIER_ID || "CBBDHCHRKXP2EROB5JN3EMCMZ4VOOIXSOKDNVPJKY4KIJXZ53ZDC3ZVB",
  spendingLimitPolicy: process.env.SPENDING_LIMIT_POLICY_ID || "CAOT4RM7SYJPLT5XQVPYDEX6HKQOZFODZE6KQVUQJZUSVJY6HBWUVGHQ",
  /** Règle A : owner (Delegated), plein pouvoir. */
  ruleOwner: Number(process.env.RULE_OWNER_ID ?? 0),
  /** Règle B : agent (External Ed25519), spending_limit. */
  ruleAgent: Number(process.env.RULE_AGENT_ID ?? 1),
  /** Compte G de l'owner (Freighter) : source des tx d'approbation. Adresse publique. */
  ownerAddress: process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B",
};

/** Clé de l'agent : uniquement côté serveur, jamais NEXT_PUBLIC. */
export function agentKeypair(): Keypair {
  const secret = process.env.AGENT_SECRET_KEY;
  if (!secret) throw new Error("AGENT_SECRET_KEY manquant (app/.env.local)");
  return Keypair.fromSecret(secret.trim());
}
