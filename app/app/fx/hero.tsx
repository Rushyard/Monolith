"use client";

// Home hero: the scroll-driven dawn film (self-hosted video), the 3D monolith behind `#3d`,
// and the 2D dawn as the fallback. The title appears at the moment of alignment.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { Dawn } from "./dawn";
import { HeroVideo } from "./hero-video";

const Monolith3D = dynamic(() => import("./monolith3d"), { ssr: false });

type Mode = "film" | "3d" | "dawn";

// Work in progress: the 3D monolith only renders with `#3d` in the URL until it beats the film.
function pickMode(): Mode {
  if (location.hash === "#3d") {
    try { if (document.createElement("canvas").getContext("webgl2")) return "3d"; } catch { /* no webgl */ }
  }
  return location.hash === "#2d" ? "dawn" : "film";
}

export function Hero({ tagline }: { tagline: string }) {
  const [aligned, setAligned] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const onAligned = useCallback(() => setAligned(true), []);
  const onFail = useCallback(() => setMode("dawn"), []);
  useEffect(() => setMode(pickMode()), []);
  return (
    <section className={`hero-dawn ${mode === "3d" ? "is-3d" : ""} ${mode === "film" ? "is-film" : ""}`}>
      {mode === null ? <div className="hero-film" /> :
        mode === "film" ? <HeroVideo tagline={tagline} onFail={onFail} /> :
        mode === "3d" ? <Monolith3D onAligned={onAligned} /> : <Dawn onAligned={onAligned} />}
      {mode !== "film" && <div className={`hero-copy ${aligned ? "on" : ""}`}>
        <h1 className="intertitle">Monolith</h1>
        <p className="lede">{tagline}</p>
        {mode === "3d" && <p className="hero-hint">Survole le monolithe : le registre gravé est chiffré.</p>}
      </div>}
    </section>
  );
}
