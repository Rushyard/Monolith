"use client";

// Raisonnement de l'agent, à la manière d'Orchestra : ce que le Planner a compris,
// ce que le Gatekeeper a décidé et pourquoi, puis ce qui s'est passé on-chain.
import { short, type IntentResponse } from "./types";

const VERDICT_LABEL: Record<string, string> = {
  AUTO_EXECUTE: "✅ Exécution automatique (dans le budget)",
  NEEDS_APPROVAL: "✋ Accord de l'owner nécessaire",
  BLOCKED: "⛔ Bloqué",
  INFO: "ℹ️ Simple consultation",
};

function describeStep(s: NonNullable<IntentResponse["plan"]>["steps"][number]): string {
  if (s.action === "pay") return `Payer ${s.amount} ${s.asset} à ${s.to.startsWith("G") && s.to.length === 56 ? short(s.to) : s.to}`;
  if (s.action === "balance") return "Consulter le solde et le budget de l'agent";
  if (s.action === "topup") return `Recharger le compte de l'agent de ${s.amount} ${s.asset} (depuis le smart account)`;
  if (s.action === "market_data") return "Acheter les données de marché premium (x402)";
  return "Consulter l'historique des paiements de l'agent";
}

export function AgentReasoning({ response }: { response: IntentResponse }) {
  const { plan, verdict, result } = response;
  const source = plan?.source ?? response.planner;

  return (
    <div className="p1-reasoning" style={box}>
      <Section title={`1. Planner${source ? ` (${source === "llm" ? "LLM" : "secours sans LLM"})` : ""}`}>
        {plan ? (
          <>
            <ul style={ul}>
              {plan.steps.map((s, i) => (
                <li key={i}>{describeStep(s)}</li>
              ))}
            </ul>
            {plan.reasoning && <p style={muted}>{plan.reasoning}</p>}
          </>
        ) : (
          <p style={muted}>{"text" in result ? result.text : "Aucun plan."}</p>
        )}
      </Section>

      {verdict && (
        <Section title="2. Gatekeeper (pré-check, la vraie barrière est on-chain)">
          <p style={{ margin: "2px 0", fontWeight: 600 }}>{VERDICT_LABEL[verdict.verdict] ?? verdict.verdict}</p>
          <ul style={ul}>
            {verdict.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {verdict.triggered.length > 0 && <p style={muted}>Règles : {verdict.triggered.join(", ")}</p>}
          {verdict.budget && (
            <p style={muted}>
              Budget on-chain : {verdict.budget.spentUsdc} / {verdict.budget.limitUsdc} USDC dépensés, {verdict.budget.remainingUsdc} restants
            </p>
          )}
        </Section>
      )}

      <Section title="3. Réseau Stellar">
        <Outcome response={response} />
      </Section>
    </div>
  );
}

function Outcome({ response }: { response: IntentResponse }) {
  const r = response.result;
  switch (r.status) {
    case "submitted":
      return (
        <p style={p}>
          Payé par l&apos;agent (règle {r.rule}).{" "}
          <a href={r.explorerUrl} target="_blank" rel="noreferrer">
            Voir la transaction ↗
          </a>
        </p>
      );
    case "needs_owner_approval":
      return (
        <p style={p}>
          {r.agentAttempt?.simulationCode === 3221 ? "Signature de l'agent refusée par le réseau : #3221 SpendingLimitExceeded. " : ""}
          {r.agentAttempt?.rejectedTx && (
            <a href={r.agentAttempt.rejectedTx.explorerUrl} target="_blank" rel="noreferrer">
              Tentative rejetée on-chain ↗{" "}
            </a>
          )}
          Transaction préparée pour l&apos;owner (règle {r.rule}).
        </p>
      );
    case "topped_up":
      return (
        <p style={p}>
          {r.amountUsdc} USDC virés du smart account vers le compte de l&apos;agent {short(r.agentAddress)} (règle {r.rule}, compté dans le budget)
          {r.agentUsdc !== null ? `, solde de l'agent : ${r.agentUsdc} USDC` : ""}.{" "}
          <a href={r.explorerUrl} target="_blank" rel="noreferrer">
            Voir la transaction ↗
          </a>
        </p>
      );
    case "x402_paid":
      return (
        <div style={p}>
          <p style={p}>
            Payé {r.priceUsdc} USDC en x402 depuis le compte de l&apos;agent {short(r.payer)} vers {short(r.payTo)}.{" "}
            {r.settlement?.explorerUrl && (
              <a href={r.settlement.explorerUrl} target="_blank" rel="noreferrer">
                Voir le règlement ↗
              </a>
            )}
          </p>
          <ul style={ul}>
            {r.data.pairs.map((d) => (
              <li key={d.pair}>
                {d.pair} : {d.price} ({d.change24hPct > 0 ? "+" : ""}
                {d.change24hPct} % sur 24 h)
              </li>
            ))}
          </ul>
          <p style={muted}>{r.data.disclaimer}</p>
        </div>
      );
    case "needs_topup":
      return <p style={p}>{r.text}</p>;
    case "info":
      return (
        <div style={p}>
          {r.balance && (
            <p style={p}>
              Smart account : <b>{r.balance.smartAccountUsdc} USDC</b>. Budget agent : {r.balance.budget.remainingUsdc} / {r.balance.budget.limitUsdc} USDC restants.
            </p>
          )}
          {r.history &&
            (r.history.payments.length ? (
              <ul style={ul}>
                {r.history.payments.map((h, i) => (
                  <li key={i}>
                    {h.amountUsdc} USDC au ledger {h.ledger} (sort du budget au ledger {h.freedAtLedger})
                  </li>
                ))}
              </ul>
            ) : (
              <p style={p}>Aucun paiement de l&apos;agent dans la fenêtre de 24 h.</p>
            ))}
        </div>
      );
    case "blocked":
      return <p style={p}>Rien n&apos;a été envoyé.</p>;
    case "error":
      return <p style={{ ...p, color: "var(--p1-err, #d0443e)" }}>Erreur : {r.error}</p>;
    default:
      return <p style={p}>Rien n&apos;a été envoyé.</p>;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 }}>{title}</div>
      {children}
    </div>
  );
}

const box: React.CSSProperties = { borderLeft: "2px solid var(--p1-border, #888)", padding: "4px 12px", margin: "8px 0", maxWidth: 620 };
const ul: React.CSSProperties = { margin: "2px 0", paddingLeft: 18 };
const p: React.CSSProperties = { margin: "2px 0", lineHeight: 1.45 };
const muted: React.CSSProperties = { ...p, opacity: 0.75, fontSize: 14 };

export default AgentReasoning;
