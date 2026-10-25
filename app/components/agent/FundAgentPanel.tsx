"use client";

// Onglet Coffre : approvisionner l'agent = withdraw du coffre confidentiel vers le smart account
// de l'agent. La sortie est publique (montant visible) ; le solde du coffre reste caché.
import { useState } from "react";
import deployment from "@/lib/agent/deployment.json";
import { BudgetBar } from "./BudgetBar";
import { short } from "./types";

export const AGENT_SMART_ACCOUNT = process.env.NEXT_PUBLIC_SMART_ACCOUNT_ID || deployment.smartAccount;

export function FundAgentPanel({
  disabled,
  busyLabel,
  onFund,
  refreshKey,
}: {
  disabled: boolean;
  /** Libellé de progression (« Preuve », « Envoi »…) pendant l'opération, sinon null. */
  busyLabel: string | null;
  /** Lance le withdraw vers AGENT_SMART_ACCOUNT pour `amount` (chaîne décimale). */
  onFund: (amount: string) => void;
  /** À incrémenter après un approvisionnement pour relire le solde du smart account. */
  refreshKey: number;
}) {
  const [amount, setAmount] = useState("1");
  return (
    <section className="panel stack" style={{ marginTop: 16 }}>
      <h2 className="section">
        Approvisionner l&apos;agent <span className="tag public">public</span>
      </h2>
      <p style={{ margin: 0, color: "var(--muted)" }}>
        Retire des USDC du coffre vers le compte de l&apos;agent (smart account{" "}
        <a className="link mono" href={`https://stellar.expert/explorer/testnet/contract/${AGENT_SMART_ACCOUNT}`} target="_blank" rel="noreferrer">
          {short(AGENT_SMART_ACCOUNT)}
        </a>
        ). <b>Cette sortie est publique : le montant est visible on-chain.</b> Le solde du coffre, lui, reste caché.
        L&apos;agent ne pourra de toute façon dépenser que dans son plafond on-chain.
      </p>
      <div className="op">
        <div className="field">
          <label htmlFor="fund">Montant (USDC)</label>
          <input id="fund" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn" disabled={disabled || !Number(amount)} onClick={() => onFund(amount)}>
          {busyLabel ? <span className="progress-dots">{busyLabel}</span> : "Approvisionner l'agent"}
        </button>
      </div>
      <BudgetBar refreshKey={refreshKey} />
    </section>
  );
}

export default FundAgentPanel;
