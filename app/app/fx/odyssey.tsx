"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface OdysseyScene {
  id: string;
  image: string;
  label: string;
  title: readonly string[];
  body: string;
  href?: string;
  cta?: string;
  zoom?: readonly [number, number];
  position?: string;
}

interface OdysseyProps {
  scenes: readonly OdysseyScene[];
  ariaLabel: string;
  progressLabel: string;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function Odyssey({ scenes, ariaLabel, progressLabel }: OdysseyProps) {
  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const markers = useRef<(HTMLSpanElement | null)[]>([]);
  const progressBar = useRef<HTMLDivElement>(null);
  const progressFill = useRef<HTMLSpanElement>(null);
  const initialAnchorHandled = useRef(false);
  const activeIndex = useRef(0);
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnhanced(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const section = root.current!, pinned = pin.current!;
    if (!enhanced || !section || !pinned || !scenes.length) return;

    let disposed = false, raf = 0, requested = 0, local = 0, blend = 0, baseSlot = 0;
    const normalizeSource = (src: string) => {
      try { return new URL(src, document.baseURI).href; } catch { return src; }
    };
    // Sources are managed imperatively and survive translated scene-array replacements.
    // Recover both actual textures rather than assuming the first DOM layer still holds scene 0.
    const slots: (number | null)[] = [0, 1].map((slot) => {
      const element = images.current[slot];
      if (!element?.complete || element.naturalWidth === 0) return null;
      const src = normalizeSource(element.currentSrc || element.getAttribute("src") || "");
      const matches = (index: number) => !!scenes[index] && normalizeSource(scenes[index].image) === src;
      const nearby = [activeIndex.current, activeIndex.current + 1, activeIndex.current - 1].find(matches);
      const index = nearby ?? scenes.findIndex((scene) => normalizeSource(scene.image) === src);
      return index >= 0 ? index : null;
    });
    baseSlot = Math.max(0, slots.findIndex((index) => index === activeIndex.current));
    if (slots[baseSlot] === null) baseSlot = Math.max(0, slots.findIndex((index) => index !== null));
    const pending: (number | null)[] = [null, null];
    const versions = [0, 0];
    // At most the current image and its two neighbours remain explicitly retained.
    const cache = new Map<string, Promise<HTMLImageElement>>();
    const cacheImages = new Map<string, HTMLImageElement>();
    const failures = new Set<string>();
    let fallingBack = false;
    function failSource(src: string) {
      failures.add(src);
      if (!disposed && !fallingBack && scenes[requested]?.image === src && slots.every((index) => index === null)) {
        fallingBack = true;
        setEnhanced(false);
      }
    }

    function preload(index: number): Promise<HTMLImageElement> | undefined {
      const scene = scenes[index];
      if (!scene || failures.has(scene.image)) return;
      const cached = cache.get(scene.image);
      if (cached) return cached;
      const image = new Image();
      image.decoding = "async";
      cacheImages.set(scene.image, image);
      const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => {
          image.decode().then(() => resolve(image), reject);
        };
        image.onerror = () => reject(new Error("Scene image unavailable"));
        image.src = scene.image;
      });
      // Cache failures too: a broken asset must not trigger a new request on every scroll.
      promise.catch(() => { failSource(scene.image); });
      cache.set(scene.image, promise);
      return promise;
    }

    function schedule() {
      if (!disposed && !raf) raf = requestAnimationFrame(update);
    }

    function fillSlot(slot: number, index: number) {
      if (slots[slot] === index || pending[slot] === index) return;
      const loaded = preload(index), element = images.current[slot];
      if (!loaded || !element) return;
      const version = ++versions[slot];
      pending[slot] = index;
      loaded.then(async (image) => {
        if (disposed || version !== versions[slot] || (index !== requested && index !== requested + 1)) {
          if (version === versions[slot]) pending[slot] = null;
          return;
        }
        // The other slot stays opaque until this exact source has decoded in its display node.
        element.style.opacity = "0";
        slots[slot] = null;
        element.src = image.src;
        await element.decode();
        if (disposed || version !== versions[slot]) return;
        slots[slot] = index;
        pending[slot] = null;
        schedule();
      }).catch(() => {
        if (!disposed && version === versions[slot]) {
          pending[slot] = null;
          failSource(scenes[index].image);
        }
      });
    }

    function paintImages() {
      let currentSlot = slots.indexOf(requested);
      if (currentSlot < 0) {
        if (failures.has(scenes[requested].image) && slots.every((index) => index === null)) {
          failSource(scenes[requested].image);
          return;
        }
        // A fast jump may outrun loading. Keep the previous texture and replace only its spare.
        const spare = slots[baseSlot] === null ? baseSlot : 1 - baseSlot;
        fillSlot(spare, requested);
        for (let i = 0; i < 2; i++) {
          const element = images.current[i];
          if (element) element.style.opacity = slots[i] !== null && i === baseSlot ? "1" : "0";
        }
        return;
      }
      baseSlot = currentSlot;
      const nextIndex = Math.min(scenes.length - 1, requested + 1);
      const other = 1 - currentSlot;
      if (nextIndex !== requested) fillSlot(other, nextIndex);
      const nextReady = nextIndex !== requested && slots[other] === nextIndex;
      const fade = nextReady ? blend : 0;
      for (let i = 0; i < 2; i++) {
        const element = images.current[i], index = slots[i];
        if (!element || index === null) continue;
        const scene = scenes[index];
        const [from, to] = scene.zoom ?? [1.02, 1.1];
        const position = i === currentSlot ? local : 0;
        element.style.transform = `scale(${from + (to - from) * position})`;
        element.style.objectPosition = scene.position ?? "center";
        element.style.zIndex = String(i === currentSlot ? 0 : 1);
        // Keep an opaque base underneath the incoming layer, avoiding a black dip mid-dissolve.
        element.style.opacity = String(i === currentSlot ? 1 : fade);
      }
    }

    function update() {
      raf = 0;
      if (disposed) return;
      const rect = section.getBoundingClientRect();
      const distance = Math.max(1, rect.height - pinned.offsetHeight);
      const progress = clamp(-rect.top / distance);
      const timeline = progress * scenes.length;
      requested = Math.min(scenes.length - 1, Math.floor(timeline));
      local = clamp(timeline - requested);
      blend = requested === scenes.length - 1 ? 0 : clamp((local - 0.75) / 0.25);
      const readable = blend >= 0.5 ? requested + 1 : requested;

      section.style.setProperty("--odyssey-progress", String(progress));
      if (progressFill.current) progressFill.current.style.transform = `scaleX(${progress})`;
      progressBar.current?.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
      for (let i = 0; i < scenes.length; i++) {
        const opacity = i === requested ? clamp(1 - blend * 2) : i === requested + 1 ? clamp((blend - 0.5) * 2) : 0;
        panels.current[i]?.style.setProperty("--scene-opacity", String(opacity));
        // Place native anchors in the reading portion of their actual timeline, outside the pin.
        const marker = markers.current[i];
        if (marker) marker.style.top = `${((i + 0.25) / scenes.length) * distance}px`;
      }
      if (activeIndex.current !== readable) {
        activeIndex.current = readable;
        setActive(readable);
      }

      const wanted = new Set([requested - 1, requested, requested + 1]
        .map((i) => scenes[i]?.image).filter((src): src is string => !!src));
      for (const [src, image] of cacheImages) {
        if (wanted.has(src)) continue;
        cacheImages.delete(src);
        cache.delete(src);
      }
      preload(requested);
      preload(requested + 1);
      preload(requested - 1);
      paintImages();

      if (!initialAnchorHandled.current) {
        initialAnchorHandled.current = true;
        let hash = "";
        try { hash = decodeURIComponent(location.hash.slice(1)); } catch { /* malformed external hash */ }
        const target = scenes.findIndex((scene) => scene.id === hash);
        if (target >= 0) {
          markers.current[target]?.scrollIntoView({ block: "start", behavior: "instant" });
          schedule();
        }
      }
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(section);
    observer.observe(pinned);
    schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      observer.disconnect();
      for (const image of cacheImages.values()) { image.onload = null; image.onerror = null; }
      cache.clear();
      cacheImages.clear();
      section.style.removeProperty("--odyssey-progress");
      for (const panel of panels.current) panel?.style.removeProperty("--scene-opacity");
      for (const image of images.current) {
        image?.style.removeProperty("opacity");
        image?.style.removeProperty("transform");
        image?.style.removeProperty("object-position");
        image?.style.removeProperty("z-index");
      }
    };
  }, [enhanced, scenes]);

  if (!scenes.length) return null;
  return (
    <section ref={root} className={`odyssey${enhanced ? " is-enhanced" : ""}`} aria-label={ariaLabel}>
      {enhanced && scenes.map((scene, i) => (
        <span key={scene.id} id={scene.id} ref={(element) => { markers.current[i] = element; }}
          className="odyssey-anchor" tabIndex={-1} aria-label={scene.label} />
      ))}
      <div ref={pin} className="odyssey-pin">
        <div className="odyssey-media" aria-hidden="true">
          {[0, 1].map((slot) => (
            <img key={slot} ref={(element) => { images.current[slot] = element; }}
              className="odyssey-image" src={slot === 0 ? scenes[0].image : undefined} alt="" decoding="async" />
          ))}
        </div>
        <div className="odyssey-gradient" aria-hidden="true" />
        <div className="odyssey-copy">
          {scenes.map((scene, i) => (
            <section key={scene.id} id={enhanced ? undefined : scene.id}
              ref={(element) => { panels.current[i] = element; }}
              className={`odyssey-scene${active === i ? " is-active" : ""}`}
              aria-labelledby={`odyssey-title-${scene.id}`}
              aria-hidden={enhanced && active !== i ? true : undefined}
              inert={enhanced && active !== i}>
              {!enhanced && <img className="odyssey-fallback-image" src={scene.image} alt="" loading="lazy" decoding="async" />}
              <p className="odyssey-label">{scene.label}</p>
              <h2 className="odyssey-title" id={`odyssey-title-${scene.id}`}>
                {scene.title.map((line, lineIndex) => <span key={lineIndex}>{line}</span>)}
              </h2>
              <p className="odyssey-body">{scene.body}</p>
              {scene.href && scene.cta && <Link className="odyssey-cta" href={scene.href}>{scene.cta}<span aria-hidden="true"> ↗</span></Link>}
            </section>
          ))}
        </div>
        <nav className="odyssey-index" aria-label={progressLabel}>
          {scenes.map((scene, i) => (
            <a key={scene.id} href={`#${scene.id}`} className={`odyssey-index-item${active === i ? " is-active" : ""}`}
              aria-current={active === i ? "step" : undefined}
              aria-label={`${i + 1} / ${scenes.length} — ${scene.label}`}>
              <span className="odyssey-index-number">{String(i + 1).padStart(2, "0")}</span>
              <span className="odyssey-index-label">{scene.label}</span>
            </a>
          ))}
        </nav>
        <div ref={progressBar} className="odyssey-progress" role="progressbar" aria-label={progressLabel}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
          <span ref={progressFill} className="odyssey-progress-fill" />
        </div>
      </div>
    </section>
  );
}
