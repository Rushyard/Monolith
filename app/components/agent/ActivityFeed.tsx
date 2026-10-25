"use client";

// The agent's activity, rebuilt on-chain by GET /api/agent/activity. Two channels: public (the
// agent's capped petty cash, amount visible to everyone) and private (vault transfers signed by
// the owner, amount hidden: the server never has it, so we never show one).
import { useEffect, useState } from "react";
import { short, type ActivityItem, type ActivityResponse } from "./types";
import { explorerTx } from "@/lib/ct/format";
import { useI18n } from "@/lib/i18n/react";

const MAX = 8;

/** A "waiting" line is stale once a later payment to the same recipient went through. */
function settle(items: ActivityItem[]): ActivityItem[] {
  return items.filter((it) =>
    it.kind !== "waiting" || !items.some((p) => p.kind === "paid" && p.channel === it.channel && p.to === it.to && p.at >= it.at));
}

export function ActivityFeed({ refreshKey }: { refreshKey: number }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/agent/activity")
      .then((r) => (r.ok ? (r.json() as Promise<ActivityResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => { if (live) { setItems(settle(b.items)); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey]);

  const time = (at: string) => new Date(at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="activity" aria-labelledby="activity-title">
      <h2 id="activity-title" className="activity-title">{t("act.title")}</h2>
      {failed && <p className="fine">{t("act.error")}</p>}
      {!failed && items === null && <p className="fine progress-dots">{t("act.loading")}</p>}
      {!failed && items?.length === 0 && <p className="fine">{t("act.empty")}</p>}
      {!!items?.length && (
        <ol className="activity-list">
          {items.slice(0, MAX).map((it, i) => (
            <li key={`${it.hash ?? it.at}-${it.to}-${i}`} className={`activity-item ${it.kind}`}>
              <span className={`badge ${it.channel}`}>{t(it.channel === "private" ? "act.private" : "act.public")}</span>
              <span className="act-who">{it.label} <em>{short(it.to)}</em></span>
              <span className="act-amt">
                {it.channel === "private" ? t("act.hidden") : it.amountUsdc ? `${it.amountUsdc} USDC` : "—"}
              </span>
              <span className="act-kind">{t(`act.kind.${it.kind}`)} · {time(it.at)}</span>
              {it.hash && <a className="link act-tx" href={explorerTx(it.hash)} target="_blank" rel="noreferrer">{t("verdict.tx")} ↗</a>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
