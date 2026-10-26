"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Hero } from "./fx/hero";
import { Odyssey, type OdysseyScene } from "./fx/odyssey";
import { useI18n } from "@/lib/i18n/react";

const VISIBLE = ["home.visible.1", "home.visible.2", "home.visible.3", "home.visible.4"] as const;
const HIDDEN = ["home.hidden.1", "home.hidden.2"] as const;

export default function Home() {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!elements || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Progressive enhancement: content is visible without JavaScript or an observer.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("has-arrived");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    for (const element of elements) {
      element.classList.add("will-arrive");
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      for (const element of elements) element.classList.remove("will-arrive");
    };
  }, []);

  const scenes: OdysseyScene[] = [
    { id: "chapter-vault", image: "/artwork/vault.webp", label: `I / ${t("ch.vault")}`, title: [t("film.vault.1"), t("film.vault.2")], body: t("film.vault.body"), href: "/vault", cta: t("film.vault.cta"), zoom: [1, 1.12] },
    { id: "vault-proof", image: "/artwork/proof.webp", label: t("journey.proof.label"), title: [t("journey.proof.1"), t("journey.proof.2")], body: t("journey.proof.body"), href: "/vault", cta: t("film.vault.cta"), zoom: [1, 1.08], position: "75% 50%" },
    { id: "threshold-agent", image: "/artwork/threshold.webp", label: t("journey.autonomy.label"), title: [t("journey.autonomy.1"), t("journey.autonomy.2")], body: t("journey.autonomy.body"), zoom: [1, 1.1], position: "75% 50%" },
    { id: "chapter-agent", image: "/artwork/agent.webp", label: `II / ${t("ch.agent")}`, title: [t("film.agent.1"), t("film.agent.2")], body: t("film.agent.body"), href: "/agent", cta: t("film.agent.cta"), zoom: [1, 1.12] },
    { id: "agent-boundary", image: "/artwork/agent.webp", label: t("journey.limit.label"), title: [t("journey.limit.1"), t("journey.limit.2")], body: t("journey.limit.body"), href: "/agent", cta: t("film.agent.cta"), zoom: [1.22, 1.38], position: "62% 48%" },
    { id: "threshold-auditor", image: "/artwork/threshold.webp", label: t("journey.access.label"), title: [t("journey.access.1"), t("journey.access.2")], body: t("journey.access.body"), zoom: [1.14, 1.24], position: "88% 45%" },
    { id: "chapter-auditor", image: "/artwork/auditor.webp", label: `III / ${t("ch.auditor")}`, title: [t("film.auditor.1"), t("film.auditor.2")], body: t("film.auditor.body"), href: "/auditor", cta: t("film.auditor.cta"), zoom: [1, 1.1] },
    { id: "auditor-reveal", image: "/artwork/auditor.webp", label: t("journey.key.label"), title: [t("journey.key.1"), t("journey.key.2")], body: t("journey.key.body"), href: "/auditor", cta: t("film.auditor.cta"), zoom: [1.16, 1.32], position: "57% 50%" },
    { id: "journey-return", image: "/artwork/return.webp", label: t("film.enter.label"), title: [t("journey.end.1"), t("journey.end.2")], body: t("journey.end.body"), href: "/agent", cta: t("hero.try"), zoom: [1, 1.08], position: "85% 50%" },
  ];

  return (
    <div className="home-page" ref={root}>
      <Hero tagline={t("meta.tagline")} />
      <Odyssey scenes={scenes} ariaLabel={t("journey.label")} progressLabel={t("journey.progress")} />

      <section className="ledger-epilogue editorial-grid" aria-labelledby="ledger-title">
        <p className="editorial-label">{t("film.ledger.label")}</p>
        <div className="ledger-heading" data-reveal>
          <h2 id="ledger-title">{t("film.ledger.title")}</h2>
          <p>{t("home.notAnonymous")}</p>
        </div>
        <div className="ledger-column ledger-public" data-reveal>
          <h3><span className="ledger-marker" aria-hidden="true" />{t("home.visible")}</h3>
          <ul>{VISIBLE.map((key) => <li key={key}>{t(key)}</li>)}</ul>
        </div>
        <div className="ledger-column ledger-private" data-reveal>
          <h3><span className="ledger-marker" aria-hidden="true" />{t("home.hidden")}</h3>
          <ul>{HIDDEN.map((key) => <li key={key}>{t(key)}</li>)}</ul>
          <Link href="/auditor" className="editorial-link">{t("film.privacy.cta")}<span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className="journey-exit">
        <Link className="editorial-enter" href="/agent">{t("hero.try")}<span aria-hidden="true">↗</span></Link>
        <a className="editorial-link" href="#main-content">{t("journey.restart")}<span aria-hidden="true">↺</span></a>
        <p className="entry-note">{t("film.enter.note")}</p>
      </section>
    </div>
  );
}
