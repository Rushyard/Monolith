"use client";

// Home hero as a film: plays once, holds on its last frame (no loop seam) and
// reveals the title near the end. Self-hosted in /public (COEP-safe). If the
// file is missing or can't play, `onFail` lets the hero fall back to the dawn.
import { useEffect, useRef } from "react";

export const HERO_VIDEO = { src: "/hero/monolith.mp4", poster: "/hero/monolith-poster.jpg", revealBeforeEnd: 1.8 };

export function HeroVideo({ onAligned, onFail }: { onAligned: () => void; onFail: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fired = useRef(false);
  const reveal = () => { if (!fired.current) { fired.current = true; onAligned(); } };

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No motion: show the final frame straight away.
      const toEnd = () => { v.currentTime = Math.max(0, v.duration - 0.05); reveal(); };
      if (v.readyState >= 1) toEnd(); else v.addEventListener("loadedmetadata", toEnd, { once: true });
      return;
    }
    v.play().catch(() => reveal()); // autoplay refused: poster stays, title shows
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="hero-film" aria-hidden="true">
      <video
        ref={video}
        src={HERO_VIDEO.src}
        poster={HERO_VIDEO.poster}
        muted
        playsInline
        preload="auto"
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration && v.currentTime >= v.duration - HERO_VIDEO.revealBeforeEnd) reveal();
        }}
        onEnded={reveal}
        onError={onFail}
      />
    </div>
  );
}
