"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LangSwitch, useI18n } from "@/lib/i18n/react";

const LINKS = [
  { href: "/vault", key: "nav.vault" },
  { href: "/agent", key: "nav.agent" },
  { href: "/auditor", key: "nav.auditor" },
] as const;

export function SiteHeader() {
  const path = usePathname();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (path !== "/") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const film = document.querySelector(".scroll-film");
      setVisible(media.matches || !film || film.getBoundingClientRect().bottom <= innerHeight);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    media.addEventListener("change", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
      media.removeEventListener("change", update);
    };
  }, [path]);
  return (
    <header className={`site-header ${path === "/" ? `cinematic-header ${visible ? "is-visible" : ""}` : ""}`}>
      <Link href="/" className="wordmark"><span className="brand-slab" aria-hidden="true" />Monolith</Link>
      <Nav />
    </header>
  );
}

export function Nav() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav className="site-nav" aria-label={t("nav.label")}>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
          {t(l.key)}
        </Link>
      ))}
      <LangSwitch />
    </nav>
  );
}

export function SkipLink() {
  const { t } = useI18n();
  return <a className="skip-link" href="#main-content">{t("nav.skip")}</a>;
}
