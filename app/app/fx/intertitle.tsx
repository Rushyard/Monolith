"use client";

// Kubrick-style chapter card on every navigation between the three chapters.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CHAPTERS: Record<string, [string, string]> = {
  "/vault": ["Chapitre I", "Le coffre"],
  "/agent": ["Chapitre II", "L'agent"],
  "/auditor": ["Chapitre III", "L'auditeur"],
};

export function Intertitle() {
  const path = usePathname();
  const [card, setCard] = useState<{ key: string; eyebrow: string; title: string } | null>(null);

  useEffect(() => {
    const hit = Object.entries(CHAPTERS).find(([p]) => path.startsWith(p));
    if (!hit || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setCard({ key: path + Date.now(), eyebrow: hit[1][0], title: hit[1][1] });
    const id = setTimeout(() => setCard(null), 2100);
    return () => clearTimeout(id);
  }, [path]);

  // Idle: a hidden element warms the golden-line film into the cache.
  if (!card) return <video src="/films/chapter.mp4" muted preload="auto" hidden aria-hidden />;
  return (
    <div key={card.key} className="intertitle-card" aria-hidden>
      {/* the horizon opening under the title (missing file: the black card alone) */}
      <video className="intertitle-film" src="/films/chapter.mp4" muted playsInline autoPlay preload="auto" />
      <span className="chapter">{card.eyebrow}</span>
      <span className="intertitle-card-title">{card.title}</span>
    </div>
  );
}
