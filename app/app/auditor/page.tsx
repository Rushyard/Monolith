"use client";

// Vue auditeur (P2) : la clé d'audit de Monolith révèle les montants des transferts confidentiels.
// La clé n'est jamais embarquée dans l'app ni stockée : elle reste dans l'état de la page.
import { useState } from "react";

import { CT, auditToken, explorerTx, formatUsdc, short, type AuditRow, type KeyStatus } from "@/lib/confidential";

type Attempt = "ours" | "shared";

export default function AuditorPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ key: KeyStatus; attempt?: Attempt }>({ key: "none" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(secretHex = "", attempt?: Attempt) {
    setLoading(true);
    setError(null);
    try {
      const r = await auditToken(secretHex);
      setRows(r.rows);
      setStatus({ key: r.key, attempt });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const revealed = status.key === "valid";

  return (
    <>
      <header className="page-head">
        <div>
          <span className="chapter">Chapitre III</span>
          <h1 className="intertitle" style={{ marginTop: 10 }}>L'auditeur</h1>
          <p className="lede">
            À gauche, ce que n'importe qui lit sur la chaîne. À droite, ce que révèle la clé d'audit : le montant
            de chaque transfert et le solde de l'expéditeur. Rien de plus, et seulement pour l'auditeur désigné.
          </p>
        </div>
      </header>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn" onClick={() => load()} disabled={loading}>
            {loading ? <span className="progress-dots">Lecture</span> : rows ? "Relire la chaîne" : "Lire la chaîne"}
          </button>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            token {short(CT.token, 6)} · registre {short(CT.auditor, 6)} · auditeur #{CT.auditorId}
          </span>
        </div>

        <div className="field">
          <label htmlFor="audit-key">Clé d'audit (secret Grumpkin de l'auditeur désigné)</label>
          <div className="row">
            <input
              id="audit-key"
              className="input mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn primary" onClick={() => load(key, "ours")} disabled={loading || !key.trim()}>
              Appliquer la clé d'audit
            </button>
          </div>
        </div>

        <div className="row">
          <button
            className="btn"
            onClick={() => load(CT.sharedPublicAuditorSecretHex, "shared")}
            disabled={loading}
          >
            Essayer la clé publique de la démo de référence
          </button>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            (auditeur #0 du registre partagé, dont le secret est publié)
          </span>
        </div>

        {status.key === "valid" && (
          <p className="callout info" style={{ margin: 0, fontSize: 14 }}>
            <span className="tag ok">clé valide</span> k·H correspond à la clé enregistrée on-chain pour l'auditeur
            #{CT.auditorId}. Montants révélés ci-dessous.
          </p>
        )}
        {status.key === "invalid" && (
          <p className="callout" style={{ margin: 0, fontSize: 14 }}>
            <span className="tag hal">clé refusée</span>{" "}
            {status.attempt === "shared"
              ? "La clé publique de la démo de référence n'ouvre rien ici : ce token est rattaché à notre propre registre d'auditeurs. Les montants restent chiffrés."
              : "Cette clé ne correspond pas à l'auditeur enregistré on-chain. Les montants restent chiffrés."}
          </p>
        )}
        <p className="callout info" style={{ margin: 0, fontSize: 14 }}>
          Chaque compte désigne son auditeur à l'ouverture du coffre (ici le #{CT.auditorId} de notre registre).
          Sa clé secrète n'est ni dans le code ni sur le serveur : elle ne quitte pas la machine de l'auditeur.
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
                    <td className="num" style={{ color: r.kind === "transfer" && revealed ? "var(--hal)" : undefined }}>
                      {r.kind !== "transfer"
                        ? formatUsdc(r.auditedAmount ?? 0n)
                        : r.auditedAmount === null
                          ? status.key === "invalid" ? "illisible" : "•••"
                          : formatUsdc(r.auditedAmount)}
                      {r.senderBalance !== null && (
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
