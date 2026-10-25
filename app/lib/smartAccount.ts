// Executor de l'agent (server-only) : transfer USDC depuis le smart account, signé par la clé agent.
import "server-only";
import type { Intent } from "./llm";

// Erreur de la spending-limit policy OZ quand le plafond est dépassé.
export const SPENDING_LIMIT_EXCEEDED = 2221;

export type ExecuteResult =
  | { status: "submitted"; hash: string }
  | { status: "needs_owner_approval"; unsignedXdr: string }
  | { status: "ok"; data: unknown }
  | { status: "not_implemented" };

export function agentSecret() {
  const key = process.env.AGENT_SECRET_KEY;
  if (!key) throw new Error("AGENT_SECRET_KEY manquant");
  return key;
}

export async function executeIntent(intent: Intent): Promise<ExecuteResult> {
  // TODO (P1) :
  // - pay : construire l'appel transfer USDC depuis SMART_ACCOUNT_ID, signer l'auth entry avec
  //   la clé agent, simuler, envoyer ; si la simulation renvoie #2221 →
  //   { status: "needs_owner_approval", unsignedXdr }
  // - balance / history : lecture via RPC
  void intent;
  return { status: "not_implemented" };
}
