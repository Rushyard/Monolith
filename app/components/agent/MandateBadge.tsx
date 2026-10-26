"use client";

// Mandat de l'agent : badge « Mandate: 6 d 23 h left » / « No expiry » / « Expired: renew » (GET /api/agent/mandate),
// et carte de signature Freighter pour un mandat préparé par l'agent (status needs_mandate_signature).
// À brancher par P2 dans la page agent : <MandateBadge refreshKey={…} /> et <MandateCard result={…} />.
import { useEffect, useState } from "react";
import { useOwnerApproval } from "./ApprovalCard";
import { explorerTx, type OwnerApproval } from "./types";
import { MT } from "@/lib/agent/i18n";
import { useI18n } from "@/lib/i18n/react";

export type MandateStatus = { validUntilLedger: number | null; expiresAt: string | null; expired: boolean; paused: boolean; ruleId?: number };
export type MandateSignature = {
  status: "needs_mandate_signature";
  unsignedXdr: string;
  owner: string;
  feeXlm: number;
  validUntilLedger: number;
  mandateUntilLedger: number;
  expiresAt: string;
  text: string;
};

export function MandateBadge({ refreshKey = 0 }: { refreshKey?: number }) {
  const { lang } = useI18n();
  const m = MT[lang];
  const [s, setS] = useState<MandateStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch("/api/agent/mandate", { cache: "no-store", headers: { "x-monolith-lang": lang } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && setS(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!s || s.paused) return null;
  const left = s.expiresAt ? (Date.parse(s.expiresAt) - now) / 1000 : null;
  const expired = s.expired || (left !== null && left <= 0);
  const text = s.validUntilLedger === null ? m.badgeNone : expired ? m.badgeExpired : m.badgeLeft(left!);
  return (
    <span className={`tag ${expired ? "public" : "ok"}`} title={s.validUntilLedger ? `valid_until = ledger ${s.validUntilLedger}` : undefined}>
      {text}
    </span>
  );
}

/** Sarah signe le mandat préparé par l'agent (une tx Freighter), même flux que la carte d'approbation. */
export function MandateCard({ result, receivedAt, onSigned }: { result: MandateSignature; receivedAt: number; onSigned?: (hash: string) => void }) {
  const { lang } = useI18n();
  const m = MT[lang];
  const approval: OwnerApproval = { status: "needs_owner_approval", unsignedXdr: result.unsignedXdr, owner: result.owner, rule: 0, validUntilLedger: result.validUntilLedger };
  const { phase, approve } = useOwnerApproval(approval, receivedAt, onSigned);
  return (
    <div className="approve">
      <p style={{ margin: "0 0 8px" }}>{result.text}</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>{m.fee(result.feeXlm)}</span>
        <button className="btn primary" type="button" disabled={phase.kind === "working" || phase.kind === "done"} onClick={approve}>
          {phase.kind === "working" ? <span className="progress-dots">{phase.step.replace("…", "")}</span> : m.sign}
        </button>
        {phase.kind === "error" && <span style={{ fontSize: 13, color: "var(--hal, #d0443e)" }}>{phase.message}</span>}
        {phase.kind === "done" && <a className="link" href={explorerTx(phase.hash)} target="_blank" rel="noreferrer">tx ↗</a>}
      </div>
    </div>
  );
}

export default MandateBadge;
