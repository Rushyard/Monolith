"use client";

// The agent's on-chain budget as a 1:4:9 slab lit from below: the light is what it can still spend.
import { useEffect, useState } from "react";
import type { BalanceResponse } from "@/components/agent/types";
import { useI18n } from "@/lib/i18n/react";

export function BudgetSlab({ refreshKey = 0, alarm = false }: { refreshKey?: number; alarm?: boolean }) {
  const { t, locale } = useI18n();
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/agent/balance", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); return (await r.json()) as BalanceResponse; })
      .then((b) => alive && (setData(b), setError(false)))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [refreshKey]);

  const b = data?.budget;
  const left = b && b.limitUsdc > 0 ? Math.max(0, Math.min(1, b.remainingUsdc / b.limitUsdc)) : 0;
  const hours = b ? Math.round((b.periodLedgers * 5) / 3600) : 24;

  return (
    <div className={`budget-slab ${alarm ? "alarm" : ""} ${b && b.remainingUsdc <= 0 ? "empty" : ""}`}>
      <div className="slab" role="meter" aria-label={t("slab.aria")} aria-valuemin={0} aria-valuemax={b?.limitUsdc ?? 10} aria-valuenow={b?.remainingUsdc ?? 0}>
        <div className="slab-light" style={{ height: `${left * 100}%` }} />
      </div>
      <div className="slab-legend">
        <span className="chapter">{t("slab.title")}</span>
        {b ? (
          <>
            <span className="slab-amount">{fmt(b.remainingUsdc)}<small> / {fmt(b.limitUsdc)} USDC</small></span>
            <span className="slab-note">{t("slab.window", { h: hours })}</span>
            <span className="slab-note">{t("slab.cap")}</span>
          </>
        ) : (
          <span className="slab-note">{error ? t("slab.unreadable") : t("slab.reading")}</span>
        )}
      </div>
    </div>
  );
}
