"use client";

// Confidential payroll prepared by the agent, signed by the owner. The agent has no vault key:
// it only returns the list. Each payment runs in this browser, one after the other (they spend
// the same encrypted balance, so two proofs must never run in parallel):
//   sync the vault state → transfer proof → Freighter → network → receipt (no amount) → next.
// A failed payment can be resumed; a payment already on-chain is never sent twice.
import { useRef, useState } from "react";
import { short, type VaultPayment, type VaultSignatureRequest } from "./types";
import { PaymentLenses } from "./PaymentLenses";
import { ConfidentialVault, makeClient, type TxPhase } from "@/lib/ct/wallet";
import { explorerTx, parseUsdc } from "@/lib/ct/format";
import { useI18n } from "@/lib/i18n/react";

// Same owner as the agent's config (lib/agent/config.ts), read here without server code.
const OWNER = process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B";

type Step = "waiting" | "sync" | "proving" | "submitting" | "receipt" | "done" | "error";
type Line = { step: Step; hash?: string; error?: string; receiptFailed?: boolean };

// One vault per page: Freighter + key derivation once, then the cached key is reused.
let vaultP: Promise<ConfidentialVault> | null = null;
function vault(): Promise<ConfidentialVault> {
  vaultP ??= ConfidentialVault.connect(() => {}).catch((e) => { vaultP = null; throw e; });
  return vaultP;
}

async function postReceipt(to: string, hash: string): Promise<boolean> {
  // The receipt route checks the tx on-chain; the RPC can lag a few seconds behind.
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("/api/agent/vault-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, hash }),
      });
      if (res.ok) return true;
    } catch { /* retried */ }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function VaultPayCard({ request, onDone }: { request: VaultSignatureRequest; onDone: (hashes: string[]) => void }) {
  const { t } = useI18n();
  const { payments } = request;
  const [lines, setLines] = useState<Line[]>(() => payments.map(() => ({ step: "waiting" })));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null); // payment shown in the three lenses
  const lock = useRef(false);
  const startLedger = useRef<number | null>(null);
  const hashes = useRef<(string | undefined)[]>(payments.map(() => undefined));

  const set = (i: number, l: Line) => setLines((ls) => ls.map((x, j) => (j === i ? l : x)));

  /** A transfer to `p.to` already on-chain since this card started, not yet matched to a line. */
  async function alreadySent(v: ConfidentialVault, p: VaultPayment): Promise<string | null> {
    if (startLedger.current === null) return null;
    const known = new Set(hashes.current.filter(Boolean));
    const ev = (await v.events()).find(
      (e) => e.type === "transfer" && e.from === v.address && e.to === p.to && e.ledger >= startLedger.current! && !known.has(e.txHash),
    );
    return ev?.txHash ?? null;
  }

  async function run() {
    if (lock.current) return;
    lock.current = true;
    setRunning(true);
    setError(null);
    let i = -1;
    try {
      const v = await vault();
      if (v.address !== OWNER) throw new Error(t("vpay.wrongAccount", { active: short(v.address), owner: short(OWNER) }));
      startLedger.current ??= await makeClient().latestLedger();

      for (i = 0; i < payments.length; i++) {
        const p = payments[i];
        if (hashes.current[i]) continue;
        set(i, { step: "sync" });
        await v.refresh();
        let hash = await alreadySent(v, p);
        if (!hash) {
          const r = await v.transfer(p.to, parseUsdc(p.amountUsdc), (ph: TxPhase) => set(i, { step: ph }));
          hash = r.hash;
        }
        hashes.current[i] = hash;
        set(i, { step: "receipt", hash });
        const ok = await postReceipt(p.to, hash);
        set(i, { step: "done", hash, receiptFailed: !ok });
      }
      onDone(hashes.current as string[]);
    } catch (e) {
      const msg = errText(e);
      if (i >= 0 && i < payments.length) set(i, { step: "error", error: msg });
      else setError(msg);
    } finally {
      lock.current = false;
      setRunning(false);
    }
  }

  const started = lines.some((l) => l.step !== "waiting");
  const failed = lines.some((l) => l.step === "error") || !!error;
  const allDone = lines.every((l) => l.step === "done");
  const doneIdx = lines.map((l, i) => (l.step === "done" && l.hash ? i : -1)).filter((i) => i >= 0);
  const shown = focus !== null && doneIdx.includes(focus) ? focus : doneIdx[doneIdx.length - 1];

  return (
    <div className="approve vault-pay">
      <div className="approve-row">
        <div>
          <b>{t("vpay.title", { n: payments.length })}</b>
          <span>{t("vpay.who", { owner: short(OWNER) })}</span>
        </div>
        {!allDone && (
          <button className="btn primary" type="button" disabled={running} onClick={run}>
            {running ? <span className="progress-dots">{t("vpay.running")}</span> : failed ? t("vpay.resume") : started ? t("vpay.resume") : t("vpay.btn")}
          </button>
        )}
      </div>
      <ol className="vault-pay-list">
        {payments.map((p, i) => {
          const l = lines[i];
          return (
            <li key={`${p.to}-${i}`} className={`vault-pay-line ${l.step}${i === shown ? " focus" : ""}`}
              onClick={l.step === "done" ? () => setFocus(i) : undefined}>
              <span className="vp-who">{p.label} <em>{short(p.to)}</em></span>
              <span className="vp-amt">{p.amountUsdc} USDC</span>
              <span className="vp-step">
                {l.step === "done" && l.hash
                  ? <a className="link" href={explorerTx(l.hash)} target="_blank" rel="noreferrer">{t("vpay.step.done")} ↗</a>
                  : t(`vpay.step.${l.step}`)}
              </span>
              {l.error && <p className="approve-error">{l.error}</p>}
              {l.receiptFailed && <p className="fine">{t("vpay.receiptFailed")}</p>}
            </li>
          );
        })}
      </ol>
      {error && <p className="approve-error">{error}</p>}
      <p className="fine">{t("vpay.fine")}</p>
      {shown !== undefined && <PaymentLenses payment={payments[shown]} from={OWNER} hash={lines[shown].hash!} />}
    </div>
  );
}
