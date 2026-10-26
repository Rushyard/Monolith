"use client";

import Link from "next/link";

import { Hero } from "./fx/hero";
import { useI18n } from "@/lib/i18n/react";

// The three chapters, as three acts that continue the film: each carries its own object
// (the dark slab, the slab lit from below, HAL's eye), the same objects the chapters use.
const CHAPTERS = [
  { n: "I", id: "vault", href: "/vault", title: "ch.vault", body: "home.vault.body", cta: "home.act.vault" },
  { n: "II", id: "agent", href: "/agent", title: "ch.agent", body: "home.agent.body", cta: "home.act.agent" },
  { n: "III", id: "auditor", href: "/auditor", title: "ch.auditor", body: "home.auditor.body", cta: "home.act.auditor" },
] as const;

const VISIBLE = ["home.visible.1", "home.visible.2", "home.visible.3", "home.visible.4"] as const;
const HIDDEN = ["home.hidden.1", "home.hidden.2"] as const;

export default function Home() {
  const { t } = useI18n();
  return (
    <>
      <Hero tagline={t("meta.tagline")} />
      {/* the header fades in once this line has risen into the upper part of the screen */}
      <div id="hero-end" className="hero-end" aria-hidden />

      <div className="acts">
        {CHAPTERS.map((c) => (
          <article key={c.href} className={`act act-${c.id}`} aria-labelledby={`act-${c.id}`}>
            <span className={`act-object ${c.id}`} aria-hidden />
            <div className="act-head">
              <span className="chapter">{t("chapter.n", { n: c.n })}</span>
              <h2 id={`act-${c.id}`} className="act-title">{t(c.title)}</h2>
            </div>
            <div className="act-body">
              <p>{t(c.body)}</p>
              <Link href={c.href} className="act-link">{t(c.cta)}</Link>
            </div>
          </article>
        ))}
      </div>

      <section className="ledger" aria-labelledby="ledger-title">
        <header className="ledger-head">
          <h2 id="ledger-title" className="ledger-title">{t("home.ledger.title")}</h2>
          <p className="ledger-lede">{t("home.ledger.lede")}</p>
        </header>
        <div className="ledger-record">
          <div className="ledger-col public">
            <h3>{t("home.visible")}</h3>
            <ul>
              {VISIBLE.map((v) => <li key={v}>{t(v)}</li>)}
            </ul>
          </div>
          <div className="ledger-col hidden">
            <h3>{t("home.hidden")}</h3>
            <ul>
              {HIDDEN.map((v) => (
                <li key={v}>
                  <span>{t(v)}</span>
                  <span className="redacted" aria-hidden />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="ledger-coda">{t("home.notAnonymous")}</p>
      </section>
    </>
  );
}
