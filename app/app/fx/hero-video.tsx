"use client";

// Home hero as a scroll-driven film (Apple-style). The night plays on its own up to the first
// light, then the page pins the film and the scroll drives the sunrise, forwards and backwards.
// Captions appear on the way and the title lands on the alignment; then the page moves on.
// The file is all-intra (every frame a keyframe) so seeking is smooth; self-hosted (COEP-safe).
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/react";

export const HERO_VIDEO = { src: "/hero/monolith.mp4", poster: "/hero/monolith-poster.jpg" };
const NIGHT_END = 1.8; // seconds played on their own before the scroll takes over

// Captions over the film, as fractions of the scroll through the pinned section.
const BEATS = [
  { from: 0.12, to: 0.36, text: "hero.beat1" },
  { from: 0.42, to: 0.66, text: "hero.beat2" },
] as const;

export function HeroVideo({ tagline, onFail }: { tagline: string; onFail: () => void }) {
  const { t } = useI18n();
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0); // 0..1 scroll through the pinned section
  const [still, setStill] = useState(false); // reduced motion: last frame, no pinning

  useEffect(() => {
    const v = video.current, s = section.current;
    if (!v || !s) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      const toEnd = () => { v.currentTime = Math.max(0, v.duration - 0.05); };
      if (v.readyState >= 1) toEnd(); else v.addEventListener("loadedmetadata", toEnd, { once: true });
      return;
    }

    let shown = 0, raf = 0, auto = true;
    // 1. the night plays by itself, then holds on the first light
    const onTime = () => { if (auto && v.currentTime >= NIGHT_END) { v.pause(); auto = false; shown = v.currentTime; } };
    v.addEventListener("timeupdate", onTime);
    v.play().catch(() => { auto = false; });

    // 2. the scroll drives the sunrise; the shown time eases toward the target (smooth scrubbing)
    const tick = () => {
      const r = s.getBoundingClientRect();
      const run = Math.max(1, r.height - innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / run));
      setProgress((old) => (Math.abs(old - p) > 0.002 ? p : old));
      if (v.duration) {
        const target = NIGHT_END + p * (v.duration - 0.05 - NIGHT_END);
        if (auto && p > 0.01) { v.pause(); auto = false; shown = v.currentTime; } // the user took over
        if (!auto) {
          shown += (target - shown) * 0.12;
          if (Math.abs(v.currentTime - shown) > 1 / 48) v.currentTime = shown;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener("timeupdate", onTime); };
  }, []);

  const titleOn = still || progress > 0.82;
  return (
    <section ref={section} className={`scroll-film ${still ? "still" : ""}`}>
      <div className="scroll-film-pin">
        <video
          ref={video}
          src={HERO_VIDEO.src}
          poster={HERO_VIDEO.poster}
          muted
          playsInline
          preload="auto"
          onError={onFail}
          aria-hidden="true"
        />
        {!still && BEATS.map((b) => (
          <p key={b.text} className={`film-beat ${progress >= b.from && progress < b.to ? "on" : ""}`}>{t(b.text)}</p>
        ))}
        <div className={`film-title ${titleOn ? "on" : ""}`}>
          <h1 className="intertitle">Monolith</h1>
          <p className="lede">{tagline}</p>
        </div>
        {!still && <span className={`film-hint ${progress > 0.02 ? "off" : ""}`}>{t("hero.hint")}</span>}
      </div>
    </section>
  );
}
