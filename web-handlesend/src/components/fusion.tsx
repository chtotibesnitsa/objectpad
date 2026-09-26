import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, useTexture } from '@react-three/drei';
import { BackSide, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, OctahedronGeometry, PMREMGenerator, SRGBColorSpace, TubeGeometry, Vector3, type Group, type Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Shared 3D pieces for "object + stock = one paired coin": a liquid-glass stock chart, a gold-rimmed coin and a green
 * spark burst, plus the pose timeline both the homepage stage and the V2 page drive them with.
 */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeIn = (t: number): number => t * t * t;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeOutBack = (t: number): number => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

/** Fraction of the fusion timeline at which object and chart collide and the coin is born. */
export const FUSE_AT = 0.48;

export interface FusionPose { objX: number; objScale: number; objVisible: boolean; chartX: number; chartScale: number; chartTilt: number; chartVisible: boolean; coinScale: number; coinSpin: number; merge: number; split: number; }

/** Where everything sits at progress t (0..1): split apart, the glass chart flies in, both collide, the coin pops out. */
export function fusionPose(t: number, spread: number, intro = false): FusionPose {
  const start = intro ? 0.07 : 0;
  const split = easeInOut(clamp01((t - start) / 0.14));
  const chartIn = clamp01((t - start - 0.03) / 0.18);
  const merge = easeIn(clamp01((t - 0.37) / (FUSE_AT - 0.37)));
  const pop = intro ? easeOutBack(clamp01(t / 0.07)) : 1;
  const coinK = clamp01((t - FUSE_AT) / 0.16);
  const out = clamp01((t - 0.94) / 0.06);
  return {
    objX: -spread * split * (1 - merge), objScale: Math.max(0.001, pop * lerp(1, 0.5, split) * (1 - merge * 0.92)), objVisible: t < FUSE_AT,
    chartX: lerp(spread * 3.2, spread, easeOutBack(chartIn)) * (1 - merge), chartScale: Math.max(0.001, clamp01(chartIn * 1.8) * (1 - merge * 0.92)), chartTilt: -0.42 * (1 - merge), chartVisible: chartIn > 0 && t < FUSE_AT,
    coinScale: t < FUSE_AT ? 0.001 : Math.max(0.001, easeOutBack(coinK) * (1 - easeIn(out))), coinSpin: (1 - easeOut(coinK)) * Math.PI * 5,
    merge, split,
  };
}

/** A studio environment map (no network), used only by the glass and the coin so the rest of the scene keeps its look. */
export function useRoomEnv(): Texture {
  const gl = useThree(s => s.gl);
  const env = useMemo(() => { const pm = new PMREMGenerator(gl); const room = new RoomEnvironment(); const texture = pm.fromScene(room, 0.04).texture; pm.dispose(); return texture; }, [gl]);
  useEffect(() => () => env.dispose(), [env]);
  return env;
}

function seeded(seed: string): () => number {
  let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The stock face of the glass: ticker, live change and price, drawn crisp onto a canvas. */
export function useLabel(symbol: string, price: string, change: number | null): CanvasTexture | null {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 250; const g = canvas.getContext('2d'); if (!g) return null;
    g.clearRect(0, 0, 640, 250);
    g.fillStyle = '#0C0D10'; g.font = '800 104px Anybody, Geist, Arial, sans-serif'; g.textBaseline = 'alphabetic'; g.fillText(symbol, 22, 112);
    const up = (change ?? 0) >= 0; const pill = change === null ? 'LIVE' : `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
    g.font = '800 40px "Geist Mono", monospace'; const w = g.measureText(pill).width + 40; const x = 618 - w;
    g.fillStyle = change === null ? '#0C0D10' : up ? '#12A150' : '#E5484D'; g.beginPath(); g.roundRect(x, 40, w, 64, 32); g.fill();
    g.fillStyle = '#FFFFFF'; g.fillText(pill, x + 20, 86);
    g.fillStyle = 'rgba(12,13,16,.78)'; g.font = '700 58px "Geist Mono", monospace'; g.fillText(price, 24, 200);
    g.fillStyle = 'rgba(12,13,16,.45)'; g.font = '800 26px "Geist Mono", monospace'; g.fillText('ROBINHOOD CHAIN · ON-CHAIN PRICE', 24, 240);
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; result.anisotropy = 4; return result;
  }, [symbol, price, change]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  return texture;
}

/** Deterministic mini bar-chart heights for a symbol, shared by the glass chart and the minted coin's live ticker. */
export function useBars(symbol: string, count = 10): { x: number; h: number }[] {
  return useMemo(() => {
    const rand = seeded(symbol); let h = 0.07; const step = count > 1 ? 1 / (count - 1) : 1;
    return Array.from({ length: count }, (_, i) => { h = Math.min(0.32, Math.max(0.05, h + 0.018 + (rand() - 0.32) * 0.07)); return { x: -0.5 + i * step, h: i === count - 1 ? 0.34 : h }; });
  }, [symbol, count]);
}

/** A liquid-glass slab holding a live stock chart: rising green candles, a glowing trend line and the ticker on the face. */
export function GlassChart({ symbol, price, change, env, innerRef }: { symbol: string; price: string; change: number | null; env: Texture; innerRef: MutableRefObject<Group | null> }) {
  const bars = useBars(symbol);
  const tube = useMemo(() => new TubeGeometry(new CatmullRomCurve3(bars.map(b => new Vector3(b.x, -0.42 + b.h + 0.05, 0.03))), 80, 0.013, 8, false), [bars]);
  const label = useLabel(symbol, price, change);
  const mats = useMemo(() => ({
    glass: new MeshPhysicalMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.34, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, envMapIntensity: 1.8, depthWrite: false }),
    rim: new MeshPhysicalMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, roughness: 0.12, clearcoat: 1, envMap: env, envMapIntensity: 1.4, side: BackSide, depthWrite: false }),
    bar: new MeshStandardMaterial({ color: '#12A150', emissive: new Color('#12A150'), emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.1, envMap: env, envMapIntensity: 0.8 }),
    line: new MeshBasicMaterial({ color: '#1BD56A', toneMapped: false }),
  }), [env]);
  useEffect(() => () => { Object.values(mats).forEach(m => m.dispose()); tube.dispose(); }, [mats, tube]);
  return <group ref={innerRef} visible={false}>
    {bars.map((b, i) => <mesh key={i} position={[b.x, -0.42 + b.h / 2, 0]} material={mats.bar}><boxGeometry args={[0.064, b.h, 0.064]}/></mesh>)}
    <mesh geometry={tube} material={mats.line}/>
    <RoundedBox args={[1.34, 1.02, 0.18]} radius={0.07} smoothness={4} material={mats.glass} renderOrder={2}/>
    <RoundedBox args={[1.37, 1.05, 0.2]} radius={0.08} smoothness={4} material={mats.rim} renderOrder={1}/>
    {label && <mesh position={[0, 0.25, 0.095]} renderOrder={3}><planeGeometry args={[1.18, 0.461]}/><meshBasicMaterial map={label} transparent toneMapped={false} depthWrite={false}/></mesh>}
  </group>;
}

/** Live ticker chip baked onto a minted coin: a small glass plaque with a mini sparkline, symbol, live price and 24h change, so the pair's real market data rides along on the coin itself once object and stock merge. */
function CoinTicker({ symbol, price, change, env }: { symbol: string; price: string; change: number | null; env: Texture }) {
  const bars = useBars(symbol, 6);
  const label = useLabel(symbol, price, change);
  const mats = useMemo(() => ({
    plaque: new MeshPhysicalMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.92, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 1.2 }),
    bar: new MeshStandardMaterial({ color: '#12A150', emissive: new Color('#12A150'), emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1 }),
  }), [env]);
  useEffect(() => () => { mats.plaque.dispose(); mats.bar.dispose(); }, [mats]);
  return <group position={[0.42, -0.56, 0.12]} rotation={[0, 0, 0.06]} scale={0.4}>
    <RoundedBox args={[1.5, 0.66, 0.1]} radius={0.09} smoothness={4} material={mats.plaque} renderOrder={4}/>
    {bars.map((b, i) => <mesh key={i} position={[b.x * 1.2, -0.16 + (b.h * 0.9) / 2, 0.07]} material={mats.bar} renderOrder={5}><boxGeometry args={[0.07, Math.max(0.06, b.h * 0.9), 0.07]}/></mesh>)}
    {label && <mesh position={[0, 0.2, 0.075]} renderOrder={5}><planeGeometry args={[1.36, 0.44]}/><meshBasicMaterial map={label} transparent toneMapped={false} depthWrite={false}/></mesh>}
  </group>;
}

/** One minted coin: the object's coin art upright on both faces (circular UVs, so nothing appears rotated onto its side), a polished gold rim, and the paired stock's live price baked on as a ticker chip. */
export function PairCoin({ art, pair, env, innerRef }: { art: string; pair: { symbol: string; price: string; change: number | null }; env: Texture; innerRef: MutableRefObject<Group | null> }) {
  const map = useTexture(art);
  const mats = useMemo(() => {
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
    return { face: new MeshBasicMaterial({ map, toneMapped: false }), rim: new MeshStandardMaterial({ color: '#E2B43C', metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 1.5 }) };
  }, [map, env]);
  useEffect(() => () => { mats.face.dispose(); mats.rim.dispose(); }, [mats]);
  return <group ref={innerRef} visible={false}>
    <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.rim}><cylinderGeometry args={[0.62, 0.62, 0.11, 72, 1, true]}/></mesh>
    <mesh position={[0, 0, 0.056]} material={mats.face}><circleGeometry args={[0.62, 72]}/></mesh>
    <mesh position={[0, 0, -0.056]} rotation={[0, Math.PI, 0]} material={mats.face}><circleGeometry args={[0.62, 72]}/></mesh>
    {[0.056, -0.056].map(z => <mesh key={z} position={[0, 0, z]} material={mats.rim}><torusGeometry args={[0.62, 0.03, 14, 96]}/></mesh>)}
    <CoinTicker symbol={pair.symbol} price={pair.price} change={pair.change} env={env}/>
  </group>;
}

const BURST = 140; const EMBERS = 46; const SPARK_COLORS = ['#1BD56A', '#12A150', '#7CF2A8', '#0E8A43', '#1BD56A', '#F2C94C'];

/** Green sparks: a burst out of the collision, shockwave rings and a flash, then embers drifting up around the coin. `ageOf` returns seconds since the collision (negative = idle). */
export function Sparks({ ageOf, y = 0.3 }: { ageOf: () => number; y?: number }) {
  const mesh = useRef<InstancedMesh>(null); const rings = useRef<(Mesh | null)[]>([]); const flash = useRef<Mesh>(null);
  const seeds = useMemo(() => {
    const rand = seeded('objectpad-sparks');
    const burst = Array.from({ length: BURST }, () => { const v = new Vector3(rand() * 2 - 1, rand() * 2 - 1 + 0.3, (rand() * 2 - 1) * 0.5).normalize(); return { v, speed: 1.3 + rand() * 2.9, life: 0.7 + rand() * 1.0, size: 0.018 + rand() * 0.036, spin: rand() * 12 }; });
    const embers = Array.from({ length: EMBERS }, () => ({ angle: rand() * Math.PI * 2, r: 0.75 + rand() * 0.9, offset: rand(), speed: 0.3 + rand() * 0.35, size: 0.014 + rand() * 0.022 }));
    return { burst, embers };
  }, []);
  const geo = useMemo(() => new OctahedronGeometry(1, 0), []); const mat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  const ringMats = useMemo(() => [0, 1].map(i => new MeshBasicMaterial({ color: i ? '#7CF2A8' : '#12A150', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false, toneMapped: false })), []);
  const flashMat = useMemo(() => new MeshBasicMaterial({ color: '#C8FFE0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); ringMats.forEach(m => m.dispose()); flashMat.dispose(); }, [geo, mat, ringMats, flashMat]);
  useEffect(() => { const m = mesh.current; if (!m) return; const c = new Color(); for (let i = 0; i < BURST + EMBERS; i++) m.setColorAt(i, c.set(SPARK_COLORS[i % SPARK_COLORS.length])); if (m.instanceColor) m.instanceColor.needsUpdate = true; }, []);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const a = ageOf(); const m = mesh.current; if (!m) return;
    const on = a >= 0; m.visible = on;
    rings.current.forEach((ring, i) => { if (!ring) return; const local = a - i * 0.14; const show = on && local >= 0 && local < 0.8; ring.visible = show; if (!show) return; ring.scale.setScalar(0.35 + local * 3.4); ringMats[i].opacity = (1 - local / 0.8) * 0.8; });
    if (flash.current) { const show = on && a < 0.4; flash.current.visible = show; if (show) { flash.current.scale.setScalar(0.25 + a * 3.2); flashMat.opacity = (1 - a / 0.4) * 0.6; } }
    if (!on) return;
    seeds.burst.forEach((s, i) => {
      const k = a / s.life;
      if (k >= 1) { dummy.scale.setScalar(0); }
      else { const d = s.speed * a * (1 - 0.42 * Math.min(a, 1.2)); dummy.position.set(s.v.x * d, y + s.v.y * d - 0.9 * a * a, s.v.z * d); dummy.scale.setScalar(s.size * Math.sqrt(1 - k)); dummy.rotation.set(a * s.spin, a * s.spin * 0.7, 0); }
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    const fade = clamp01((a - 0.2) * 2);
    seeds.embers.forEach((s, i) => {
      const p = (a * s.speed + s.offset) % 1; const angle = s.angle + a * 0.5;
      dummy.position.set(Math.cos(angle) * s.r, y - 0.9 + p * 2.1, Math.sin(angle) * s.r * 0.55); dummy.scale.setScalar(s.size * Math.sin(p * Math.PI) * fade); dummy.rotation.set(a * 3, a * 2, 0);
      dummy.updateMatrix(); m.setMatrixAt(BURST + i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <group>
    <instancedMesh ref={mesh} args={[geo, mat, BURST + EMBERS]} frustumCulled={false} visible={false}/>
    {[0, 1].map(i => <mesh key={i} ref={r => { rings.current[i] = r; }} position={[0, y, -0.05]} material={ringMats[i]} visible={false}><ringGeometry args={[0.94, 1, 96]}/></mesh>)}
    <mesh ref={flash} position={[0, y, 0]} material={flashMat} visible={false}><sphereGeometry args={[1, 24, 24]}/></mesh>
  </group>;
}
