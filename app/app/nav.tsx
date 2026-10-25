"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/vault", label: "Coffre" },
  { href: "/agent", label: "Agent" },
  { href: "/auditor", label: "Auditeur" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="site-nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
