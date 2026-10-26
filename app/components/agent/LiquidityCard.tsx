"use client";

// Planificateur de liquidité : Sarah sort du coffre seulement ce dont la petite caisse a besoin.
// Le montant vient du serveur (code fixe, lib/agent/liquidity.ts), jamais du LLM. Tout le reste se passe ici,
// dans le navigateur de Sarah, avec sa clé de coffre (l'agent n'y touche pas) :
//   lecture du coffre (solde disponible déchiffré, comparé localement, jamais affiché ni envoyé)
//   → preuve withdraw → Freighter → réseau → reçu à l'activité (withdraw public : montant visible, vérifié on-chain).
import { useRef, useState } from "react";
import { short, explorerTx, type VaultWithdrawRequest } from "./types";
import { AGENT_SMART_ACCOUNT } from "./FundAgentPanel";
import { ConfidentialVault, type TxPhase } from "@/lib/ct/wallet";
import { parseUsdc } from "@/lib/ct/format";
import { LT } from "@/lib/agent/i18n";
import { useI18n } from "@/lib/i18n/react";

// Même owner que la config de l'agent (lib/agent/config.ts), lu ici sans code serveur.
const OWNER = process.env.NEXT_PUBLIC_OWNER_ADDRESS || "GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B";

type Step = "idle" | "sync" | "proving" | "submitting" | "receipt" | "done" | "error";

// Un coffre par page : Freighter + dérivation de la clé une fois, puis la clé en cache est réutilisée.
let vaultP: Promise<ConfidentialVault> | null = null;
function vault(): Promise<ConfidentialVault> {
  vaultP ??= ConfidentialVault.connect(() => {}).catch((e) => { vaultP = null; throw e; });
  return vaultP;
}

async function postReceipt(to: string, hash: string): Promise<boolean> {
  // La route vérifie la tx on-chain ; le RPC peut avoir quelques secondes de retard.
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("/api/agent/vault-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, hash }) });
      if (res.ok) return true;
    } catch { /* nouvel essai */ }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LiquidityCard({ request, onDone }: { request: VaultWithdrawRequest; onDone?: (hash: string) => void }) {
  const { lang } = useI18n();
  const l = LT[lang];
  const { plan, amountUsdc } = request;
  const [step, setStep] = useState<Step>("idle");
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptFailed, setReceiptFailed] = useState(false);
  const lock = useRef(false);
  const sent = useRef<string | null>(null); // jamais deux withdraws pour la même carte

  async function run() {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    try {
      // Garde-fou navigateur : la seule destination possible est la petite caisse connue.
      if (request.to !== AGENT_SMART_ACCOUNT) throw new Error(`destination ${short(request.to)} ≠ ${short(AGENT_SMART_ACCOUNT)}`);
      const amount = parseUsdc(amountUsdc);
      if (!sent.current) {
        const v = await vault();
        if (v.address !== OWNER) throw new Error(l.wrongAccount(short(v.address), short(OWNER)));
        setStep("sync");
        const view = await v.refresh();
        if (view.spendable < amount) {
          setStep("idle");
          setError(l.insufficient);
          return;
        }
        const r = await v.withdraw(amount, (ph: TxPhase) => setStep(ph), AGENT_SMART_ACCOUNT);
        sent.current = r.hash;
        setHash(r.hash);
      }
      setStep("receipt");
      const ok = await postReceipt(AGENT_SMART_ACCOUNT, sent.current!);
      setReceiptFailed(!ok);
      setStep("done");
      onDone?.(sent.current!);
    } catch (e) {
      setStep("error");
      setError(errText(e));
    } finally {
      lock.current = false;
    }
  }

  const busy = step === "sync" || step === "proving" || step === "submitting" || step === "receipt";
  return (
    <div className="approve vault-pay liquidity">
      <div className="approve-row">
        <div>
          <b>{l.title(amountUsdc)}</b>
          <span>{l.plannerStep}</span>
        </div>
        {step !== "done" && (
          <button className="btn primary" type="button" disabled={busy} onClick={run}>
            {busy ? <span className="progress-dots">{l.step[step]}</span> : l.sign}
          </button>
        )}
      </div>
      <ol className="vault-pay-list">
        {plan.items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="vault-pay-line">
            <span className="vp-who">{it.label}{it.due ? <em> · {it.due}</em> : null}</span>
            <span className="vp-amt">{it.amountUsdc} USDC</span>
            <span className="vp-step">{l.expenses}</span>
          </li>
        ))}
        <li className="vault-pay-line">
          <span className="vp-who">{l.reserve}</span>
          <span className="vp-amt">{plan.reserveUsdc} USDC</span>
          <span className="vp-step" />
        </li>
        <li className="vault-pay-line">
          <span className="vp-who"><b>{l.need}</b> − {l.pettyCash}</span>
          <span className="vp-amt">{plan.needUsdc} − {plan.pettyCashUsdc} USDC</span>
          <span className="vp-step" />
        </li>
        <li className={`vault-pay-line ${step === "done" ? "done" : step}`}>
          <span className="vp-who"><b>{l.title(amountUsdc)}</b></span>
          <span className="vp-amt">{amountUsdc} USDC</span>
          <span className="vp-step">
            {step === "done" && hash
              ? <a className="link" href={explorerTx(hash)} target="_blank" rel="noreferrer">{l.step.done} ↗</a>
              : l.step[step]}
          </span>
        </li>
      </ol>
      {error && <p className="approve-error">{error}</p>}
      {receiptFailed && <p className="fine">{l.receiptFailed}</p>}
      <p className="fine">{l.fine(amountUsdc)}</p>
    </div>
  );
}

export default LiquidityCard;
