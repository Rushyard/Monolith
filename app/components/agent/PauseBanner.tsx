"use client";

// B4 : bandeau « agent en pause » + boutons pause / reprise pour l'owner connecté.
// Pause = retirer la règle de l'agent on-chain ; reprise = la recréer (mêmes paramètres que
// reset-agent.ts). Le serveur prépare l'XDR non signé et affiche les frais simulés ; Sarah signe
// dans Freighter (même flux que la carte d'approbation). À brancher par P2 dans la page agent.
import { useCallback, useEffect, useState } from "react";
import { useOwnerApproval } from "./ApprovalCard";
import { explorerTx, type OwnerApproval, type PauseStatus } from "./types";

type Prep = { action: "pause" | "resume"; unsignedXdr: string; owner: string; feeXlm: number; validUntilLedger: number; scope: string };

function SignPrepared({ prep, onDone }: { prep: Prep; onDone: (hash: string) => void }) {
  const approval: OwnerApproval = { status: "needs_owner_approval", unsignedXdr: prep.unsignedXdr, owner: prep.owner, rule: 0, validUntilLedger: prep.validUntilLedger };
  const [receivedAt] = useState(() => Date.now());
  const { phase, approve } = useOwnerApproval(approval, receivedAt, onDone);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13 }}>Frais simulés : ~{prep.feeXlm} XLM (payés par l&apos;owner).</span>
      <button className="btn primary" type="button" disabled={phase.kind === "working" || phase.kind === "done"} onClick={approve}>
        {phase.kind === "working" ? <span className="progress-dots">{phase.step.replace("…", "")}</span> : prep.action === "pause" ? "Signer la pause dans Freighter" : "Signer la reprise dans Freighter"}
      </button>
      {phase.kind === "error" && <span style={{ fontSize: 13, color: "var(--hal, #d0443e)" }}>{phase.message}</span>}
      {phase.kind === "done" && <a className="link" href={explorerTx(phase.hash)} target="_blank" rel="noreferrer">tx ↗</a>}
    </div>
  );
}

export function PauseBanner({ owner, refreshKey = 0 }: { owner: boolean; refreshKey?: number }) {
  const [status, setStatus] = useState<PauseStatus | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/agent/pause", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setStatus((await r.json()) as PauseStatus);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  async function ask(action: "pause" | "resume") {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/agent/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await r.json();
      if (!r.ok) return setError(body.error ?? `HTTP ${r.status}`);
      setPrep(body as Prep);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  const paused = status.paused;
  if (!paused && !owner) return null;

  return (
    <section className={`panel ${paused ? "pause-banner" : ""}`} style={{ borderColor: paused ? "var(--hal, #d0443e)" : undefined }}>
      {paused ? <b>Agent en pause : sa règle on-chain est retirée, il ne peut plus rien payer seul.</b> : <b>Petite caisse de l&apos;agent active (règle {status.ruleId}).</b>}
      <p style={{ margin: "6px 0", fontSize: 13, color: "var(--muted)" }}>{status.scope}</p>
      {owner && !prep && (
        <button className="btn" type="button" disabled={busy} onClick={() => ask(paused ? "resume" : "pause")}>
          {busy ? <span className="progress-dots">Simulation</span> : paused ? "Réactiver l'agent" : "Mettre l'agent en pause"}
        </button>
      )}
      {prep && <SignPrepared prep={prep} onDone={() => { setPrep(null); setTimeout(refresh, 1500); }} />}
      {error && <p style={{ fontSize: 13, color: "var(--hal, #d0443e)" }}>{error}</p>}
    </section>
  );
}

export default PauseBanner;
