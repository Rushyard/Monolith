"use client";

import Link from "next/link";

import { Hero } from "./fx/hero";
import { useI18n } from "@/lib/i18n/react";

const CHAPTERS = [
  { n: "I", href: "/vault", title: "ch.vault", body: "home.vault.body" },
  { n: "II", href: "/agent", title: "ch.agent", body: "home.agent.body" },
  { n: "III", href: "/auditor", title: "ch.auditor", body: "home.auditor.body" },
] as const;

const VISIBLE = ["home.visible.1", "home.visible.2", "home.visible.3", "home.visible.4"] as const;
const HIDDEN = ["home.hidden.1", "home.hidden.2"] as const;

export default function Home() {
  const { t } = useI18n();
  return (
    <>
      <Hero tagline={t("meta.tagline")} />

      <section className="grid cols-3">
        {CHAPTERS.map((c) => (
          <Link key={c.href} href={c.href} className="chapter-card">
            <span className="chapter">{t("chapter.n", { n: c.n })}</span>
            <h3>{t(c.title)}</h3>
            <p>{t(c.body)}</p>
          </Link>
        ))}
      </section>

      <div className="spacer" />

      <section className="grid cols-2">
        <div className="panel">
          <h2 className="section">{t("home.visible")}</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
            {VISIBLE.map((v) => <li key={v}>{t(v)}</li>)}
          </ul>
        </div>
        <div className="panel">
          <h2 className="section">{t("home.hidden")}</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            {HIDDEN.map((v) => <li key={v}>{t(v)}</li>)}
          </ul>
          <p className="chapter" style={{ marginTop: 24 }}>{t("home.notAnonymous")}</p>
        </div>
      </section>
    </>
  );
}
