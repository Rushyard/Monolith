"use client";

// Onglet Agent : chat → /api/intent → raisonnement (planner / gatekeeper / réseau),
// carte d'approbation Freighter si le réseau refuse l'agent (#3221), budget lu on-chain.
import { useState } from "react";
import { AgentReasoning } from "@/components/agent/AgentReasoning";
import { ApprovalCard } from "@/components/agent/ApprovalCard";
import { BudgetBar } from "@/components/agent/BudgetBar";
import type { IntentResponse } from "@/components/agent/types";

type Turn = { message: string; response?: IntentResponse; error?: string; receivedAt: number };

// Les composants P1 lisent ces variables ; on les branche sur la palette de l'app.
const theme = {
  "--p1-border": "var(--line-strong)",
  "--p1-err": "var(--hal)",
  "--p1-ok": "var(--ok)",
  "--p1-fill": "var(--sun)",
  "--p1-track": "var(--line)",
} as React.CSSProperties;

export default function AgentPage() {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const m = message.trim();
    if (!m) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: m }),
      });
      const body = await res.json();
      const turn: Turn = body?.result
        ? { message: m, response: body, receivedAt: Date.now() }
        : { message: m, error: body?.error ?? `HTTP ${res.status}`, receivedAt: Date.now() };
      setTurns((t) => [...t, turn]);
    } catch (err) {
      setTurns((t) => [...t, { message: m, error: err instanceof Error ? err.message : String(err), receivedAt: Date.now() }]);
    } finally {
      setLoading(false);
      setRefreshKey((k) => k + 1);
    }
  }

  return (
    <div style={theme}>
      <header className="page-head">
        <div>
          <span className="chapter">Chapitre II</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>L'agent</h1>
          <p className="lede">
            L'agent paie seul sous son plafond. Au-delà, c'est le réseau Stellar qui refuse la transaction —
            seule ta signature débloque.
          </p>
        </div>
        <div className="hal-eye" aria-hidden />
      </header>

      <div className="panel">
        <BudgetBar refreshKey={refreshKey} />
      </div>

      {turns.map((t, i) => {
        const r = t.response?.result;
        const pay = t.response?.verdict?.payment;
        return (
          <section key={i} className="panel">
            <div className="mono" style={{ color: "var(--muted)" }}>› {t.message}</div>
            {t.error && <p style={{ color: "var(--hal)" }}>Erreur : {t.error}</p>}
            {t.response && <AgentReasoning response={t.response} />}
            {r?.status === "needs_owner_approval" && (
              <>
                <ApprovalCard
                  approval={r}
                  amountUsdc={pay?.amountUsdc}
                  recipientLabel={pay?.recipient.label}
                  receivedAt={t.receivedAt}
                  onApproved={() => setRefreshKey((k) => k + 1)}
                />
                <p style={{ fontSize: 13, color: "var(--faint)", margin: "6px 0 0" }}>
                  Sur la démo publique, l'approbation est réservée à l'owner du compte (voir la vidéo). La tentative de
                  l'agent rejetée par le réseau est visible ci-dessus.
                </p>
              </>
            )}
          </section>
        );
      })}

      <form onSubmit={send} className="panel op">
        <div className="field">
          <label htmlFor="msg">Instruction</label>
          <input
            id="msg"
            className="input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paie 1 USDC à Alice"
            disabled={loading}
          />
        </div>
        <button className="btn hal" type="submit" disabled={loading || !message.trim()}>
          {loading ? <span className="progress-dots">Envoi</span> : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
