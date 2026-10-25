"use client";

// A value that "decrypts": hex glyphs churn, then lock in left to right.
import { useEffect, useRef, useState } from "react";

const GLYPHS = "0123456789abcdef";
const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const noise = (n: number) => Array.from({ length: n }, () => GLYPHS[(Math.random() * 16) | 0]).join("");

/** Encrypted placeholder: a shifting hex blob, as long as `width`. */
export function Cipher({ width = 8, live = true }: { width?: number; live?: boolean }) {
  const [txt, setTxt] = useState(() => "0x" + "·".repeat(width));
  useEffect(() => {
    setTxt("0x" + noise(width));
    if (!live || reduced()) return;
    const id = setInterval(() => setTxt("0x" + noise(width)), 160);
    return () => clearInterval(id);
  }, [width, live]);
  return <span className="cipher" aria-label="montant chiffré">{txt}</span>;
}

/** Plays a decrypt animation from noise to `text` each time `text` changes. */
export function Decrypt({ text, duration = 1100, delay = 0 }: { text: string; duration?: number; delay?: number }) {
  const [out, setOut] = useState(text);
  const raf = useRef(0);
  useEffect(() => {
    if (reduced()) { setOut(text); return; }
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.max(0, Math.min(1, (now - start) / duration));
      const lock = Math.floor(p * text.length);
      setOut(text.split("").map((ch, i) => (i < lock || ch === "." || ch === " " ? ch : GLYPHS[(Math.random() * 16) | 0])).join(""));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [text, duration, delay]);
  return <span aria-label={text}>{out}</span>;
}

/** Types a line out, console style. */
export function TypeLine({ text, className }: { text: string; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced()) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((k) => { if (k >= text.length) { clearInterval(id); return k; } return k + 1; }), 26);
    return () => clearInterval(id);
  }, [text]);
  return <p className={className} aria-live="polite">{text.slice(0, n)}<span className="caret" aria-hidden /></p>;
}
