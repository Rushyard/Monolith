"use client";

// Onglet Agent (P1 UI) : chat → /api/intent, carte d'approbation owner si needs_owner_approval.
import { useState } from "react";

export default function AgentPage() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1>Agent</h1>
      <form onSubmit={send}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Paie 5 USDC à Alice"
        />
        <button type="submit" disabled={loading || !message}>
          Envoyer
        </button>
      </form>
      {/* TODO (P1) : si status === "needs_owner_approval", faire signer unsignedXdr par Freighter. */}
      {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}
