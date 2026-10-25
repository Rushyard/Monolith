"use client";

// Agent tab: chat → /api/intent → reasoning (planner / gatekeeper / network), the owner's
// Freighter signature when the network refuses the agent (#3221), budget read on-chain.
import { useState } from "react";
import type { IntentResponse } from "@/components/agent/types";
import { BudgetSlab } from "./budget-slab";
import { AgentStatus, moodOf } from "./stage";
import { Transmission } from "./transmission";
import { useI18n } from "@/lib/i18n/react";

type Turn = { id: number; message: string; response?: IntentResponse; error?: string; receivedAt: number };

// One click for the judges: a payment in budget, one over it, a question, an abusive request.
const SUGGESTIONS = ["agent.s1", "agent.s2", "agent.s3", "agent.s4"] as const;

export default function AgentPage() {
  const { t } = useI18n();
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
        // Derniers tours : le serveur s'en sert seulement pour compléter la réponse à ses propres questions.
        body: JSON.stringify({
          message: m,
          history: turns.slice(-6).flatMap((t) => [
            { role: "user", text: t.message },
            ...(t.response?.result && "text" in t.response.result ? [{ role: "assistant", text: t.response.result.text }] : []),
          ]),
        }),
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
          <span className="chapter">{t("chapter.n", { n: "II" })}</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>{t("ch.agent")}</h1>
          <p className="lede">{t("agent.lede")}</p>
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
            placeholder={t("agent.placeholder")}
            aria-label={t("agent.inputLabel")}
            disabled={!!pending}
            autoComplete="off"
          />
          <button className="btn primary" type="submit" disabled={!!pending || !message.trim()}>{t("agent.send")}</button>
        </div>
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" disabled={!!pending} onClick={() => send(t(s))}>{t(s)}</button>
          ))}
        </div>
      </form>

      <div className="transmissions">
        {pending && (
          <article className="tx-card thinking">
            <p className="tx-request">« {pending} »</p>
            <ol className="pipeline">
              {(["node.planner", "node.gate", "node.net"] as const).map((n) => (
                <li key={n} className="node scan"><span className="node-dot" aria-hidden /><span className="node-name">{t(n)}</span><span className="node-text">…</span></li>
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
