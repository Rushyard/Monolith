"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangSwitch, useI18n } from "@/lib/i18n/react";

const LINKS = [
  { href: "/vault", key: "nav.vault" },
  { href: "/agent", key: "nav.agent" },
  { href: "/auditor", key: "nav.auditor" },
] as const;

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
