"use client";

// Retour au coffre, en deux étapes signées par Sarah :
//   1. la petite caisse (smart account) renvoie tout son USDC sur le compte de Sarah — XDR préparé par le serveur
//      (POST /api/agent/sweep, règle A), signé dans Freighter, même flux que la carte d'approbation ;
//   2. Sarah le dépose dans le coffre puis fusionne — dans ce navigateur, avec sa clé de coffre (l'agent n'y touche pas).
// Le montant est public pendant le trajet ; une fois fusionné, il redevient caché dans le solde du coffre.
import { useRef, useState } from "react";
import { useOwnerApproval } from "./ApprovalCard";
import { explorerTx, short, type OwnerApproval } from "./types";
import { ConfidentialVault } from "@/lib/ct/wallet";
import { formatUsdc } from "@/lib/ct/format";
import { tr } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/react";

const OWNER = process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B";

type Prepared = { approval: OwnerApproval; amount: bigint; at: number };
type Step2 = { kind: "idle" } | { kind: "working"; step: string } | { kind: "error"; message: string } | { kind: "done" };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SweepCard({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function prepare() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/sweep", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) return setError(t("sweep.ownerOnly"));
      if (!res.ok) return setError(body.empty ? t("sweep.empty") : body.error ?? `HTTP ${res.status}`);
      setPrep({
        approval: { status: "needs_owner_approval", unsignedXdr: body.unsignedXdr, owner: body.owner, rule: 0, validUntilLedger: body.validUntilLedger },
        amount: BigInt(body.amount),
        at: Date.now(),
      });
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="approve sweep">
      <div className="approve-row">
        <div>
          <b>{prep ? t("sweep.titleAmt", { amt: formatUsdc(prep.amount) }) : t("sweep.title")}</b>
          <span>{t("sweep.who", { owner: short(OWNER) })}</span>
        </div>
        {!prep && (
          <button className="btn primary" type="button" disabled={loading} onClick={prepare}>
            {loading ? <span className="progress-dots">{t("sweep.preparing")}</span> : t("sweep.btn")}
          </button>
        )}
      </div>
      {error && <p className="approve-error">{error}</p>}
      {prep && <SweepSteps prep={prep} onDone={onDone} />}
      <p className="fine">{t("sweep.fine")}</p>
    </div>
  );
}

function SweepSteps({ prep, onDone }: { prep: Prepared; onDone?: () => void }) {
  const { t } = useI18n();
  const [hash1, setHash1] = useState<string | null>(null);
  const [step2, setStep2] = useState<Step2>({ kind: "idle" });
  const [hashes2, setHashes2] = useState<{ deposit?: string; merge?: string }>({});
  const lock = useRef(false);
  const { phase, approve } = useOwnerApproval(prep.approval, prep.at, (h) => setHash1(h));

  async function deposit() {
    if (lock.current) return;
    lock.current = true;
    try {
      setStep2({ kind: "working", step: t("sweep.connecting") });
      const v = await ConfidentialVault.connect(() => {});
      if (v.address !== OWNER) throw new Error(tr("vpay.wrongAccount", { active: short(v.address), owner: short(OWNER) }));
      let { deposit: d, merge: m } = hashes2;
      if (!d) {
        setStep2({ kind: "working", step: t("sweep.depositing") });
        d = (await v.deposit(prep.amount)).hash;
        setHashes2({ deposit: d });
      }
      if (!m) {
        setStep2({ kind: "working", step: t("sweep.merging") });
        m = (await v.merge()).hash;
        setHashes2({ deposit: d, merge: m });
      }
      setStep2({ kind: "done" });
      onDone?.();
    } catch (e) {
      setStep2({ kind: "error", message: errText(e) });
    } finally {
      lock.current = false;
    }
  }

  const s1done = !!hash1 || phase.kind === "done";
  const link = (h: string, label: string) => <a className="link" href={explorerTx(h)} target="_blank" rel="noreferrer">{label} ↗</a>;
  return (
    <ol className="vault-pay-list">
      <li className={`vault-pay-line ${s1done ? "done" : phase.kind === "error" ? "error" : phase.kind === "working" ? "submitting" : "waiting"}`}>
        <span className="vp-who">{t("sweep.step1")}</span>
        <span className="vp-amt">{formatUsdc(prep.amount)} USDC</span>
        <span className="vp-step">
          {s1done && hash1 ? link(hash1, t("sweep.public"))
            : phase.kind === "working" ? phase.step
            : <button className="btn" type="button" onClick={approve}>{phase.kind === "error" ? t("approve.retry") : t("approve.btn")}</button>}
        </span>
        {phase.kind === "error" && <p className="approve-error">{phase.message}</p>}
      </li>
      <li className={`vault-pay-line ${step2.kind === "done" ? "done" : step2.kind === "error" ? "error" : step2.kind === "working" ? "proving" : "waiting"}`}>
        <span className="vp-who">{t("sweep.step2")}</span>
        <span className="vp-amt">{step2.kind === "done" ? t("act.hidden") : `${formatUsdc(prep.amount)} USDC`}</span>
        <span className="vp-step">
          {step2.kind === "done" ? <>{hashes2.deposit && link(hashes2.deposit, t("sweep.depositTx"))} {hashes2.merge && link(hashes2.merge, t("sweep.mergeTx"))}</>
            : step2.kind === "working" ? step2.step
            : s1done ? <button className="btn" type="button" onClick={deposit}>{step2.kind === "error" ? t("vpay.resume") : t("sweep.depositBtn")}</button>
            : t("vpay.step.waiting")}
        </span>
        {step2.kind === "error" && <p className="approve-error">{step2.message}</p>}
      </li>
      {step2.kind === "done" && <li className="vault-pay-line done"><span className="vp-step">{t("sweep.done", { amt: formatUsdc(prep.amount) })}</span></li>}
    </ol>
  );
}
