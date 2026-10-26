"use client";

// The self-hosted film is the default; #3d and #2d preserve the alternate scenes.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { Dawn } from "./dawn";
import { useI18n } from "@/lib/i18n/react";
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
  const { t } = useI18n();
  const [aligned, setAligned] = useState(true);
  const [mode, setMode] = useState<Mode>("film");
  const onAligned = useCallback(() => setAligned(true), []);
  useEffect(() => setMode(pickMode()), []);
  return (
    <section className={`hero-dawn ${mode === "3d" ? "is-3d" : ""} ${mode === "film" ? "is-film" : ""}`}>
      {mode === "film" ? <HeroVideo tagline={tagline} /> :
        mode === "3d" ? <Monolith3D onAligned={onAligned} /> : <Dawn onAligned={onAligned} />}
      {mode !== "film" && <div className={`hero-copy ${aligned ? "on" : ""}`}>
        <h1 className="intertitle">Monolith</h1>
        <p className="lede">{tagline}</p>
        {mode === "3d" && <p className="hero-hint">{t("hero.hint3d")}</p>}
      </div>}
    </section>
  );
}
