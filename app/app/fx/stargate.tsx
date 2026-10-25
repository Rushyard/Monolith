"use client";

// The Star Gate (Trumbull's slit-scan) as a full-screen WebGL pass, shown while a
// zero-knowledge proof is computed in the browser. When `active` drops, the tunnel
// collapses into a white flash and fades out.
import { useEffect, useRef, useState } from "react";

const VS = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }";
const FS = `precision highp float;
uniform vec2 r; uniform float t; uniform float speed; uniform float flash;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
vec3 pal(float x){ return .5 + .5*cos(6.2831*(x + vec3(.0, .33, .67))); }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*r) / r.y;
  float d = abs(uv.y);                      // floor + ceiling planes, like the slit rig
  float z = .22 / max(d, .002);
  float flow = z + t*speed;
  float b = n(vec2(uv.x*z*3., flow*1.6))*.65 + n(vec2(uv.x*z*9., flow*4.))*.35;
  b = smoothstep(.35, 1., b);
  vec3 col = pal(b*.6 + flow*.03 + t*.02) * b;
  col *= smoothstep(0., .25, d) * 1.6;
  col += vec3(1., .96, .86) * smoothstep(.07, 0., length(uv)) * .45 * speed;
  gl_FragColor = vec4(mix(col, vec3(1.), flash), 1.);
}`;

type Phase = "off" | "on" | "out";

export function StarGate({ active, title, detail }: { active: boolean; title: string; detail?: string }) {
  const [phase, setPhase] = useState<Phase>("off");
  const [elapsed, setElapsed] = useState(0);
  // One corridor per crossing: the film if it can play quickly, otherwise the shader.
  const [look, setLook] = useState<"wait" | "film" | "shader">("wait");
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ speed: 0.3, target: 2.6, flash: 0, t: 0, start: 0 });

  useEffect(() => {
    if (active) {
      state.current = { speed: 0.3, target: 2.6, flash: 0, t: 0, start: performance.now() };
      setLook(matchMedia("(prefers-reduced-motion: reduce)").matches ? "shader" : "wait");
      setPhase("on");
    }
    else setPhase((p) => (p === "on" ? "out" : p));
  }, [active]);

  useEffect(() => {
    if (phase !== "on" || look !== "wait") return;
    const id = setTimeout(() => setLook((l) => (l === "wait" ? "shader" : l)), 700); // film too slow: shader
    return () => clearTimeout(id);
  }, [phase, look]);

  useEffect(() => {
    if (phase === "out") {
      state.current.flash = 1; state.current.target = 0.2;
      const id = setTimeout(() => setPhase("off"), 900);
      return () => clearTimeout(id);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "off" || !canvas.current) return;
    const c = canvas.current;
    const gl = c.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (k: string) => gl.getUniformLocation(pr, k);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), alive = true;
    const frame = (now: number) => {
      if (!alive) return;
      const s = state.current, dt = Math.min(0.05, (now - last) / 1000); last = now;
      s.speed += (s.target - s.speed) * Math.min(1, dt * 3); s.t += dt * (reduce ? 0.15 : 1); s.flash = Math.max(0, s.flash - dt * 1.3);
      const dpr = Math.min(devicePixelRatio || 1, 1.5), w = (c.clientWidth * dpr) | 0, h = (c.clientHeight * dpr) | 0;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, c.width, c.height);
      gl.uniform2f(U("r"), c.width, c.height); gl.uniform1f(U("t"), s.t); gl.uniform1f(U("speed"), s.speed); gl.uniform1f(U("flash"), s.flash);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (phase === "on") setElapsed((now - s.start) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); gl.getExtension("WEBGL_lose_context")?.loseContext(); };
  }, [phase === "off"]); // eslint-disable-line react-hooks/exhaustive-deps

  // Off: a hidden element warms the film into the cache so the corridor appears at once.
  if (phase === "off") return <video src="/films/stargate.mp4" muted preload="auto" hidden aria-hidden />;
  return (
    <div className={`stargate ${phase} look-${look}`} role="status" aria-live="polite">
      {/* the shader also drives the timer, so it always runs; it is only shown as the fallback */}
      <canvas ref={canvas} aria-hidden />
      <video
        className="stargate-film"
        src="/films/stargate.mp4" muted loop playsInline autoPlay preload="auto" aria-hidden
        onCanPlay={() => setLook((l) => (l === "wait" ? "film" : l))}
        onError={() => setLook("shader")}
      />
      <div className="stargate-flash" aria-hidden />
      <div className="stargate-caption">
        <span className="stargate-title">{phase === "on" ? title : "Preuve prête"}</span>
        <span className="stargate-detail">
          {phase === "on" ? `${detail ?? "preuve à divulgation nulle · bb.js"} · ${elapsed.toFixed(1)} s` : "signature Freighter…"}
        </span>
      </div>
    </div>
  );
}
