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

// Updating React only when a caption changes keeps the video scrub outside reconciliation.
const captionKey = (p: number) => `${BEATS.map((b) => Number(p >= b.from && p < b.to)).join("")}${Number(p > 0.82)}${Number(p > 0.02)}`;

export function HeroVideo({ tagline }: { tagline: string }) {
  const { t } = useI18n();
  const section = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const still = reducedMotion === true || failed;

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const v = video.current, s = section.current, pinned = pin.current;
    if (!v || !s || !pinned || reducedMotion === null || failed) return;

    // One pending destination, one decoder seek at a time. Scroll events replace the
    // destination rather than interrupting an in-flight decode or queuing old positions.
    let target = 0, currentProgress = 0, raf = 0, frame = 0;
    let intro = !still, started = false, disposed = false;
    const hasDuration = () => Number.isFinite(v.duration) && v.duration > 0;
    const end = () => Math.max(0, v.duration - 0.05);
    const seekLatest = () => {
      if (disposed || intro || !hasDuration() || v.seeking) return;
      if (Math.abs(v.currentTime - target) >= 1 / 60) v.currentTime = target;
    };
    const stopIntro = () => {
      intro = false;
      v.pause();
      if (frame && typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(frame);
      frame = 0;
    };
    const readScroll = () => {
      raf = 0;
      if (disposed) return;
      if (still) {
        if (hasDuration()) { target = end(); seekLatest(); }
        return;
      }
      const rect = s.getBoundingClientRect();
      // Use the actual CSS sticky height (100svh on mobile), not the changing URL-bar viewport.
      const distance = Math.max(1, rect.height - pinned.offsetHeight);
      currentProgress = Math.max(0, Math.min(1, -rect.top / distance));
      setProgress((old) => captionKey(old) === captionKey(currentProgress) ? old : currentProgress);
      if (!hasDuration()) return;
      const firstLight = Math.min(NIGHT_END, end());
      target = firstLight + currentProgress * (end() - firstLight);
      if (intro && currentProgress > 0) stopIntro();
      seekLatest();
    };
    const scheduleScroll = () => {
      if (!raf) raf = requestAnimationFrame(readScroll);
    };
    const finishIntro = () => {
      if (!intro || v.currentTime < Math.min(NIGHT_END, hasDuration() ? end() : NIGHT_END)) return;
      stopIntro();
      readScroll();
    };
    const watchIntro = () => {
      finishIntro();
      if (intro && !disposed && typeof v.requestVideoFrameCallback === "function") {
        frame = v.requestVideoFrameCallback(watchIntro);
      }
    };
    const onMetadata = () => {
      readScroll();
      if (started || still || !intro) return;
      started = true;
      // Restored scroll positions take ownership before autoplay can start.
      if (currentProgress > 0) return;
      v.play().then(() => {
        if (disposed || !intro) { v.pause(); return; }
        watchIntro();
      }).catch(() => {
        if (disposed) return;
        stopIntro();
        readScroll();
      });
    };
    const onVisibility = () => {
      if (!document.hidden) scheduleScroll();
    };

    v.addEventListener("loadedmetadata", onMetadata);
    v.addEventListener("loadeddata", scheduleScroll);
    v.addEventListener("seeked", seekLatest);
    v.addEventListener("timeupdate", finishIntro);
    if (!still) {
      window.addEventListener("scroll", scheduleScroll, { passive: true });
      window.addEventListener("resize", scheduleScroll);
      window.addEventListener("pageshow", scheduleScroll);
      document.addEventListener("visibilitychange", onVisibility);
    }
    const observer = new ResizeObserver(scheduleScroll);
    observer.observe(s);
    observer.observe(pinned);
    readScroll();
    if (v.readyState >= 1) onMetadata();

    return () => {
      disposed = true;
      stopIntro();
      cancelAnimationFrame(raf);
      observer.disconnect();
      v.removeEventListener("loadedmetadata", onMetadata);
      v.removeEventListener("loadeddata", scheduleScroll);
      v.removeEventListener("seeked", seekLatest);
      v.removeEventListener("timeupdate", finishIntro);
      window.removeEventListener("scroll", scheduleScroll);
      window.removeEventListener("resize", scheduleScroll);
      window.removeEventListener("pageshow", scheduleScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion, still, failed]);

  const titleOn = still || progress > 0.82;
  return (
    <section ref={section} className={`scroll-film ${still ? "still" : ""}`}>
      <div ref={pin} className="scroll-film-pin">
        <video
          ref={video}
          src={HERO_VIDEO.src}
          poster={HERO_VIDEO.poster}
          muted
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
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
