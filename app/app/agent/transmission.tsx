"use client";

// One request to the agent, told as a transmission: the request, the three stages it went
// through (planner → gatekeeper → Stellar network), the verdict, and the owner's signature if
// the network refused the agent. Technical details stay folded.
import { useOwnerApproval } from "@/components/agent/ApprovalCard";
import { short, type IntentResponse, type OwnerApproval } from "@/components/agent/types";
import { outcomeOf, type Mood } from "./stage";

type Tone = "ok" | "warn" | "bad" | "idle";
type Node = { name: string; text: string; tone: Tone };

function stepText(s: NonNullable<IntentResponse["plan"]>["steps"][number]): string {
  if (s.action === "pay") return `Payer ${s.amount} ${s.asset} à ${s.to.startsWith("G") && s.to.length === 56 ? short(s.to) : s.to}`;
  if (s.action === "balance") return "Lire le solde et le budget";
  return "Lire l'historique des paiements";
}

function nodes(res: IntentResponse, outcome: Mood): Node[] {
  const { plan, verdict, result } = res;
  const planner: Node = { name: "Planner · IA", text: plan ? plan.steps.map(stepText).join(" · ") : "Pas d'action à faire", tone: plan ? "ok" : "idle" };
  const gate: Node = !verdict
    ? { name: "Gatekeeper", text: "Rien à vérifier", tone: "idle" }
    : verdict.verdict === "AUTO_EXECUTE" ? { name: "Gatekeeper", text: "Dans le budget", tone: "ok" }
    : verdict.verdict === "NEEDS_APPROVAL" ? { name: "Gatekeeper", text: "Dépasse le plafond : accord requis", tone: "warn" }
    : verdict.verdict === "BLOCKED" ? { name: "Gatekeeper", text: "Bloqué avant le réseau", tone: "bad" }
    : { name: "Gatekeeper", text: "Simple consultation", tone: "ok" };
  const net: Node =
    outcome === "paid" ? { name: "Réseau Stellar", text: "Signature de l'agent acceptée", tone: "ok" }
    : outcome === "approved" ? { name: "Réseau Stellar", text: "Signé par le propriétaire", tone: "ok" }
    : outcome === "refused" ? { name: "Réseau Stellar", text: "Signature de l'agent refusée · #3221", tone: "bad" }
    : outcome === "pending" ? { name: "Réseau Stellar", text: "En attente du propriétaire", tone: "warn" }
    : outcome === "error" ? { name: "Réseau Stellar", text: "Erreur", tone: "bad" }
    : result.status === "info" ? { name: "Réseau Stellar", text: "Lecture on-chain", tone: "ok" }
    : { name: "Réseau Stellar", text: "Rien n'a été envoyé", tone: "idle" };
  return [planner, gate, net];
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
  const { phase, approve } = useOwnerApproval(approval, receivedAt, onApproved);
  if (phase.kind === "done") return null; // the verdict above switches to « approuvé »
  return (
    <div className="approve">
      <div className="approve-row">
        <div>
          <b>{amount ? `${amount} USDC` : "Ce paiement"}{label ? ` → ${label}` : ""}</b>
          <span>Seul le propriétaire {short(approval.owner)} peut le débloquer.</span>
        </div>
        <button className="btn primary" type="button" disabled={phase.kind === "working"} onClick={approve}>
          {phase.kind === "working" ? <span className="progress-dots">{phase.step.replace("…", "")}</span> : phase.kind === "error" && phase.retry ? "Réessayer" : "Signer avec Freighter"}
        </button>
      </div>
      {phase.kind === "error" && <p className="approve-error">{phase.message}</p>}
      <p className="fine">Démo publique : la signature est réservée au propriétaire du compte. On la montre dans la vidéo.</p>
    </div>
  );
}

function Verdict({ res, outcome, hash }: { res: IntentResponse; outcome: Mood; hash?: string }) {
  const r = res.result;
  const pay = res.verdict?.payment;
  const what = pay ? `${pay.amountUsdc} USDC → ${pay.recipient.label}` : "";
  const link = (href: string, text: string) => <a className="link" href={href} target="_blank" rel="noreferrer">{text} ↗</a>;
  switch (outcome) {
    case "paid":
      return <div className="verdict ok"><span className="verdict-label">Payé par l'agent</span><p>{what}, dans son plafond. {r.status === "submitted" && link(r.explorerUrl, "Transaction")}</p></div>;
    case "approved":
      return <div className="verdict ok"><span className="verdict-label">Approuvé par le propriétaire</span><p>{what}. {hash && link(`https://stellar.expert/explorer/testnet/tx/${hash}`, "Transaction")}</p></div>;
    case "refused":
      return (
        <div className="verdict bad">
          <span className="verdict-label">Refusé par le réseau</span>
          <p>
            Le plafond on-chain de l'agent est dépassé : Stellar a rejeté sa signature (<code>#3221</code>).{" "}
            {r.status === "needs_owner_approval" && r.agentAttempt?.rejectedTx && link(r.agentAttempt.rejectedTx.explorerUrl, "Tentative rejetée")}
          </p>
        </div>
      );
    case "pending":
      return <div className="verdict warn"><span className="verdict-label">Ton accord est nécessaire</span><p>{res.verdict?.reasons[0]}</p></div>;
    case "blocked":
      return <div className="verdict bad"><span className="verdict-label">Bloqué</span><p>{res.verdict?.reasons[0] ?? "Demande refusée."} Rien n'a été envoyé.</p></div>;
    case "error":
      return <div className="verdict bad"><span className="verdict-label">Erreur</span><p>{r.status === "error" ? r.error : ""}</p></div>;
    default: {
      let text = "text" in r ? r.text : "";
      if (r.status === "info" && r.balance) text = `Compte de l'agent : ${r.balance.smartAccountUsdc} USDC. Budget : ${r.balance.budget.remainingUsdc} / ${r.balance.budget.limitUsdc} USDC restants.`;
      if (r.status === "info" && r.history) text += r.history.payments.length ? ` ${r.history.payments.length} paiement(s) dans la fenêtre de 24 h.` : " Aucun paiement dans la fenêtre de 24 h.";
      return <div className="verdict"><span className="verdict-label">Réponse</span><p>{text}</p></div>;
    }
  }
}

export function Transmission({ message, response, error, receivedAt, fresh, approvedHash, onApproved }: {
  message: string; response?: IntentResponse; error?: string; receivedAt: number; fresh: boolean;
  approvedHash?: string; onApproved: (hash: string) => void;
}) {
  const outcome = outcomeOf({ response, error }, !!approvedHash);
  const r = response?.result;
  return (
    <article className={`tx-card ${outcome} ${fresh ? "fresh" : ""}`}>
      <p className="tx-request">« {message} »</p>
      {error && <div className="verdict bad"><span className="verdict-label">Erreur</span><p>{error}</p></div>}
      {response && (
        <>
          <Pipeline items={nodes(response, outcome)} />
          <Verdict res={response} outcome={outcome} hash={approvedHash} />
          {r?.status === "needs_owner_approval" && !approvedHash && (
            <Approve approval={r} receivedAt={receivedAt} amount={response.verdict?.payment?.amountUsdc}
              label={response.verdict?.payment?.recipient.label} onApproved={onApproved} />
          )}
          <details className="tx-details">
            <summary>Détails techniques</summary>
            {response.plan?.reasoning && <p>Planner : {response.plan.reasoning} ({response.plan.source === "llm" ? "LLM" : "secours sans LLM"})</p>}
            {response.verdict?.reasons.map((x, i) => <p key={i}>Gatekeeper : {x}</p>)}
            {!!response.verdict?.triggered.length && <p>Règles déclenchées : {response.verdict.triggered.join(", ")}</p>}
            {response.verdict?.budget && <p>Budget on-chain : {response.verdict.budget.spentUsdc} / {response.verdict.budget.limitUsdc} USDC dépensés</p>}
            {r?.status === "needs_owner_approval" && <p>Transaction préparée pour le propriétaire {short(r.owner)} (règle {r.rule}), valable jusqu'au ledger {r.validUntilLedger}.</p>}
            {outcome === "refused" && <p>Erreur du contrat : #3221 SpendingLimitExceeded (spending-limit policy OpenZeppelin).</p>}
            {r?.status === "submitted" && <p>Signée par l'agent (règle {r.rule}) · {r.hash}</p>}
          </details>
        </>
      )}
    </article>
  );
}
