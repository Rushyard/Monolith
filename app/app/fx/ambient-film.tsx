"use client";

// Only ship films that exist in public/films; unavailable names render no media.
import { useEffect, useRef, useState } from "react";

const FILMS: Readonly<Record<string, string>> = {
  stargate: "/films/stargate.mp4",
};

export function AmbientFilm({ name }: { name: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const src = FILMS[name];

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setReady(false);
    if (!src || reducedMotion) return;
    const element = video.current;
    if ((element?.readyState ?? 0) >= 3) setReady(true);
    element?.play().catch(() => {});
    return () => element?.pause();
  }, [src, reducedMotion]);

  if (!src || reducedMotion) return null;
  return (
    <div className={`ambient-film ${ready ? "on" : ""}`} aria-hidden="true">
      <video ref={video} src={src} muted loop playsInline preload="metadata" onCanPlay={() => setReady(true)} />
    </div>
  );
}
