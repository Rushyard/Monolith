"use client";

// The opening shot: the sun rises behind the 1:4:9 slab until it clears the top edge.
// Plays once on load; scrolling replays the last part of the alignment.
import { useEffect, useRef } from "react";

export function Dawn({ onAligned }: { onAligned?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DURATION = 3600;
    let raf = 0, t0 = 0, fired = false;

    const draw = (p: number) => {
      const dpr = Math.min(devicePixelRatio || 1, 2), w = (c.clientWidth * dpr) | 0, h = (c.clientHeight * dpr) | 0;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const W = c.width, H = c.height;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const horizon = H * 0.86, mw = Math.min(W * 0.12, H * 0.16), mh = (mw * 9) / 4, mx = W / 2 - mw / 2, mtop = horizon - mh;
      const sunFrom = horizon + H * 0.2, sunTo = mtop - H * 0.015;
      const sunY = sunFrom + (sunTo - sunFrom) * p;
      const g = ctx.createRadialGradient(W / 2, sunY, 0, W / 2, sunY, H * 0.75);
      g.addColorStop(0, "rgba(255,250,240,1)"); g.addColorStop(0.03, "rgba(255,243,214,.95)"); g.addColorStop(0.07, "rgba(255,236,200,.55)");
      g.addColorStop(0.2, "rgba(255,200,140,.16)"); g.addColorStop(0.5, "rgba(255,190,120,.04)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
      // crescent above the alignment
      const cy = mtop - H * 0.24 + (1 - p) * H * 0.06, cr = H * 0.045;
      ctx.save(); ctx.globalAlpha = Math.min(1, p * 1.3);
      ctx.fillStyle = "#cfd6e6"; ctx.beginPath(); ctx.arc(W / 2, cy, cr, 0, 7); ctx.fill();
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(W / 2 + cr * 0.32, cy + cr * 0.12, cr * 0.95, 0, 7); ctx.fill();
      ctx.restore();
      // ground
      const gg = ctx.createLinearGradient(0, horizon, 0, H); gg.addColorStop(0, "#15110d"); gg.addColorStop(1, "#000");
      ctx.fillStyle = gg; ctx.fillRect(0, horizon, W, H - horizon);
      ctx.fillStyle = "rgba(255,240,215,.18)"; ctx.fillRect(0, horizon, W, 1);
      // the slab
      const lg = ctx.createLinearGradient(mx, 0, mx + mw, 0);
      lg.addColorStop(0, "#030303"); lg.addColorStop(0.5, "#141416"); lg.addColorStop(0.51, "#050506"); lg.addColorStop(1, "#000");
      ctx.fillStyle = lg; ctx.fillRect(mx, mtop, mw, horizon - mtop + 2);
      const align = Math.max(0, 1 - Math.abs(sunY - sunTo) / (H * 0.18));
      ctx.fillStyle = `rgba(255,243,214,${align * 0.9})`; ctx.fillRect(mx - 1, mtop - 1, mw + 2, Math.max(1, dpr * 1.5));
      if (!fired && p >= 0.98) { fired = true; onAligned?.(); }
    };

    const tick = (now: number) => {
      if (!t0) t0 = now;
      const k = Math.min(1, (now - t0) / DURATION);
      draw(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    if (reduce) draw(1); else raf = requestAnimationFrame(tick);
    const onResize = () => draw(1);
    addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", onResize); };
  }, [onAligned]);

  return <canvas ref={ref} className="dawn" aria-label="Le soleil se lève derrière le monolithe" />;
}
