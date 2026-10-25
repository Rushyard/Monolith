"use client";

// The encrypted monolith: a real-time 1:4:9 slab on a mirror floor at dawn.
// Its face carries the ledger as faint hex lines that light up under the cursor.
// Camera follows the pointer and the scroll. No network assets (COEP-safe).
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useI18n } from "@/lib/i18n/react";

// 1:4:9 — depth : width : height.
const H = 2.7, W = (H * 4) / 9, D = H / 9;
const SUN_FROM = -1.6, SUN_TO = H + 0.25, RISE = 4.2; // seconds

function useLedgerTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 1152;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { c, ctx: c.getContext("2d")!, tex };
  }, []);
}

function Slab({ glow, onReady }: { glow: React.RefObject<number>; onReady: () => void }) {
  const { c, ctx, tex } = useLedgerTexture();
  const face = useRef<THREE.MeshBasicMaterial>(null);
  const lines = useRef<string[]>([]);
  const acc = useRef(0);
  const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");

  useEffect(() => {
    lines.current = Array.from({ length: 64 }, () => `${hex(8)} ${hex(8)} ${hex(8)}`);
    onReady();
  }, [onReady]);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.12) { // scroll the ledger up one line
      acc.current = 0;
      lines.current.shift();
      lines.current.push(`${hex(8)} ${hex(8)} ${hex(8)}`);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.font = "500 20px 'IBM Plex Mono', ui-monospace, monospace";
      lines.current.forEach((l, i) => {
        ctx.fillStyle = i === 40 ? "rgba(255,90,70,0.95)" : `rgba(200,190,255,${0.25 + 0.5 * Math.sin((i / 64) * Math.PI)})`;
        ctx.fillText(l, 24, 34 + i * 17.6);
      });
      tex.needsUpdate = true;
    }
    if (face.current) face.current.opacity += ((glow.current ?? 0.08) - face.current.opacity) * Math.min(1, dt * 4);
  });

  return (
    <group position={[0, H / 2, 0]}>
      <mesh castShadow>
        <boxGeometry args={[W, H, D]} />
        <meshPhysicalMaterial color="#030304" metalness={0.75} roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.2} />
      </mesh>
      {/* engraved ledger on the front face */}
      <mesh position={[0, 0, D / 2 + 0.002]}>
        <planeGeometry args={[W * 0.92, H * 0.96]} />
        <meshBasicMaterial ref={face} map={tex} transparent opacity={0.08} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Sun({ onAligned }: { onAligned: () => void }) {
  const sun = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const fired = useRef(false);
  const reduce = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useFrame((_, dt) => {
    t.current = reduce ? RISE : Math.min(RISE, t.current + dt);
    const k = 1 - Math.pow(1 - t.current / RISE, 3);
    if (sun.current) sun.current.position.y = SUN_FROM + (SUN_TO - SUN_FROM) * k;
    if (!fired.current && k > 0.97) { fired.current = true; onAligned(); }
  });
  return (
    <mesh ref={sun} position={[0, SUN_FROM, -14]}>
      <sphereGeometry args={[0.55, 48, 48]} />
      <meshBasicMaterial color={[7, 6, 4.6]} toneMapped={false} fog={false} />
    </mesh>
  );
}

function Rig() {
  const { camera, pointer } = useThree();
  const look = useMemo(() => new THREE.Vector3(0, H * 0.62, 0), []);
  useFrame((_, dt) => {
    const s = Math.min(1, window.scrollY / (window.innerHeight * 0.8));
    const target = new THREE.Vector3(pointer.x * 0.9, 0.35 + s * 2.6 + pointer.y * 0.25, 8.2 - s * 2.4);
    camera.position.lerp(target, Math.min(1, dt * 2.2));
    look.y = H * 0.62 + s * 0.9;
    camera.lookAt(look);
  });
  return null;
}

function Scene({ onAligned }: { onAligned: () => void }) {
  const glow = useRef(0.08);
  const [ready, setReady] = useState(false);
  return (
    <>
      <color attach="background" args={["#000"]} />
      <fog attach="fog" args={["#070504", 9, 30]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} color="#fff1d6" position={[0, 2.5, -9]} scale={[9, 1.2, 1]} />
        <Lightformer form="rect" intensity={5} color="#ffe6c4" position={[0, 1.5, -3]} scale={[0.6, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#9fb4ff" position={[-6, 3, 4]} scale={[4, 6, 1]} rotation-y={Math.PI / 3} />
        <Lightformer form="ring" intensity={1.4} color="#ffd9a8" position={[4, 4, 3]} scale={2} />
      </Environment>
      <ambientLight intensity={0.05} />
      <directionalLight position={[0, 3, -10]} intensity={2.2} color="#ffe2b8" />
      {/* back light: rims the slab's edges against the sun */}
      <spotLight position={[0, H + 1, -4]} angle={0.5} penumbra={1} intensity={40} color="#ffd9a8" distance={12} />
      <group
        onPointerOver={() => (glow.current = 0.55)}
        onPointerOut={() => (glow.current = 0.08)}
      >
        <Slab glow={glow} onReady={() => setReady(true)} />
      </group>
      {ready && <Sun onAligned={onAligned} />}
      <Sparkles count={70} scale={[10, 4, 6]} position={[0, 1.8, -1]} size={1.6} speed={0.25} color="#ffd9a8" opacity={0.5} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial
          resolution={512} mirror={0.85} blur={[300, 80]} mixBlur={0.9} mixStrength={1.4}
          depthScale={0.6} minDepthThreshold={0.5} color="#020202" metalness={0.8} roughness={0.75}
        />
      </mesh>
      <Rig />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.85} intensity={1.1} mipmapBlur radius={0.75} />
        <Noise opacity={0.045} />
        <Vignette offset={0.25} darkness={0.85} />
      </EffectComposer>
    </>
  );
}

export default function Monolith3D({ onAligned }: { onAligned: () => void }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="monolith3d" aria-label={t("aria.monolith3d")}>
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ fov: 30, position: [0, 0.35, 8.2], near: 0.1, far: 80 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}
      >
        <Scene onAligned={onAligned} />
      </Canvas>
    </div>
  );
}
