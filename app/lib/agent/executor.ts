// Executor (server-only) : exécute le verdict du gatekeeper sur le smart account.
//   AUTO_EXECUTE   → l'agent signe (règle B) ; si le réseau répond #3221, bascule vers l'owner.
//   NEEDS_APPROVAL → XDR non signé pour la règle A (owner = source de la tx, Freighter signe l'enveloppe).
//                    Si c'est le budget qui bloque, on fait d'abord tenter l'agent pour avoir la
//                    preuve que c'est le réseau qui refuse (#3221 on-chain).
import "server-only";
import { AGENT_CONFIG, agentKeypair, agentRuleId } from "./config";
import {
  Address,
  SPENDING_LIMIT_EXCEEDED,
  fromUsdc,
  invokeAsSmartAccount,
  invokeAsSmartAccountUnsigned,
  nativeToScVal,
  prepareSmartAccountCall,
  readSpendingState,
  rpc,
  simulationErrorCode,
  readTokenBalance,
  submitForOnchainRejection,
  txLink,
  usdc,
  type SmartAccountCall,
  type SpendingState,
} from "./core";
import type { VaultSignatureRequest } from "../../components/agent/types";
import type { GateDecision } from "./gatekeeper";
import type { Plan } from "./planner";

const C = AGENT_CONFIG;

export type AgentAttempt = {
  /** Code renvoyé par la simulation (3221 = SpendingLimitExceeded). */
  simulationCode: number | null;
  /** Tx soumise malgré tout et rejetée on-chain (preuve), si activé. */
  rejectedTx?: { hash: string; explorerUrl: string; error: string };
};

export type ExecutionResult =
  | { status: "submitted"; hash: string; explorerUrl: string; signedBy: "agent"; rule: number }
  | {
      status: "needs_owner_approval";
      unsignedXdr: string;
      owner: string;
      rule: number;
      validUntilLedger: number;
      agentAttempt?: AgentAttempt;
    }
  | VaultSignatureRequest
  | { status: "blocked" }
  | { status: "info"; balance?: BalanceInfo; history?: HistoryInfo }
  | { status: "error"; error: string; agentAttempt?: AgentAttempt };

export type BalanceInfo = { smartAccountUsdc: number; budget: { limitUsdc: number; spentUsdc: number; remainingUsdc: number; periodLedgers: number } };
export type HistoryInfo = { payments: { amountUsdc: number; ledger: number; freedAtLedger: number }[]; contractUrl: string };

export async function readAgentSpending(): Promise<SpendingState | null> {
  try {
    return await readSpendingState(C.ownerAddress, C.spendingLimitPolicy, C.smartAccount, await agentRuleId());
  } catch (err) {
    console.error("[executor] lecture du budget impossible", err);
    return null;
  }
}

async function transferCall(amount: bigint, to: string, who: "agent" | "owner"): Promise<SmartAccountCall> {
  const agent = who === "agent" ? agentKeypair() : null;
  return {
    contract: C.usdcSac,
    fn: "transfer",
    args: [new Address(C.smartAccount).toScVal(), new Address(to).toScVal(), nativeToScVal(amount, { type: "i128" })],
    smartAccount: C.smartAccount,
    ruleId: who === "agent" ? await agentRuleId() : C.ruleOwner,
    signer: agent
      ? { kind: "external", verifier: C.ed25519Verifier, keypair: agent }
      : { kind: "delegated-source", address: C.ownerAddress },
    source: agent ? agent.publicKey() : C.ownerAddress,
  };
}

/** Tente le paiement avec la clé agent pour obtenir le refus du réseau (#3221). */
async function agentRejectionProof(amount: bigint, to: string): Promise<AgentAttempt> {
  const call = await transferCall(amount, to, "agent");
  if (process.env.AGENT_PROVE_REJECTION === "false") {
    // Simulation seule : on n'envoie jamais un paiement que l'owner n'a pas approuvé.
    const { enforced } = await prepareSmartAccountCall(call);
    return { simulationCode: rpc.Api.isSimulationError(enforced) ? simulationErrorCode(enforced.error) : null };
  }
  const probe = [call.args[0], call.args[1], nativeToScVal(1n, { type: "i128" })];
  const res = await submitForOnchainRejection(call, probe, agentKeypair());
  return {
    simulationCode: res.simulationCode,
    rejectedTx: !res.ok && res.hash ? { hash: res.hash, explorerUrl: txLink(res.hash), error: res.error } : undefined,
  };
}

async function ownerApproval(amount: bigint, to: string, agentAttempt?: AgentAttempt): Promise<ExecutionResult> {
  const prepared = await invokeAsSmartAccountUnsigned(await transferCall(amount, to, "owner"));
  if (!prepared.ok) return { status: "error", error: `préparation de l'approbation owner : ${prepared.error}`, agentAttempt };
  return {
    status: "needs_owner_approval",
    unsignedXdr: prepared.unsignedXdr,
    owner: C.ownerAddress,
    rule: C.ruleOwner,
    validUntilLedger: prepared.validUntilLedger,
    agentAttempt,
  };
}

export async function execute(plan: Plan, decision: GateDecision, spending: SpendingState | null): Promise<ExecutionResult> {
  if (decision.verdict === "BLOCKED") return { status: "blocked" };

  // Coffre : l'agent n'a pas les clés de Sarah, il ne signe et ne prouve rien. Il prépare la liste.
  if (decision.verdict === "NEEDS_VAULT_SIGNATURE") {
    const { amountUsdc, recipient } = decision.payment!;
    return {
      status: "needs_vault_signature",
      payments: [{ to: recipient.address, label: recipient.label, amountUsdc }],
      totalUsdc: amountUsdc,
      reasons: decision.reasons,
    };
  }

  if (decision.verdict === "INFO") {
    const out: Extract<ExecutionResult, { status: "info" }> = { status: "info" };
    if (plan.steps.some((s) => s.action === "balance") && spending) {
      out.balance = {
        smartAccountUsdc: fromUsdc(await readTokenBalance(C.ownerAddress, C.usdcSac, C.smartAccount)),
        budget: {
          limitUsdc: fromUsdc(spending.limit),
          spentUsdc: fromUsdc(spending.spent),
          remainingUsdc: fromUsdc(spending.remaining),
          periodLedgers: spending.periodLedgers,
        },
      };
    }
    if (plan.steps.some((s) => s.action === "history") && spending) {
      out.history = {
        payments: spending.entries.map((e) => ({ amountUsdc: fromUsdc(e.amount), ledger: e.ledger, freedAtLedger: e.freedAtLedger })),
        contractUrl: `https://stellar.expert/explorer/testnet/contract/${C.smartAccount}`,
      };
    }
    return out;
  }

  const { amountUsdc, recipient } = decision.payment!;
  const amount = usdc(amountUsdc);

  if (decision.verdict === "AUTO_EXECUTE") {
    const call = await transferCall(amount, recipient.address, "agent");
    const res = await invokeAsSmartAccount(call, agentKeypair());
    if (res.ok) return { status: "submitted", hash: res.hash, explorerUrl: txLink(res.hash), signedBy: "agent", rule: call.ruleId };
    // Le pré-check s'est trompé (budget consommé entre-temps) : c'est la policy on-chain qui tranche.
    if (res.codes?.includes(SPENDING_LIMIT_EXCEEDED)) {
      return ownerApproval(amount, recipient.address, { simulationCode: SPENDING_LIMIT_EXCEEDED });
    }
    return { status: "error", error: `${res.stage} : ${res.error.split("\n")[0]}` };
  }

  // NEEDS_APPROVAL
  const agentAttempt = decision.triggered.includes("spending-limit") ? await agentRejectionProof(amount, recipient.address) : undefined;
  return ownerApproval(amount, recipient.address, agentAttempt);
}
