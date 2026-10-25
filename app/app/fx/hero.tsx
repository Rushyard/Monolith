"use client";

// Home hero: the dawn shot, then the title appears at the moment of alignment.
import { useCallback, useState } from "react";

import { Dawn } from "./dawn";

export function Hero({ tagline }: { tagline: string }) {
  const [aligned, setAligned] = useState(false);
  const onAligned = useCallback(() => setAligned(true), []);
  return (
    <section className="hero-dawn">
      <Dawn onAligned={onAligned} />
      <div className={`hero-copy ${aligned ? "on" : ""}`}>
        <h1 className="intertitle">Monolith</h1>
        <p className="lede">{tagline}</p>
      </div>
    </section>
  );
}
