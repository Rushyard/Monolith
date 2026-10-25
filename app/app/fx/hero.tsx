"use client";

// Home hero: the 3D encrypted monolith at dawn (2D dawn as a fallback without
// WebGL), then the title appears at the moment of alignment.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { Dawn } from "./dawn";

const Monolith3D = dynamic(() => import("./monolith3d"), { ssr: false });

// Work in progress: the 3D monolith only renders with `#3d` in the URL until it beats the 2D dawn.
function hasWebGL(): boolean {
  if (location.hash !== "#3d") return false;
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

export function Hero({ tagline }: { tagline: string }) {
  const [aligned, setAligned] = useState(false);
  const [three, setThree] = useState<boolean | null>(null);
  const onAligned = useCallback(() => setAligned(true), []);
  useEffect(() => setThree(hasWebGL()), []);
  return (
    <section className={`hero-dawn ${three ? "is-3d" : ""}`}>
      {three === null ? <div className="monolith3d" /> : three ? <Monolith3D onAligned={onAligned} /> : <Dawn onAligned={onAligned} />}
      <div className={`hero-copy ${aligned ? "on" : ""}`}>
        <h1 className="intertitle">Monolith</h1>
        <p className="lede">{tagline}</p>
        {three && <p className="hero-hint">Survole le monolithe : le registre gravé est chiffré.</p>}
      </div>
    </section>
  );
}
