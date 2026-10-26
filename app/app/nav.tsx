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
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (path !== "/") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const film = document.querySelector(".scroll-film");
      setVisible(media.matches || !film || film.getBoundingClientRect().bottom <= innerHeight);
    };
    update();
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setNear(event.clientY >= 0 && event.clientY <= 64);
    };
    const onLeave = (event: MouseEvent) => { if (!event.relatedTarget) setNear(false); };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    media.addEventListener("change", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
      media.removeEventListener("change", update);
    };
  }, [path]);
  return (
    <header className={`site-header ${path === "/" ? `cinematic-header ${visible || near ? "is-visible" : ""}` : ""}`}>
      <Link href="/" className="wordmark"><span className="brand-slab" aria-hidden="true" />Monolith</Link>
      <Nav />
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return <footer className="site-footer"><Link href="/" className="footer-brand">Monolith</Link><span><span className="status-dot" />{t("footer.line")}</span></footer>;
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
