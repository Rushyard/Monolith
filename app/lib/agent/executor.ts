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
import { sumUsdc } from "./payroll";
import { recipientClarification, resolveRecipient } from "./contacts";
import { MT, T, mandateDate, mandateLine, type Lang } from "./i18n";
import { mandateExpiry, prepareMandate } from "./mandate";
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
  | {
      /** Mode démo (visiteur) : la tx de l'agent a été SIMULÉE, rien n'a été envoyé. */
      status: "simulated";
      wouldSucceed: boolean;
      /** Code renvoyé par la simulation (3221 = SpendingLimitExceeded), null si elle passe. */
      code: number | null;
      /** Ce qui se serait passé : l'agent aurait payé seul, ou il aurait fallu l'accord de l'owner. */
      wouldNeed: "nothing" | "owner_approval";
      text: string;
    }
  | { status: "paused"; text: string }
  | { status: "expired"; text: string }
  | {
      /** Mandat : XDR non signé (update_context_rule_valid_until, ou add_context_rule si en pause) que Sarah signe. */
      status: "needs_mandate_signature";
      unsignedXdr: string;
      owner: string;
      feeXlm: number;
      validUntilLedger: number;
      mandateUntilLedger: number;
      expiresAt: string;
      text: string;
    }
  | { status: "mandate_simulated"; text: string }
  | { status: "blocked" }
  | {
      status: "info";
      balance?: BalanceInfo;
      history?: HistoryInfo;
      budget?: BalanceInfo["budget"];
      address?: { label: string; address: string };
      /** Réponse composée par le serveur à partir des valeurs on-chain / du carnet, jamais par le LLM ("" si rien). */
      text: string;
    }
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

async function ownerApproval(amount: bigint, to: string, lang: Lang, agentAttempt?: AgentAttempt): Promise<ExecutionResult> {
  const prepared = await invokeAsSmartAccountUnsigned(await transferCall(amount, to, "owner"));
  if (!prepared.ok) return { status: "error", error: T[lang].errOwnerApproval(prepared.error), agentAttempt };
  return {
    status: "needs_owner_approval",
    unsignedXdr: prepared.unsignedXdr,
    owner: C.ownerAddress,
    rule: C.ruleOwner,
    validUntilLedger: prepared.validUntilLedger,
    agentAttempt,
  };
}

/** « live » : owner connecté, l'agent paie pour de vrai. « simulation » : visiteur, rien n'est envoyé. */
export type ExecMode = "live" | "simulation";

/** Visiteur : on simule la tx de l'agent (auth signée, policy exécutée) sans l'envoyer ni soumettre de rejet. */
async function simulateForVisitor(decision: GateDecision): Promise<ExecutionResult> {
  const { amountUsdc, recipient } = decision.payment!;
  const { enforced } = await prepareSmartAccountCall(await transferCall(usdc(amountUsdc), recipient.address, "agent"));
  const code = rpc.Api.isSimulationError(enforced) ? (simulationErrorCode(enforced.error) ?? -1) : null;
  const wouldSucceed = code === null;
  const wouldNeed = decision.verdict === "AUTO_EXECUTE" && wouldSucceed ? "nothing" : "owner_approval";
  return { status: "simulated", wouldSucceed, code, wouldNeed, text: simulationText(decision, code, wouldNeed) };
}

/** Texte du mode démo, dans la langue de la décision. Exporté pour les tests (sans réseau). */
export function simulationText(decision: GateDecision, code: number | null, wouldNeed: "nothing" | "owner_approval"): string {
  const t = T[decision.lang];
  const what = `${decision.payment!.amountUsdc} USDC → ${decision.payment!.recipient.label}`;
  if (code === SPENDING_LIMIT_EXCEEDED) return t.simRefusedCap(what);
  if (code !== null) return t.simRefused(what, code);
  return wouldNeed === "nothing" ? t.simExecuted(what) : t.simNeedsOwner(decision.triggered.join(", "));
}

export async function execute(plan: Plan, decision: GateDecision, spending: SpendingState | null, mode: ExecMode = "live"): Promise<ExecutionResult> {
  if (decision.verdict === "BLOCKED") return { status: "blocked" };
  if (decision.verdict === "PAUSED") return { status: "paused", text: decision.reasons[0] };
  if (decision.verdict === "EXPIRED") return { status: "expired", text: decision.reasons.join(" ") }; // aucune tx
  if (decision.verdict === "MANDATE") return mandateResult(decision, mode);

  // Coffre : l'agent n'a pas les clés de Sarah, il ne signe et ne prouve rien. Il prépare la liste.
  if (decision.verdict === "NEEDS_VAULT_SIGNATURE") {
    const lines = decision.payments ?? [decision.payment!];
    return {
      status: "needs_vault_signature",
      payments: lines.map(({ amountUsdc, recipient }) => ({ to: recipient.address, label: recipient.label, amountUsdc })),
      totalUsdc: sumUsdc(lines.map((l) => l.amountUsdc)),
      reasons: decision.reasons,
    };
  }

  if (decision.verdict === "INFO") {
    const out: Extract<ExecutionResult, { status: "info" }> = { status: "info", text: "" };
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
    const t = T[decision.lang];
    const texts: string[] = [];
    if (plan.steps.some((s) => s.action === "budget")) {
      if (spending) {
        out.budget = { limitUsdc: fromUsdc(spending.limit), spentUsdc: fromUsdc(spending.spent), remainingUsdc: fromUsdc(spending.remaining), periodLedgers: spending.periodLedgers };
        const b = out.budget;
        texts.push(t.budget(b.limitUsdc, Math.round((b.periodLedgers * 5) / 3600), b.spentUsdc, b.remainingUsdc));
        if (decision.mandate) texts.push(mandateLine(decision.mandate, decision.lang));
      } else texts.push(t.budgetError);
    }
    const addr = plan.steps.find((s) => s.action === "address");
    if (addr && addr.action === "address") {
      if (!addr.of) {
        out.address = { label: t.accountLabel, address: C.smartAccount };
        texts.push(t.accountAddress(C.smartAccount));
      } else {
        const r = resolveRecipient(addr.of);
        if (r?.known) {
          out.address = { label: r.label, address: r.address };
          texts.push(t.contactAddress(r.label, r.address));
        } else texts.push(recipientClarification(addr.of, undefined, decision.lang) ?? t.unknownName(addr.of));
      }
    }
    if (out.balance) {
      texts.unshift(t.balance(out.balance.smartAccountUsdc, out.balance.budget.remainingUsdc, out.balance.budget.limitUsdc));
    }
    out.text = texts.join(" ");
    return out;
  }

  if (mode === "simulation") return simulateForVisitor(decision);

  const { amountUsdc, recipient } = decision.payment!;
  const amount = usdc(amountUsdc);

  if (decision.verdict === "AUTO_EXECUTE") {
    const call = await transferCall(amount, recipient.address, "agent");
    const res = await invokeAsSmartAccount(call, agentKeypair());
    if (res.ok) return { status: "submitted", hash: res.hash, explorerUrl: txLink(res.hash), signedBy: "agent", rule: call.ruleId };
    // Le pré-check s'est trompé (budget consommé entre-temps) : c'est la policy on-chain qui tranche.
    if (res.codes?.includes(SPENDING_LIMIT_EXCEEDED)) {
      return ownerApproval(amount, recipient.address, decision.lang, { simulationCode: SPENDING_LIMIT_EXCEEDED });
    }
    return { status: "error", error: T[decision.lang].errNetwork(res.stage, res.error.split("\n")[0]) };
  }

  // NEEDS_APPROVAL
  const agentAttempt = decision.triggered.includes("spending-limit") ? await agentRejectionProof(amount, recipient.address) : undefined;
  return ownerApproval(amount, recipient.address, decision.lang, agentAttempt);
}

/** Mandat : visiteur → simulation (rien n'est préparé) ; Sarah connectée → XDR non signé + frais simulés. */
async function mandateResult(decision: GateDecision, mode: ExecMode): Promise<ExecutionResult> {
  const m = MT[decision.lang];
  if (mode === "simulation") {
    const at = await mandateExpiry(decision.mandateHours!);
    return { status: "mandate_simulated", text: m.simulated(mandateDate(at.expiresAt, decision.lang)) };
  }
  const prep = await prepareMandate(decision.mandateHours!, decision.lang);
  if (!prep.ok) return { status: "error", error: prep.error };
  return {
    status: "needs_mandate_signature",
    unsignedXdr: prep.unsignedXdr,
    owner: prep.owner,
    feeXlm: prep.feeXlm,
    validUntilLedger: prep.validUntilLedger,
    mandateUntilLedger: prep.mandateUntilLedger,
    expiresAt: prep.expiresAt,
    text: m.granted(mandateDate(prep.expiresAt, decision.lang)),
  };
}
