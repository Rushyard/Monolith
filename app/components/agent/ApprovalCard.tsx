"use client";

// Carte d'approbation owner : le réseau a refusé la signature de l'agent (#3221), l'owner
// approuve avec Freighter. Même librairie que le coffre (P2) : @stellar/freighter-api.
// Flux : Freighter signTransaction(unsignedXdr) → POST /api/agent/submit → lien explorer.
import { useState } from "react";
import { getNetworkDetails, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { TESTNET_PASSPHRASE, explorerTx, short, type OwnerApproval } from "./types";
import { tr } from "@/lib/i18n";

/** L'XDR (timeout 3600 s, auth valable ~720 ledgers) est considéré expiré un peu avant. */
const XDR_TTL_MS = 55 * 60 * 1000;

export type ApprovalPhase =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; hash: string }
  | { kind: "error"; message: string; retry: boolean };

const errMsg = (e: unknown) => (typeof e === "string" ? e : (e as { message?: string })?.message ?? String(e));

/** Le flux d'approbation owner (Freighter → /api/agent/submit), réutilisable par toute UI. */
export function useOwnerApproval(approval: OwnerApproval, receivedAt: number, onApproved?: (hash: string) => void) {
  const [phase, setPhase] = useState<ApprovalPhase>({ kind: "idle" });

  async function approve() {
    try {
      if (Date.now() - receivedAt > XDR_TTL_MS) {
        return setPhase({ kind: "error", message: tr("approve.expired"), retry: false });
      }
      setPhase({ kind: "working", step: tr("approve.connecting") });
      const conn = await isConnected();
      if (conn.error || !conn.isConnected) {
        return setPhase({ kind: "error", message: tr("approve.noFreighter"), retry: true });
      }
      const access = await requestAccess();
      if (access.error) return setPhase({ kind: "error", message: tr("approve.denied", { e: errMsg(access.error) }), retry: true });
      if (access.address !== approval.owner) {
        return setPhase({
          kind: "error",
          message: tr("approve.wrongAccount", { active: short(access.address), owner: short(approval.owner) }),
          retry: true,
        });
      }
      const net = await getNetworkDetails();
      if (net.error || net.networkPassphrase !== TESTNET_PASSPHRASE) {
        return setPhase({ kind: "error", message: tr("approve.wrongNet", { net: net.network || "?" }), retry: true });
      }

      setPhase({ kind: "working", step: tr("approve.signing") });
      const signed = await signTransaction(approval.unsignedXdr, { networkPassphrase: TESTNET_PASSPHRASE, address: approval.owner });
      if (signed.error || !signed.signedTxXdr) {
        return setPhase({ kind: "error", message: tr("approve.notSigned", { e: errMsg(signed.error ?? "—") }), retry: true });
      }

      setPhase({ kind: "working", step: tr("approve.submitting") });
      const res = await fetch("/api/agent/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr: signed.signedTxXdr }),
      });
      const body = (await res.json()) as { status: string; hash?: string; error?: string };
      if (body.status === "submitted" && body.hash) {
        setPhase({ kind: "done", hash: body.hash });
        onApproved?.(body.hash);
        return;
      }
      const e = body.error ?? tr("approve.unknown");
      if (e.includes("txTooLate")) return setPhase({ kind: "error", message: tr("approve.tooLate"), retry: false });
      if (e.includes("txBadSeq")) return setPhase({ kind: "error", message: tr("approve.badSeq"), retry: false });
      setPhase({ kind: "error", message: tr("approve.rejected", { e }), retry: false });
    } catch (err) {
      setPhase({ kind: "error", message: errMsg(err), retry: true });
    }
  }

  return { phase, approve };
}

export function ApprovalCard({
  approval,
  amountUsdc,
  recipientLabel,
  receivedAt,
  onApproved,
}: {
  approval: OwnerApproval;
  amountUsdc?: string;
  recipientLabel?: string;
  /** Date.now() à la réception de la réponse /api/intent (sert à détecter l'XDR expiré). */
  receivedAt: number;
  onApproved?: (hash: string) => void;
}) {
  const { phase, approve } = useOwnerApproval(approval, receivedAt, onApproved);
  const attempt = approval.agentAttempt;
  const blockedByNetwork = attempt?.simulationCode === 3221;

  return (
    <div className="panel p1-approval" style={card}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {blockedByNetwork ? "⛔ L'agent a été bloqué par le réseau Stellar" : "✋ Ton accord est nécessaire"}
      </div>
      {blockedByNetwork ? (
        <p style={p}>
          Erreur <code>#3221</code> <code>SpendingLimitExceeded</code> : le plafond on-chain de l'agent est dépassé.
          {attempt?.rejectedTx && (
            <>
              {" "}
              <a href={attempt.rejectedTx.explorerUrl} target="_blank" rel="noreferrer">
                Voir la tentative rejetée ↗
              </a>
            </>
          )}
        </p>
      ) : null}
      <p style={p}>
        {amountUsdc ? <b>{amountUsdc} USDC</b> : "Ce paiement"}
        {recipientLabel ? <> vers <b>{recipientLabel}</b></> : null}, signé par l&apos;owner {short(approval.owner)} (règle {approval.rule}).
        Approuver avec Freighter ?
      </p>

      {phase.kind === "idle" && (
        <button type="button" onClick={approve} className="btn primary" style={btn}>
          Approuver avec Freighter
        </button>
      )}
      {phase.kind === "working" && <p style={p}>{phase.step}</p>}
      {phase.kind === "done" && (
        <p style={{ ...p, color: "var(--p1-ok, #2e9e5b)" }}>
          ✅ Paiement envoyé.{" "}
          <a href={explorerTx(phase.hash)} target="_blank" rel="noreferrer">
            Voir sur stellar.expert ↗
          </a>
        </p>
      )}
      {phase.kind === "error" && (
        <div>
          <p style={{ ...p, color: "var(--p1-err, #d0443e)" }}>{phase.message}</p>
          {phase.retry && (
            <button type="button" onClick={approve} className="btn" style={btn}>
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid var(--p1-border, #c9a227)", padding: 14, margin: "8px 0", maxWidth: 620 };
const p: React.CSSProperties = { margin: "4px 0", lineHeight: 1.45 };
/** Marge seulement : l'apparence vient de la classe `btn` de l'app. */
const btn: React.CSSProperties = { marginTop: 8 };

export default ApprovalCard;
