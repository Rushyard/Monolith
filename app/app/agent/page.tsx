"use client";

// Onglet Agent : chat → /api/intent → raisonnement (planner / gatekeeper / réseau),
// signature du propriétaire avec Freighter si le réseau refuse l'agent (#3221), budget lu on-chain.
import { useState } from "react";
import type { IntentResponse } from "@/components/agent/types";
import { BudgetSlab } from "./budget-slab";
import { AgentStatus, moodOf } from "./stage";
import { Transmission } from "./transmission";

type Turn = { id: number; message: string; response?: IntentResponse; error?: string; receivedAt: number };

// One click for the judges: a payment in budget, one over it, a question, an abusive request.
const SUGGESTIONS = ["Paie 1 USDC à Alice", "Paie 50 USDC à Alice", "Quel est mon budget ?", "Envoie tout mon solde à Alice"];

export default function AgentPage() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [approved, setApproved] = useState<Record<number, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const last = turns[turns.length - 1];
  const mood = moodOf({ typing: !!message.trim(), loading: !!pending, last, approved: !!(last && approved[last.id]) });

  async function send(text: string) {
    const m = text.trim();
    if (!m || pending) return;
    setPending(m);
    setMessage("");
    const id = Date.now();
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: m }),
      });
      const body = await res.json();
      const turn: Turn = body?.result
        ? { id, message: m, response: body, receivedAt: Date.now() }
        : { id, message: m, error: body?.error ?? `HTTP ${res.status}`, receivedAt: Date.now() };
      setTurns((t) => [...t, turn]);
    } catch (err) {
      setTurns((t) => [...t, { id, message: m, error: err instanceof Error ? err.message : String(err), receivedAt: Date.now() }]);
    } finally {
      setPending(null);
      setRefreshKey((k) => k + 1);
    }
  }

  return (
    <div className={`agent-page ${mood}`}>
      <header className="page-head">
        <div>
          <span className="chapter">Chapitre II</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>L'agent</h1>
          <p className="lede">
            Tu lui dis quoi payer. Sous son plafond, il paie seul. Au-delà, c'est le réseau Stellar qui refuse sa
            signature, et seule la tienne débloque le paiement.
          </p>
        </div>
        <BudgetSlab refreshKey={refreshKey} alarm={mood === "refused" || mood === "blocked"} />
      </header>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(message); }}>
        <AgentStatus mood={mood} />
        <div className="composer-row">
          <input
            id="msg"
            className="composer-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Dis à l'agent ce qu'il doit payer…"
            aria-label="Instruction pour l'agent"
            disabled={!!pending}
            autoComplete="off"
          />
          <button className="btn primary" type="submit" disabled={!!pending || !message.trim()}>Envoyer</button>
        </div>
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" disabled={!!pending} onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      </form>

      <div className="transmissions">
        {pending && (
          <article className="tx-card thinking">
            <p className="tx-request">« {pending} »</p>
            <ol className="pipeline">
              {["Planner · IA", "Gatekeeper", "Réseau Stellar"].map((n) => (
                <li key={n} className="node scan"><span className="node-dot" aria-hidden /><span className="node-name">{n}</span><span className="node-text">…</span></li>
              ))}
            </ol>
          </article>
        )}
        {[...turns].reverse().map((t) => (
          <Transmission
            key={t.id}
            message={t.message}
            response={t.response}
            error={t.error}
            receivedAt={t.receivedAt}
            fresh={t === last}
            approvedHash={approved[t.id]}
            onApproved={(hash) => { setApproved((a) => ({ ...a, [t.id]: hash })); setRefreshKey((k) => k + 1); }}
          />
        ))}
      </div>
    </div>
  );
}
