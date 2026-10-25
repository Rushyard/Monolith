"use client";

// A silent looping film behind a page title (self-hosted in /public/films).
// It stays invisible until it can play, so a missing file simply shows nothing.
import { useEffect, useRef, useState } from "react";

export function AmbientFilm({ name }: { name: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ((video.current?.readyState ?? 0) >= 3) setReady(true); // loaded before hydration
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) video.current?.play().catch(() => {});
  }, []);
  return (
    <div className={`ambient-film ${ready ? "on" : ""}`} aria-hidden="true">
      <video ref={video} src={`/films/${name}.mp4`} muted loop playsInline preload="auto" onCanPlay={() => setReady(true)} />
    </div>
  );
}
