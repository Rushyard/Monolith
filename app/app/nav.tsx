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

// The pointer within this many pixels of the top edge reveals the header over the home film.
const REVEAL_EDGE = 64;

export function Nav() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav className="site-nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
          {t(l.key)}
        </Link>
      ))}
      <LangSwitch />
    </nav>
  );
}

/**
 * Site header. On the home page the film is full-bleed: the header stays out of the way until the
 * hero has been scrolled past (a sentinel `#hero-end` placed after it), the pointer nears the top
 * edge, or a header link gets keyboard focus (CSS `:focus-within`). Elsewhere it is always shown.
 */
export function SiteHeader() {
  const path = usePathname();
  const home = path === "/";
  const [past, setPast] = useState(false);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!home) return;
    setPast(false);
    setNear(false);

    const end = document.getElementById("hero-end");
    let io: IntersectionObserver | undefined;
    if (end) {
      // past = the end of the hero has risen into the top 40% of the viewport, or above it.
      // The root box extends far upwards so a jump (Home/End keys) still flips the state.
      io = new IntersectionObserver(([e]) => setPast(e.isIntersecting), {
        rootMargin: "1000000px 0px -60% 0px",
      });
      io.observe(end);
    } else {
      setPast(true);
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      setNear(e.clientY >= 0 && e.clientY <= REVEAL_EDGE);
    };
    const onLeave = (e: MouseEvent) => { if (!e.relatedTarget) setNear(false); };
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => {
      io?.disconnect();
      removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [home]);

  return (
    <header
      className="site-header"
      data-overlay={home ? "" : undefined}
      data-shown={!home || past || near ? "" : undefined}
      data-over-film={home && !past ? "" : undefined}
    >
      <Link href="/" className="wordmark">Monolith</Link>
      <Nav />
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <p>{t("footer.line")}</p>
    </footer>
  );
}
