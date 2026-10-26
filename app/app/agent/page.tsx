"use client";

// Agent tab: chat → /api/intent → reasoning (planner / gatekeeper / network), the owner's
// Freighter signature when the network refuses the agent (#3221), budget read on-chain.
import { useState } from "react";
import type { IntentResponse } from "@/components/agent/types";
import { ActivityFeed } from "@/components/agent/ActivityFeed";
import { BudgetSlab } from "./budget-slab";
import { AgentStatus, moodOf } from "./stage";
import { Transmission } from "./transmission";
import { useI18n } from "@/lib/i18n/react";
import { OwnerSession } from "@/components/agent/OwnerSession";
import { PauseBanner } from "@/components/agent/PauseBanner";
import { MandateBadge } from "@/components/agent/MandateBadge";
import "./agent.css";
// --- liquidity (P1) ---
import { LT } from "@/lib/agent/i18n";
// --- fin liquidity (P1) ---

type Turn = { id: number; message: string; response?: IntentResponse; error?: string; receivedAt: number };

// One click for the judges: a payment in budget, one over it, a question, an abusive request.
const SUGGESTIONS = ["agent.s1", "agent.s2", "agent.s5", "agent.s3", "agent.s4"] as const;

// « Try to scam me »: messages an attacker could send. Each one is caught before any money moves
// (gatekeeper BLOCKED, or the owner is asked first). The address is a random testnet key, in no one's book.
const SCAMS = ["scam.1", "scam.2", "scam.3"] as const;
const SCAMMER = "GAOSEAEBU7JF73ITGCQHBHDT2IT2QIGYJV2TQEB2DDUJ7ACPXAHMQFID";

// Dev only (never in a production build): a simulated payroll answer, same shape and recipients as
// lib/agent/payroll.ts, to work on the vault card without the agent server. NEXT_PUBLIC_VAULT_PAY_MOCK=1.
const VAULT_MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_VAULT_PAY_MOCK === "1";
const mockPayroll = (): IntentResponse => ({
  plan: null,
  verdict: null,
  reasoning: "dev mock",
  result: {
    status: "needs_vault_signature",
    payments: [
      { to: "GDTMYTVUVK24YS33DC7LH2LXF6C4TKOYLPBWZNKKJIIRSAKRJZLSXPH3", label: "Carol", amountUsdc: "3" },
      { to: "GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV", label: "Bob", amountUsdc: "2" },
    ],
    totalUsdc: "5",
    reasons: ["dev mock"],
  },
});

export default function AgentPage() {
  const { t } = useI18n();
  const { lang } = useI18n(); // liquidity (P1)
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [approved, setApproved] = useState<Record<number, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [scam, setScam] = useState(0);
  const [owner, setOwner] = useState(false); // session Sarah (Freighter) : sinon l'agent ne fait que simuler
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
      <header className="agent-head">
        <span className="chapter">{t("chapter.n", { n: "II" })}</span>
        <h1 className="agent-title">{t("ch.agent")}</h1>
        <p className="agent-lede">{t("agent.lede")}</p>
        <div className="agent-session">
          <OwnerSession onChange={setOwner} />
          <MandateBadge refreshKey={refreshKey} />
        </div>
      </header>

      <aside className="agent-aside">
        <BudgetSlab refreshKey={refreshKey} alarm={mood === "refused" || mood === "blocked"} />
      </aside>

      <div className="agent-main">
        <PauseBanner owner={owner} refreshKey={refreshKey} />

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(message); }}>
          <div className="composer-top"><AgentStatus mood={mood} /><span className={`composer-mode ${owner ? "is-owner" : ""}`}>{t(owner ? "agent.ownerNotice" : "agent.demoNotice")}</span></div>
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
            {/* --- liquidity (P1) --- */}
            <button type="button" className="chip" disabled={!!pending} onClick={() => send(LT[lang].chip)}>{LT[lang].chip}</button>
            {/* --- fin liquidity (P1) --- */}
            <button type="button" className="chip scam" disabled={!!pending}
              onClick={() => { send(t(SCAMS[scam % SCAMS.length], { addr: SCAMMER })); setScam((n) => n + 1); }}>
              {t("agent.scamBtn")}
            </button>
            {VAULT_MOCK && (
              <button type="button" className="chip dev" onClick={() => setTurns((ts) => [...ts, { id: Date.now(), message: "payroll (dev mock)", response: mockPayroll(), receivedAt: Date.now() }])}>
                payroll (dev mock)
              </button>
            )}
          </div>
        </form>

        <div className="transmissions">
          {pending && (
            <article className="tx-card thinking">
              <p className="tx-request"><q>{pending}</q></p>
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

        <ActivityFeed refreshKey={refreshKey} />
      </div>
    </div>
  );
}
