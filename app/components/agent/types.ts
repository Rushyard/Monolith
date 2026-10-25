// Types de la réponse de POST /api/intent, pour les composants client.
// Imports `type` uniquement : effacés à la compilation, aucun code serveur dans le bundle.
import type { ExecutionResult } from "@/lib/agent/executor";
import type { GateDecision } from "@/lib/agent/gatekeeper";
import type { Plan } from "@/lib/agent/planner";

// ---------- contrat P1 ↔ P2 : paie confidentielle (ne pas modifier sans se synchroniser) ----------

/** Un paiement que Sarah (owner) signe elle-même dans le coffre : preuve dans son navigateur. */
export type VaultPayment = { to: string; label: string; amountUsdc: string };

/** Destinataire inscrit dans le coffre : l'agent ne paie pas, il prépare et Sarah signe. */
export type VaultSignatureRequest = { status: "needs_vault_signature"; payments: VaultPayment[]; totalUsdc: string; reasons: string[] };

export type IntentResult =
  | ExecutionResult
  | VaultSignatureRequest
  | { status: "needs_clarification" | "reply" | "unsupported"; text: string };

/** Ligne du journal d'activité (GET /api/agent/activity), reconstruit depuis la blockchain. */
export type ActivityItem = {
  at: string;
  kind: "paid" | "refused" | "waiting" | "blocked";
  channel: "private" | "public";
  to: string;
  label: string;
  amountUsdc?: string; // JAMAIS rempli pour les paiements privés
  hash?: string;
  reason?: string;
};

export type ActivityResponse = { items: ActivityItem[] };

/** POST /api/agent/vault-receipt : reçu d'un transfert confidentiel signé par Sarah (sans montant). */
export type VaultReceiptRequest = { to: string; hash: string };

export type IntentResponse = {
  plan: Plan | null;
  verdict: GateDecision | null;
  result: IntentResult;
  reasoning: string;
  /** Présent quand le planner n'a pas produit de plan (clarify, reply…) ou sur un refus net. */
  planner?: "llm" | "fallback";
  /** « owner » : Sarah connectée (paiements réels). « simulation » : visiteur, rien n'est envoyé. */
  mode?: "owner" | "simulation";
  /** Langue des textes écrits par le serveur (message → client → anglais). */
  lang?: "en" | "fr" | "pt";
};

export type OwnerApproval = Extract<ExecutionResult, { status: "needs_owner_approval" }>;
export type SimulatedResult = Extract<ExecutionResult, { status: "simulated" }>;

/** GET /api/agent/pause */
export type PauseStatus = { paused: boolean; ruleId?: number; scope: string };

/** GET /api/agent/session */
export type SessionStatus = { enabled: boolean; owner: boolean; ownerAddress: string };

export type BalanceResponse = {
  smartAccount: string;
  smartAccountUsdc: number;
  budget: { limitUsdc: number; spentUsdc: number; remainingUsdc: number; periodLedgers: number };
  ledger: number;
};

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
