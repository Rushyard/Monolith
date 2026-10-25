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
    <>
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

      <form onSubmit={send} className="panel op">
        <div className="field">
          <label htmlFor="msg">Instruction</label>
          <input
            id="msg"
            className="input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paie 5 USDC à Alice"
          />
        </div>
        <button className="btn hal" type="submit" disabled={loading || !message}>
          {loading ? <span className="progress-dots">Envoi</span> : "Envoyer"}
        </button>
      </form>
      {/* TODO (P1) : si status === "needs_owner_approval", faire signer unsignedXdr par Freighter. */}
      {result !== null && (
        <pre className="terminal" style={{ marginTop: 16 }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </>
  );
}
