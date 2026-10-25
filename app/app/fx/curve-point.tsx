"use client";

// What the chain stores for a hidden balance: a point on Grumpkin (y² = x³ − 17).
// Drawn on the real-number model of the curve, as a background for the vault cards.
import { useEffect, useRef } from "react";

export function CurvePoint({ seed = 0 }: { seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const X0 = Math.cbrt(17);
    let raf = 0, t = seed * 3.1, last = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) raf = requestAnimationFrame(draw); });
    function draw(now: number) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; if (!reduce) t += dt;
      const dpr = Math.min(devicePixelRatio || 1, 2), w = (c.clientWidth * dpr) | 0, h = (c.clientHeight * dpr) | 0;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const W = c.width, H = c.height, map = (x: number, y: number): [number, number] => [((x - 2.2) / 4.6) * W, H / 2 - (y / 13) * H];
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(183,166,255,.28)"; ctx.lineWidth = dpr;
      for (const s of [1, -1]) {
        ctx.beginPath();
        for (let x = X0; x < 6.8; x += 0.02) { const [px, py] = map(x, s * Math.sqrt(x * x * x - 17)); x === X0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.stroke();
      }
      const x = X0 + 0.2 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 2.6, s = Math.sin(t * 0.27) > 0 ? 1 : -1;
      const [px, py] = map(x, s * Math.sqrt(x * x * x - 17));
      ctx.fillStyle = "#b7a6ff"; ctx.shadowColor = "#b7a6ff"; ctx.shadowBlur = 12 * dpr;
      ctx.beginPath(); ctx.arc(px, py, 3 * dpr, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    }
    io.observe(c);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [seed]);
  return <canvas ref={ref} className="curve-point" aria-hidden />;
}
