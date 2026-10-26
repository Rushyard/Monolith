"use client";

// One request to the agent, told as a transmission: the request, the three stages it went
// through (planner → gatekeeper → Stellar network), the verdict, and the owner's signature if
// the network refused the agent. Technical details (server messages) stay folded.
import { useOwnerApproval } from "@/components/agent/ApprovalCard";
import { VaultPayCard } from "@/components/agent/VaultPayCard";
import { MandateCard } from "@/components/agent/MandateBadge";
import { SweepCard } from "@/components/agent/SweepCard";
// --- liquidity (P1) ---
import { LiquidityCard } from "@/components/agent/LiquidityCard";
import { LT } from "@/lib/agent/i18n";
// --- fin liquidity (P1) ---
import { short, type IntentResponse, type OwnerApproval } from "@/components/agent/types";
import { useI18n } from "@/lib/i18n/react";
import { outcomeOf, type Mood } from "./stage";

type T = ReturnType<typeof useI18n>["t"];
type Tone = "ok" | "warn" | "bad" | "idle";
type Node = { name: string; text: string; tone: Tone };

function stepText(s: NonNullable<IntentResponse["plan"]>["steps"][number], t: T): string {
  if (s.action === "pay") return t("step.pay", { amount: s.amount, asset: s.asset, to: s.to.startsWith("G") && s.to.length === 56 ? short(s.to) : s.to });
  if (s.action === "balance") return t("step.balance");
  if (s.action === "payroll") return t("step.payroll");
  if (s.action === "budget") return t("step.budget");
  if (s.action === "mandate") return t("step.mandate");
  if (s.action === "address") return s.of ? t("step.addressOf", { of: s.of }) : t("step.address");
  if (s.action === "mandate") return t("step.mandate");
  return t("step.history");
}

function nodes(res: IntentResponse, outcome: Mood, t: T): Node[] {
  const { plan, verdict, result } = res;
  const gate = t("node.gate"), net = t("node.net");
  const planner: Node = { name: t("node.planner"), text: plan ? plan.steps.map((s) => (s.action === "plan_liquidity" ? LT[res.lang ?? "en"].plannerStep /* liquidity (P1) */ : stepText(s, t))).join(" · ") : t("plan.none"), tone: plan ? "ok" : "idle" };
  const g: Node = !verdict
    ? { name: gate, text: t("gate.none"), tone: "idle" }
    : verdict.verdict === "AUTO_EXECUTE" ? { name: gate, text: t("gate.auto"), tone: "ok" }
    : verdict.verdict === "NEEDS_APPROVAL" ? { name: gate, text: t("gate.approval"), tone: "warn" }
    : verdict.verdict === "BLOCKED" ? { name: gate, text: t("gate.blocked"), tone: "bad" }
    : verdict.verdict === "NEEDS_VAULT_SIGNATURE" ? { name: gate, text: t("gate.vault"), tone: "warn" }
    : verdict.verdict === "PAUSED" ? { name: gate, text: t("gate.paused"), tone: "warn" }
    : verdict.verdict === "EXPIRED" ? { name: gate, text: t("gate.expired"), tone: "bad" }
    : verdict.verdict === "MANDATE" ? { name: gate, text: t("gate.mandate"), tone: "warn" }
    // --- liquidity (P1) ---
    : verdict.verdict === "LIQUIDITY" ? { name: gate, text: LT[res.lang ?? "en"].gate, tone: "ok" }
    // --- fin liquidity (P1) ---
    : { name: gate, text: t("gate.info"), tone: "ok" };
  const vault = result.status === "needs_vault_signature";
  const n: Node =
    vault ? (outcome === "approved" ? { name: net, text: t("net.vaultDone"), tone: "ok" } : { name: net, text: t("net.vaultPending"), tone: "warn" })
    : result.status === "simulated" ? { name: net, text: result.code === 3221 ? t("net.simRefused") : t("net.simulated"), tone: result.wouldSucceed ? "idle" : "bad" }
    : result.status === "paused" || result.status === "expired" ? { name: net, text: t("net.nothing"), tone: "idle" }
    : result.status === "mandate_simulated" ? { name: net, text: t("net.simulated"), tone: "idle" }
    : result.status === "needs_mandate_signature" ? (outcome === "approved" ? { name: net, text: t("net.approved"), tone: "ok" } : { name: net, text: t("net.pending"), tone: "warn" })
    : outcome === "paid" ? { name: net, text: t("net.paid"), tone: "ok" }
    : outcome === "approved" ? { name: net, text: t("net.approved"), tone: "ok" }
    : outcome === "refused" ? { name: net, text: t("net.refused"), tone: "bad" }
    : outcome === "pending" ? { name: net, text: t("net.pending"), tone: "warn" }
    : outcome === "error" ? { name: net, text: t("net.error"), tone: "bad" }
    : result.status === "info" ? { name: net, text: t("net.info"), tone: "ok" }
    : { name: net, text: t("net.nothing"), tone: "idle" };
  return [planner, g, n];
}

function Pipeline({ items }: { items: Node[] }) {
  return (
    <ol className="pipeline">
      {items.map((n) => (
        <li key={n.name} className={`node ${n.tone}`}>
          <span className="node-dot" aria-hidden />
          <span className="node-name">{n.name}</span>
          <span className="node-text">{n.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Approve({ approval, receivedAt, amount, label, onApproved }: {
  approval: OwnerApproval; receivedAt: number; amount?: string; label?: string; onApproved: (hash: string) => void;
}) {
  const { t } = useI18n();
  const { phase, approve } = useOwnerApproval(approval, receivedAt, onApproved);
  if (phase.kind === "done") return null; // the verdict above switches to « approved »
  return (
    <div className="approve">
      <div className="approve-row">
        <div>
          <b>{amount ? `${amount} USDC` : t("approve.thisPayment")}{label ? ` → ${label}` : ""}</b>
          <span>{t("approve.who", { owner: short(approval.owner) })}</span>
        </div>
        <button className="btn primary" type="button" disabled={phase.kind === "working"} onClick={approve}>
          {phase.kind === "working" ? <span className="progress-dots">{phase.step.replace("…", "")}</span> : phase.kind === "error" && phase.retry ? t("approve.retry") : t("approve.btn")}
        </button>
      </div>
      <ul className="approve-facts">
        <li><b>{t("approve.whyLabel")}</b> {approval.agentAttempt?.simulationCode === 3221 ? t("approve.why3221") : t("approve.whyGate")}</li>
        <li><b>{t("approve.whatLabel")}</b> {t("approve.what")}</li>
        <li><b>{t("approve.untilLabel")}</b> {t("approve.until", { ledger: approval.validUntilLedger })}</li>
      </ul>
      {phase.kind === "error" && <p className="approve-error">{phase.message}</p>}
      <p className="fine">{t("approve.fine")}</p>
    </div>
  );
}

function Verdict({ res, outcome, hash }: { res: IntentResponse; outcome: Mood; hash?: string }) {
  const { t } = useI18n();
  const r = res.result;
  const pay = res.verdict?.payment;
  const what = pay ? `${pay.amountUsdc} USDC → ${pay.recipient.label}` : "";
  const link = (href: string, text: string) => <a className="link" href={href} target="_blank" rel="noreferrer">{text} ↗</a>;
  if (r.status === "simulated") {
    const w = what || t("approve.thisPayment");
    const text = r.code === 3221 ? t("sim.refused", { what: w })
      : r.code !== null ? t("sim.failed", { what: w, code: r.code })
      : r.wouldNeed === "nothing" ? t("sim.paid", { what: w })
      : t("sim.approval", { what: w });
    return <div className="verdict"><span className="verdict-label">{t("verdict.simulated")}</span><p>{text} {t("sim.nothingSent")}</p></div>;
  }
  if (r.status === "expired") {
    return <div className="verdict bad"><span className="verdict-label">{t("verdict.expired")}</span><p>{r.text}</p></div>;
  }
  if (r.status === "mandate_simulated") {
    return <div className="verdict"><span className="verdict-label">{t("verdict.simulated")}</span><p>{r.text}</p></div>;
  }
  if (r.status === "needs_mandate_signature") {
    return outcome === "approved"
      ? <div className="verdict ok"><span className="verdict-label">{t("verdict.mandateSigned")}</span><p>{r.text}</p></div>
      : <div className="verdict warn"><span className="verdict-label">{t("verdict.mandate")}</span></div>;
  }
  // --- liquidity (P1) ---
  if (r.status === "needs_vault_withdraw" || r.status === "liquidity_enough" || r.status === "liquidity_simulated") {
    const l = LT[res.lang ?? "en"];
    const signed = r.status === "needs_vault_withdraw" && outcome === "approved";
    const tone = r.status === "liquidity_simulated" ? "" : r.status === "liquidity_enough" || signed ? "ok" : "warn";
    const label = r.status === "liquidity_simulated" ? t("verdict.simulated") : l.verdict;
    return <div className={`verdict ${tone}`}><span className="verdict-label">{label}</span><p>{signed ? l.fine(r.amountUsdc) : r.text}</p></div>;
  }
  // --- fin liquidity (P1) ---
  if (r.status === "paused") {
    return <div className="verdict warn"><span className="verdict-label">{t("verdict.paused")}</span><p>{t("verdict.pausedText")}</p></div>;
  }
  if (r.status === "needs_vault_signature") {
    return outcome === "approved"
      ? <div className="verdict ok"><span className="verdict-label">{t("verdict.vaultDone")}</span><p>{t("verdict.vaultDoneText", { n: r.payments.length })}</p></div>
      : <div className="verdict warn"><span className="verdict-label">{t("verdict.vault")}</span><p>{t("verdict.vaultText")}</p></div>;
  }
  switch (outcome) {
    case "paid":
      return <div className="verdict ok"><span className="verdict-label">{t("verdict.paid")}</span><p>{t("verdict.paidText", { what })} {r.status === "submitted" && link(r.explorerUrl, t("verdict.tx"))}</p></div>;
    case "approved":
      return <div className="verdict ok"><span className="verdict-label">{t("verdict.approved")}</span><p>{what}. {hash && link(`https://stellar.expert/explorer/testnet/tx/${hash}`, t("verdict.tx"))}</p></div>;
    case "refused":
      return (
        <div className="verdict bad">
          <span className="verdict-label">{t("verdict.refused")}</span>
          <p>
            {t("verdict.refusedText")} (<code>#3221</code>).{" "}
            {r.status === "needs_owner_approval" && r.agentAttempt?.rejectedTx && link(r.agentAttempt.rejectedTx.explorerUrl, t("verdict.rejectedTx"))}
          </p>
        </div>
      );
    case "pending":
      return <div className="verdict warn"><span className="verdict-label">{t("verdict.pending")}</span><p>{t("verdict.pendingText")}</p></div>;
    case "blocked":
      return <div className="verdict bad"><span className="verdict-label">{t("verdict.blocked")}</span><p>{t("verdict.blockedText")}</p></div>;
    case "error":
      return <div className="verdict bad"><span className="verdict-label">{t("verdict.error")}</span><p>{r.status === "error" ? r.error : ""}</p></div>;
    default: {
      let text = "text" in r ? r.text : "";
      if (r.status === "info" && r.balance) text = t("reply.balance", { bal: r.balance.smartAccountUsdc, left: r.balance.budget.remainingUsdc, limit: r.balance.budget.limitUsdc });
      if (r.status === "info" && r.history) text += " " + (r.history.payments.length ? t("reply.history", { n: r.history.payments.length }) : t("reply.noHistory"));
      if (r.status === "info" && r.budget) text = t("reply.budget", { spent: r.budget.spentUsdc, limit: r.budget.limitUsdc, left: r.budget.remainingUsdc, h: Math.round((r.budget.periodLedgers * 5) / 3600) });
      if (r.status === "info" && r.address) {
        const own = res.plan?.steps.some((st) => st.action === "address" && !st.of);
        text = own ? t("reply.agentAddress", { address: r.address.address }) : t("reply.address", { label: r.address.label, address: r.address.address });
      }
      return <div className="verdict"><span className="verdict-label">{t("verdict.reply")}</span><p>{text.trim()}</p></div>;
    }
  }
}

export function Transmission({ message, response, error, receivedAt, fresh, approvedHash, onApproved }: {
  message: string; response?: IntentResponse; error?: string; receivedAt: number; fresh: boolean;
  approvedHash?: string; onApproved: (hash: string) => void;
}) {
  const { t } = useI18n();
  // --- liquidity (P1) : humeur des statuts du planificateur, sans toucher à stage.tsx ---
  const liq = response?.result.status;
  const outcome: Mood = liq === "needs_vault_withdraw" ? (approvedHash ? "approved" : "pending") : liq === "liquidity_simulated" ? "simulated" : outcomeOf({ response, error }, !!approvedHash);
  // --- fin liquidity (P1) ---
  const r = response?.result;
  return (
    <article className={`tx-card ${outcome} ${fresh ? "fresh" : ""}`}>
      <p className="tx-request"><q>{message}</q></p>
      {response?.mode === "simulation" && <p className="sim-tag">{t("sim.tag")}</p>}
      {error && <div className="verdict bad"><span className="verdict-label">{t("verdict.error")}</span><p>{error}</p></div>}
      {response && (
        <>
          <Pipeline items={nodes(response, outcome, t)} />
          <Verdict res={response} outcome={outcome} hash={approvedHash} />
          {r?.status === "needs_owner_approval" && !approvedHash && (
            <Approve approval={r} receivedAt={receivedAt} amount={response.verdict?.payment?.amountUsdc}
              label={response.verdict?.payment?.recipient.label} onApproved={onApproved} />
          )}
          {r?.status === "needs_mandate_signature" && !approvedHash && (
            <MandateCard result={r} receivedAt={receivedAt} onSigned={onApproved} />
          )}
          {r?.status === "expired" && <SweepCard />}
          {r?.status === "needs_vault_signature" && (
            <VaultPayCard request={r} onDone={(hashes) => onApproved(hashes[hashes.length - 1])} />
          )}
          {/* --- liquidity (P1) --- */}
          {r?.status === "needs_vault_withdraw" && <LiquidityCard request={r} onDone={onApproved} />}
          {/* --- fin liquidity (P1) --- */}
          <details className="tx-details">
            <summary>{t("det.title")}</summary>
            {response.plan?.reasoning && <p>{t("det.planner", { r: response.plan.reasoning, src: t(response.plan.source === "llm" ? "det.llm" : "det.fallback") })}</p>}
            {response.verdict?.reasons.map((x, i) => <p key={i}>{t("det.gate", { r: x })}</p>)}
            {!!response.verdict?.triggered.length && <p>{t("det.rules", { r: response.verdict.triggered.join(", ") })}</p>}
            {response.verdict?.budget && <p>{t("det.budget", { spent: response.verdict.budget.spentUsdc, limit: response.verdict.budget.limitUsdc })}</p>}
            {r?.status === "needs_owner_approval" && <p>{t("det.prepared", { owner: short(r.owner), rule: r.rule, ledger: r.validUntilLedger })}</p>}
            {outcome === "refused" && <p>{t("det.code")}</p>}
            {r?.status === "submitted" && <p>{t("det.signed", { rule: r.rule, hash: r.hash })}</p>}
          </details>
        </>
      )}
    </article>
  );
}
