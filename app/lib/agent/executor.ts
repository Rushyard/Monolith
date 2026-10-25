// Executor (server-only) : exécute le verdict du gatekeeper sur le smart account.
//   AUTO_EXECUTE   → l'agent signe (règle B) ; si le réseau répond #3221, bascule vers l'owner.
//   NEEDS_APPROVAL → XDR non signé pour la règle A (owner = source de la tx, Freighter signe l'enveloppe).
//                    Si c'est le budget qui bloque, on fait d'abord tenter l'agent pour avoir la
//                    preuve que c'est le réseau qui refuse (#3221 on-chain).
import "server-only";
import { AGENT_CONFIG, agentKeypair } from "./config";
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
import type { GateDecision } from "./gatekeeper";
import type { Plan } from "./planner";
import { createAgentX402Client, x402Get } from "../x402/client";
import { MARKET_DATA_PATH, MARKET_DATA_PRICE_USDC, X402_PAY_TO } from "../x402/config";
import type { MarketData } from "../x402/server";

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
  | { status: "topped_up"; hash: string; explorerUrl: string; amountUsdc: string; agentAddress: string; agentUsdc: number | null; rule: number }
  | {
      status: "x402_paid";
      data: MarketData;
      priceUsdc: string;
      payer: string;
      payTo: string;
      resource: string;
      settlement: { transaction: string; network: string; explorerUrl?: string } | null;
    }
  | { status: "needs_topup"; text: string; agentAddress: string; agentUsdc: number; priceUsdc: string }
  | { status: "blocked" }
  | { status: "info"; balance?: BalanceInfo; history?: HistoryInfo }
  | { status: "error"; error: string; agentAttempt?: AgentAttempt };

export type BalanceInfo = { smartAccountUsdc: number; budget: { limitUsdc: number; spentUsdc: number; remainingUsdc: number; periodLedgers: number } };
export type HistoryInfo = { payments: { amountUsdc: number; ledger: number; freedAtLedger: number }[]; contractUrl: string };

export async function readAgentSpending(): Promise<SpendingState | null> {
  try {
    return await readSpendingState(C.ownerAddress, C.spendingLimitPolicy, C.smartAccount, C.ruleAgent);
  } catch (err) {
    console.error("[executor] lecture du budget impossible", err);
    return null;
  }
}

function transferCall(amount: bigint, to: string, who: "agent" | "owner"): SmartAccountCall {
  const agent = who === "agent" ? agentKeypair() : null;
  return {
    contract: C.usdcSac,
    fn: "transfer",
    args: [new Address(C.smartAccount).toScVal(), new Address(to).toScVal(), nativeToScVal(amount, { type: "i128" })],
    smartAccount: C.smartAccount,
    ruleId: who === "agent" ? C.ruleAgent : C.ruleOwner,
    signer: agent
      ? { kind: "external", verifier: C.ed25519Verifier, keypair: agent }
      : { kind: "delegated-source", address: C.ownerAddress },
    source: agent ? agent.publicKey() : C.ownerAddress,
  };
}

/** Tente le paiement avec la clé agent pour obtenir le refus du réseau (#3221). */
async function agentRejectionProof(amount: bigint, to: string): Promise<AgentAttempt> {
  const call = transferCall(amount, to, "agent");
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
  const prepared = await invokeAsSmartAccountUnsigned(transferCall(amount, to, "owner"));
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

/** Topup (x402, option B) : USDC du smart account → compte G de l'agent, signé par l'agent (règle B). */
async function topupAgent(amountUsdc: string): Promise<ExecutionResult> {
  const agent = agentKeypair();
  const res = await invokeAsSmartAccount(transferCall(usdc(amountUsdc), agent.publicKey(), "agent"), agent);
  if (!res.ok) {
    const capped = res.codes?.includes(SPENDING_LIMIT_EXCEEDED);
    return { status: "error", error: capped ? "le réseau a refusé le topup : #3221 SpendingLimitExceeded (budget de l'agent épuisé)" : `${res.stage} : ${res.error.split("\n")[0]}` };
  }
  const agentUsdc = await readTokenBalance(agent.publicKey(), C.usdcSac, agent.publicKey()).then(fromUsdc, () => null);
  return { status: "topped_up", hash: res.hash, explorerUrl: txLink(res.hash), amountUsdc, agentAddress: agent.publicKey(), agentUsdc, rule: C.ruleAgent };
}

/**
 * Achat x402 des données de marché, payé par le compte G de l'agent. Seule la clé secrète
 * (string) passe à app/lib/x402 : le SDK v16 de @x402/stellar ne voit aucun objet v17.
 */
async function buyMarketData(origin: string): Promise<ExecutionResult> {
  const agent = agentKeypair();
  const agentAddress = agent.publicKey();
  const balance = fromUsdc(await readTokenBalance(agentAddress, C.usdcSac, agentAddress));
  if (balance < Number(MARKET_DATA_PRICE_USDC)) {
    return {
      status: "needs_topup",
      text: `Le compte de l'agent n'a que ${balance} USDC, il en faut ${MARKET_DATA_PRICE_USDC}. Demande-moi d'abord « recharge ton compte de 0.1 USDC ».`,
      agentAddress,
      agentUsdc: balance,
      priceUsdc: MARKET_DATA_PRICE_USDC,
    };
  }
  const { client } = createAgentX402Client(process.env.AGENT_SECRET_KEY!);
  const resource = new URL(MARKET_DATA_PATH, process.env.X402_RESOURCE_BASE_URL || origin).toString();
  const bought = await x402Get<MarketData>(resource, client);
  if (!bought.ok) return { status: "error", error: `x402 : ${bought.error}` };
  return {
    status: "x402_paid",
    data: bought.data,
    priceUsdc: MARKET_DATA_PRICE_USDC,
    payer: agentAddress,
    payTo: X402_PAY_TO,
    resource,
    settlement: bought.settlement,
  };
}

export type ExecuteContext = {
  /** Origine HTTP de la requête (ex. http://localhost:3000) : sert à appeler la route x402. */
  origin?: string;
};

export async function execute(plan: Plan, decision: GateDecision, spending: SpendingState | null, ctx: ExecuteContext = {}): Promise<ExecutionResult> {
  if (decision.verdict === "BLOCKED") return { status: "blocked" };
  if (decision.topup) return topupAgent(decision.topup.amountUsdc);
  if (decision.x402) return buyMarketData(ctx.origin ?? "http://localhost:3000");

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
    const res = await invokeAsSmartAccount(transferCall(amount, recipient.address, "agent"), agentKeypair());
    if (res.ok) return { status: "submitted", hash: res.hash, explorerUrl: txLink(res.hash), signedBy: "agent", rule: C.ruleAgent };
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
