"use client";

// Budget de l'agent lu on-chain (spending-limit policy) via GET /api/agent/balance.
// Changer `refreshKey` (ex. après un paiement) relance la lecture.
import { useEffect, useState } from "react";
import type { BalanceResponse } from "./types";
import { useI18n } from "@/lib/i18n/react";

export function BudgetBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useI18n();
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/agent/balance", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as BalanceResponse;
      })
      .then((b) => alive && (setData(b), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (error) return <div style={wrap}>{t("budget.unreadable", { e: error })}</div>;
  if (!data) return <div style={wrap}>{t("budget.reading")}</div>;

  const { limitUsdc, spentUsdc, remainingUsdc, periodLedgers } = data.budget;
  const pct = limitUsdc > 0 ? Math.min(100, (spentUsdc / limitUsdc) * 100) : 100;
  const hours = Math.round((periodLedgers * 5) / 3600);

  return (
    <div className="p1-budget" style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>
          {t("budget.label")} <b>{t("budget.left", { n: remainingUsdc })}</b>
        </span>
        <span style={{ opacity: 0.75 }}>
          {t("budget.line", { spent: spentUsdc, limit: limitUsdc, h: hours, bal: data.smartAccountUsdc })}
        </span>
      </div>
      <div style={track} role="progressbar" aria-valuemin={0} aria-valuemax={limitUsdc} aria-valuenow={spentUsdc}>
        <div style={{ ...fill, width: `${pct}%`, background: pct >= 100 ? "var(--p1-err, #d0443e)" : "var(--p1-fill, #c9a227)" }} />
      </div>
      {remainingUsdc <= 0 && (
        <p style={{ margin: "6px 0", color: "var(--p1-err, #d0443e)" }}>
          {t("budget.empty")}
        </p>
      )}
      <div style={{ fontSize: 12, opacity: 0.6 }}>{t("budget.note")}</div>
    </div>
  );
}

const wrap: React.CSSProperties = { margin: "8px 0", maxWidth: 620 };
const track: React.CSSProperties = { height: 8, borderRadius: 4, background: "var(--p1-track, rgba(127,127,127,0.25))", overflow: "hidden", margin: "6px 0" };
const fill: React.CSSProperties = { height: "100%", transition: "width 300ms ease" };

export default BudgetBar;
