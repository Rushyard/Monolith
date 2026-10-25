"use client";

// One confidential payment, seen three ways: what the public reads on-chain, what Marc (the
// designated auditor) reads with his key, and what the agent could do. Only the owner's browser
// knows the amount here (it signed it); nothing below is sent anywhere.
import { short, type VaultPayment } from "./types";
import { explorerTx } from "@/lib/ct/format";
import { useI18n } from "@/lib/i18n/react";

export function PaymentLenses({ payment, from, hash }: { payment: VaultPayment; from: string; hash: string }) {
  const { t } = useI18n();
  return (
    <section className="lenses" aria-label={t("lens.title", { who: payment.label })}>
      <h3 className="lenses-title">{t("lens.title", { who: payment.label })}</h3>
      <div className="lenses-grid">
        <div className="lens public">
          <span className="lens-head">{t("lens.public")}</span>
          <dl>
            <dt>{t("lens.from")}</dt><dd className="mono">{short(from)}</dd>
            <dt>{t("lens.to")}</dt><dd className="mono">{short(payment.to)}</dd>
            <dt>{t("lens.call")}</dt><dd className="mono">confidential_transfer</dd>
            <dt>{t("lens.amount")}</dt><dd className="lens-hidden">{t("lens.encrypted")}</dd>
          </dl>
          <a className="link" href={explorerTx(hash)} target="_blank" rel="noreferrer">stellar.expert ↗</a>
        </div>
        <div className="lens auditor">
          <span className="lens-head">{t("lens.marc")}</span>
          <dl>
            <dt>{t("lens.to")}</dt><dd>{payment.label}</dd>
            <dt>{t("lens.amount")}</dt><dd className="lens-amount">{payment.amountUsdc} USDC</dd>
          </dl>
          <p className="fine">{t("lens.marcHow")}</p>
          <a className="link" href="/auditor">/auditor ↗</a>
        </div>
        <div className="lens agent">
          <span className="lens-head">{t("lens.agent")}</span>
          <ul>
            <li>{t("lens.agentPrepared")}</li>
            <li>{t("lens.agentNoKey")}</li>
            <li>{t("lens.agentReceipt")}</li>
            <li>{t("lens.agentPublic")}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
