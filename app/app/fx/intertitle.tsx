"use client";

// Kubrick-style chapter card on every navigation between the three chapters.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/react";

const CHAPTERS = {
  "/vault": ["I", "ch.vault"],
  "/agent": ["II", "ch.agent"],
  "/auditor": ["III", "ch.auditor"],
} as const;

export function Intertitle() {
  const path = usePathname();
  const { t } = useI18n();
  const [card, setCard] = useState<{ key: string; eyebrow: string; title: string } | null>(null);

  useEffect(() => {
    const hit = Object.entries(CHAPTERS).find(([p]) => path.startsWith(p));
    if (!hit || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setCard({ key: path + Date.now(), eyebrow: t("chapter.n", { n: hit[1][0] }), title: t(hit[1][1]) });
    const id = setTimeout(() => setCard(null), 1900);
    return () => clearTimeout(id);
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps -- a language switch must not replay the card

  if (!card) return null;
  return (
    <div key={card.key} className="intertitle-card" aria-hidden>
      <span className="chapter">{card.eyebrow}</span>
      <span className="intertitle-card-title">{card.title}</span>
      <span className="intertitle-rule" />
    </div>
  );
}
