"use client";

// Page de test P1, autonome : chat → /api/intent → raisonnement + carte d'approbation Freighter.
// La page /agent (P2) importera les mêmes composants (voir docs/integration-p1.md).
import { useState } from "react";
import { AgentReasoning } from "@/components/agent/AgentReasoning";
import { ApprovalCard } from "@/components/agent/ApprovalCard";
import { BudgetBar } from "@/components/agent/BudgetBar";
import type { IntentResponse } from "@/components/agent/types";

type Turn = { message: string; response?: IntentResponse; error?: string; receivedAt: number };

export default function AgentP1Page() {
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
      const res = await fetch("/api/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: m }) });
      const body = await res.json();
      setTurns((t) => [...t, res.ok || body.result ? { message: m, response: body, receivedAt: Date.now() } : { message: m, error: body.error ?? `HTTP ${res.status}`, receivedAt: Date.now() }]);
    } catch (err) {
      setTurns((t) => [...t, { message: m, error: err instanceof Error ? err.message : String(err), receivedAt: Date.now() }]);
    } finally {
      setLoading(false);
      setRefreshKey((k) => k + 1);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ marginBottom: 4 }}>Agent — test P1</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>Essaie « paie 1 USDC à Alice », puis « paie 50 USDC à Alice ».</p>
      <BudgetBar refreshKey={refreshKey} />

      {turns.map((t, i) => {
        const r = t.response?.result;
        const pay = t.response?.verdict?.payment;
        return (
          <section key={i} style={{ margin: "16px 0" }}>
            <div style={{ fontWeight: 600 }}>› {t.message}</div>
            {t.error && <p style={{ color: "#d0443e" }}>Erreur : {t.error}</p>}
            {t.response && <AgentReasoning response={t.response} />}
            {r?.status === "needs_owner_approval" && (
              <ApprovalCard
                approval={r}
                amountUsdc={pay?.amountUsdc}
                recipientLabel={pay?.recipient.label}
                receivedAt={t.receivedAt}
                onApproved={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </section>
        );
      })}

      <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Paie 1 USDC à Alice"
          style={{ flex: 1, padding: "8px 10px" }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !message.trim()} style={{ padding: "8px 14px" }}>
          {loading ? "…" : "Envoyer"}
        </button>
      </form>
    </main>
  );
}
