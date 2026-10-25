// Types de la réponse de POST /api/intent, pour les composants client.
// Imports `type` uniquement : effacés à la compilation, aucun code serveur dans le bundle.
import type { ExecutionResult } from "@/lib/agent/executor";
import type { GateDecision } from "@/lib/agent/gatekeeper";
import type { Plan } from "@/lib/agent/planner";

export type IntentResult =
  | ExecutionResult
  | { status: "needs_clarification" | "reply" | "unsupported"; text: string };

export type IntentResponse = {
  plan: Plan | null;
  verdict: GateDecision | null;
  result: IntentResult;
  reasoning: string;
  /** Présent quand le planner n'a pas produit de plan (clarify, reply…) ou sur un refus net. */
  planner?: "llm" | "fallback";
};

export type OwnerApproval = Extract<ExecutionResult, { status: "needs_owner_approval" }>;

export type BalanceResponse = {
  smartAccount: string;
  smartAccountUsdc: number;
  budget: { limitUsdc: number; spentUsdc: number; remainingUsdc: number; periodLedgers: number };
  ledger: number;
};

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
