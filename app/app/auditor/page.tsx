"use client";

// Vue auditeur (P2) : la clé d'audit révèle les montants des transferts confidentiels.
import { useState } from "react";

import { CT, auditToken, explorerTx, formatUsdc, short, type AuditRow } from "@/lib/confidential";

export default function AuditorPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await auditToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <span className="chapter">Chapitre III</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>L'auditeur</h1>
          <p className="lede">
            À gauche, ce que n'importe qui lit sur la chaîne. À droite, ce que révèle la clé d'audit : le montant
            de chaque transfert et le solde de l'expéditeur. Rien de plus.
          </p>
        </div>
      </header>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <button className="btn" onClick={load} disabled={loading}>
              {loading ? <span className="progress-dots">Lecture</span> : rows ? "Relire la chaîne" : "Lire la chaîne"}
            </button>
            <button className={`btn ${reveal ? "" : "primary"}`} onClick={() => setReveal((r) => !r)} disabled={!rows}>
              {reveal ? "Masquer" : "Appliquer la clé d'audit"}
            </button>
          </div>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>token {short(CT.token, 6)}</span>
        </div>
        <p className="callout info" style={{ margin: 0, fontSize: 14 }}>
          Démo : la clé d'audit est celle du registre partagé (auditor id 0), publiée volontairement par la démo de
          référence. En production, elle ne quitte jamais la machine de l'auditeur.
        </p>
        {error && <p className="callout" style={{ margin: 0 }}>{error}</p>}
      </section>

      {rows && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Opération</th><th>On-chain</th><th>Audité</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--muted)" }}>Aucune opération dans la fenêtre RPC (~7 jours).</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={`${r.txHash}-${r.kind}`}>
                    <td>
                      {r.kind === "transfer" ? "Transfert confidentiel" : r.kind === "deposit" ? "Dépôt" : "Retrait"}
                      <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                        {short(r.from)} → {short(r.to)} ·{" "}
                        <a className="link" href={explorerTx(r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash, 4)}</a>
                      </div>
                    </td>
                    <td>{r.publicAmount === null ? <span className="tag hidden">chiffré</span> : <span className="num">{formatUsdc(r.publicAmount)}</span>}</td>
                    <td className="num" style={{ color: r.kind === "transfer" && reveal ? "var(--hal)" : undefined }}>
                      {reveal ? (r.auditedAmount === null ? "illisible" : formatUsdc(r.auditedAmount)) : "•••"}
                      {reveal && r.senderBalance !== null && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, whiteSpace: "normal" }}>solde après {formatUsdc(r.senderBalance)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
