import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { CANVAS_DPR, IS_TOUCH } from '@/lib/perf';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls, RoundedBox, useGLTF, useTexture } from '@react-three/drei';
import { AdditiveBlending, Box3, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Plane, PointLight, SRGBColorSpace, Vector3, type Material } from 'three';
import { VIEWS } from '@/shared/domain';

import { PHASE_MS, SHOT_AT, type ScanClock } from './scanClock';

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const PINK = '#3A3E47'; const LIME = '#FFFFFF'; const AMBER = '#9AA3B2';
/** Scan path with azimuths unwrapped so the phone always keeps walking in one direction. */
const SHOTS = VIEWS.reduce<{ az: number; el: number }[]>((path, view) => { let az = view.azimuth; const last = path[path.length - 1]; while (last && az <= last.az) az += 360; path.push({ az, el: view.elevation }); return path; }, []);
const RIG_OFFSET = -40;
const deg = (d: number): number => (d * Math.PI) / 180;

interface Built { solid: Group; wire: Group; ghost: Group; materials: Material[]; wireMat: MeshBasicMaterial; ghostMat: MeshBasicMaterial; solidPlane: Plane; bandLow: Plane; bandHigh: Plane; ghostPlane: Plane; scale: number; center: Vector3; height: number; radius: number; }

/**
 * Loads a GLB without touching its (quantized, meshopt-compressed) vertex data. Normalisation is done with a parent
 * transform, never by baking matrices into geometry; baking into normalized integer attributes is what produced the
 * stretched "spike" triangles before. Three clones share geometry: textured solid, the rebuild band and a faint ghost.
 */
function useSpecimen(src: string): Built {
  const { scene } = useGLTF(src);
  const built = useMemo<Built>(() => {
    const solidPlane = new Plane(new Vector3(0, -1, 0), 100); const bandLow = new Plane(new Vector3(0, 1, 0), 100); const bandHigh = new Plane(new Vector3(0, -1, 0), 100); const ghostPlane = new Plane(new Vector3(0, 1, 0), 100);
    const solid = scene.clone(true); const wire = scene.clone(true); const ghost = scene.clone(true); const materials: Material[] = [];
    solid.traverse(node => { if (!(node instanceof Mesh)) return; const source = (Array.isArray(node.material) ? node.material[0] : node.material) as Material; const material = source.clone(); if (material instanceof MeshStandardMaterial) material.roughness = Math.max(material.roughness, 0.42); material.clippingPlanes = [solidPlane]; node.material = material; materials.push(material); });
    const wireMat = new MeshBasicMaterial({ color: PINK, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false, clippingPlanes: [bandLow, bandHigh] });
    const ghostMat = new MeshBasicMaterial({ color: '#C9CED8', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [ghostPlane] });
    wire.traverse(node => { if (node instanceof Mesh) node.material = wireMat; }); ghost.traverse(node => { if (node instanceof Mesh) node.material = ghostMat; });
    solid.updateMatrixWorld(true); const box = new Box3().setFromObject(solid); const size = box.getSize(new Vector3()); const center = box.getCenter(new Vector3());
    const scale = 2.2 / Math.max(size.x, size.y, size.z, 0.0001);
    return { solid, wire, ghost, materials, wireMat, ghostMat, solidPlane, bandLow, bandHigh, ghostPlane, scale, center, height: size.y * scale, radius: (Math.max(size.x, size.z) * scale) / 2 };
  }, [scene]);
  useEffect(() => () => { built.materials.forEach(m => m.dispose()); built.wireMat.dispose(); built.ghostMat.dispose(); }, [built]);
  return built;
}

/** Phone screen: a dark camera viewfinder with lime corner brackets and a shutter button. */
function useScreenTexture(): CanvasTexture | null {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512; const g = canvas.getContext('2d'); if (!g) return null;
    const gradient = g.createLinearGradient(0, 0, 0, 512); gradient.addColorStop(0, '#1b1d24'); gradient.addColorStop(1, '#08090c'); g.fillStyle = gradient; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = LIME; g.lineWidth = 9; g.lineCap = 'round';
    const corner = (x: number, y: number, dx: number, dy: number) => { g.beginPath(); g.moveTo(x, y + dy); g.lineTo(x, y); g.lineTo(x + dx, y); g.stroke(); };
    corner(48, 120, 44, 44); corner(208, 120, -44, 44); corner(48, 360, 44, -44); corner(208, 360, -44, -44);
    g.fillStyle = LIME; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.fillText('SCAN', 128, 72);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 448, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1B1D22'; g.beginPath(); g.arc(128, 448, 22, 0, Math.PI * 2); g.fill();
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; return result;
  }, []);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  return texture;
}

function Phone({ phoneRef, flashRef, coneRef, lightRef, reach }: { phoneRef: MutableRefObject<Group | null>; flashRef: MutableRefObject<Mesh | null>; coneRef: MutableRefObject<Mesh | null>; lightRef: MutableRefObject<PointLight | null>; reach: number }) {
  const screen = useScreenTexture();
  return <group ref={phoneRef} visible={false}><group scale={1.45}>
    <RoundedBox args={[0.38, 0.78, 0.05]} radius={0.055} smoothness={4}><meshStandardMaterial color="#17181d" metalness={0.65} roughness={0.28}/></RoundedBox>
    <mesh position={[0, 0, -0.0262]} rotation={[0, Math.PI, 0]}><planeGeometry args={[0.345, 0.74]}/><meshBasicMaterial map={screen} color={screen ? '#ffffff' : '#0c0d10'} toneMapped={false}/></mesh>
    <RoundedBox args={[0.17, 0.17, 0.022]} radius={0.03} smoothness={3} position={[-0.085, 0.28, 0.034]}><meshStandardMaterial color="#26272e" metalness={0.5} roughness={0.35}/></RoundedBox>
    {[[-0.12, 0.31], [-0.05, 0.25], [-0.12, 0.25]].map(([x, y], i) => <mesh key={i} position={[x, y, 0.047]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.024, 0.024, 0.012, 24]}/><meshStandardMaterial color="#050507" metalness={0.9} roughness={0.1}/></mesh>)}
    <mesh ref={flashRef} position={[-0.05, 0.31, 0.047]}><sphereGeometry args={[0.012, 12, 12]}/><meshBasicMaterial color="#ffffff" toneMapped={false}/></mesh>
    <mesh ref={coneRef} position={[0, 0, reach / 2.9]} rotation={[-Math.PI / 2, 0, 0]} visible={false}><coneGeometry args={[0.4, reach / 1.45, 32, 1, true]}/><meshBasicMaterial color={PINK} transparent opacity={0} depthWrite={false} side={DoubleSide} blending={AdditiveBlending}/></mesh>
    <pointLight ref={lightRef} position={[0, 0, 0.3]} intensity={0} distance={4} color="#ffffff"/>
  </group></group>;
}

const COIN_COLORS = ['#C9CED8', '#1B1D22', '#E6E8EC', '#9AA3B2', '#C9CED8', '#1B1D22', '#E6E8EC', '#9AA3B2', '#C9CED8', '#1B1D22'];

/** A fountain of glossy, coloured coins stamped with the object's coin art. */
function CoinFountain({ coin, clock, radius, height }: { coin: string; clock: MutableRefObject<ScanClock>; radius: number; height: number }) {
  const art = useTexture(coin);
  const materials = useMemo(() => { art.colorSpace = SRGBColorSpace; const cap = new MeshStandardMaterial({ map: art, metalness: 0.25, roughness: 0.35 }); return { cap, sides: COIN_COLORS.map(color => new MeshStandardMaterial({ color: new Color(color), metalness: 0.7, roughness: 0.22, emissive: new Color(color), emissiveIntensity: 0.06 })) }; }, [art]);
  useEffect(() => () => { materials.cap.dispose(); materials.sides.forEach(m => m.dispose()); }, [materials]);
  const coins = useRef<(Group | null)[]>([]);
  const seeds = useMemo(() => COIN_COLORS.map((_, i) => ({ angle: (i / COIN_COLORS.length) * Math.PI * 2, orbit: radius * 0.9 + 0.35 + (i % 3) * 0.18, offset: i / COIN_COLORS.length, tilt: (i % 2 ? 1 : -1) * 0.4 })), [radius]);
  useFrame((_, delta) => {
    const { phase, startedAt } = clock.current; const t = (performance.now() - startedAt) / PHASE_MS[4];
    coins.current.forEach((group, i) => {
      if (!group) return; const seed = seeds[i]; const on = phase === 4 && t > 0.04; group.visible = on; if (!on) return;
      const p = ((t - 0.04) * 1.35 + seed.offset) % 1; const angle = seed.angle + p * 2.4;
      group.position.set(Math.cos(angle) * seed.orbit, -height / 2 + p * (height + 1.9), Math.sin(angle) * seed.orbit);
      group.scale.setScalar(Math.max(0.001, Math.sin(p * Math.PI) * 1.15)); group.rotation.y += delta * 4.2; group.rotation.z = seed.tilt;
    });
  });
  return <>{seeds.map((_, i) => <group key={i} ref={g => { coins.current[i] = g; }} visible={false}><mesh rotation={[Math.PI / 2, 0, 0]} material={[materials.sides[i], materials.cap, materials.cap]}><cylinderGeometry args={[0.2, 0.2, 0.045, 48]}/></mesh></group>)}</>;
}

const SHARDS = 30;

function Specimen({ src, coin, clock, onReady }: { src: string; coin: string; clock: MutableRefObject<ScanClock>; onReady: () => void }) {
  const built = useSpecimen(src); const { solid, wire, ghost, wireMat, ghostMat, solidPlane, bandLow, bandHigh, ghostPlane, scale, center, height, radius } = built;
  const spin = useRef<Group>(null); const ring = useRef<Mesh>(null); const halo = useRef<Mesh>(null); const halo2 = useRef<Mesh>(null);
  const phone = useRef<Group | null>(null); const flash = useRef<Mesh | null>(null); const cone = useRef<Mesh | null>(null); const light = useRef<PointLight | null>(null);
  const shards = useRef<(Mesh | null)[]>([]);
  const reach = Math.max(1.9, radius + 1.2);
  const shardSeeds = useMemo(() => Array.from({ length: SHARDS }, (_, i) => ({ angle: (i / SHARDS) * Math.PI * 2 + (i % 3) * 0.4, r: radius * (0.35 + ((i * 37) % 10) / 12), offset: ((i * 53) % SHARDS) / SHARDS, spin: 1 + (i % 4) })), [radius]);
  const shardMats = useMemo(() => [new MeshBasicMaterial({ color: PINK, side: DoubleSide }), new MeshBasicMaterial({ color: '#1B1D22', side: DoubleSide }), new MeshBasicMaterial({ color: AMBER, side: DoubleSide })], []);
  useEffect(() => () => shardMats.forEach(m => m.dispose()), [shardMats]);
  useEffect(() => { onReady(); }, [onReady]);

  useFrame((_, delta) => {
    const now = performance.now(); const { phase, startedAt } = clock.current; const t = clamp((now - startedAt) / PHASE_MS[phase]);
    const bottom = -height / 2 - 0.03; const top = height / 2 + 0.03; const band = Math.max(0.18, height * 0.14);
    let build = 100; let rebuilding = false; let ghostOpacity = 0;
    if (phase === 2) {
      if (t < 0.06) { build = lerp(top, bottom, ease(t / 0.06)); rebuilding = true; }
      else if (t < 0.46) { build = lerp(bottom, top, ease((t - 0.06) / 0.4)); rebuilding = true; }
      ghostOpacity = t < 0.46 ? 0.55 : 0;
    }
    solidPlane.constant = build; bandLow.constant = -build; bandHigh.constant = build + band; ghostPlane.constant = -build;
    wireMat.visible = rebuilding; ghostMat.opacity = ghostOpacity; ghostMat.visible = ghostOpacity > 0.005;
    if (spin.current) spin.current.rotation.y += delta * [0.45, 0, 0.22, 0.5, 0.3][phase];
    if (ring.current) { ring.current.visible = rebuilding && build > bottom + 0.02 && build < top - 0.02; ring.current.position.y = build; }
    shards.current.forEach((shard, i) => {
      if (!shard) return; const seed = shardSeeds[i]; const on = rebuilding && t > 0.14; shard.visible = on; if (!on) return;
      const p = (now / 900 + seed.offset) % 1; const angle = seed.angle + now / 2400;
      shard.position.set(Math.cos(angle) * seed.r, build + (1 - p) * 1.25, Math.sin(angle) * seed.r); shard.scale.setScalar(0.03 + 0.07 * (1 - p)); shard.rotation.set(now / 400 * seed.spin, now / 600, 0);
    });
    [halo.current, halo2.current].forEach((mesh, i) => { if (!mesh) return; const on = phase === 3; mesh.visible = on; if (!on) return; const local = (t * 1.8 + i * 0.5) % 1; mesh.scale.setScalar(1 + local * 1.3); (mesh.material as MeshBasicMaterial).opacity = (1 - local) * 0.7; });
    const rig = phone.current;
    if (rig) {
      rig.visible = phase === 1;
      if (phase === 1) {
        const segment = 1 / SHOTS.length; const index = Math.min(SHOTS.length - 1, Math.floor(t / segment)); const local = (t - index * segment) / segment;
        const target = SHOTS[index]; const from = index === 0 ? { az: target.az - 70, el: 12 } : SHOTS[index - 1]; const k = ease(clamp(local / 0.5));
        const az = deg(lerp(from.az, target.az, k) + RIG_OFFSET); const el = deg(lerp(from.el, target.el, k));
        rig.position.set(Math.sin(az) * Math.cos(el) * reach, Math.sin(el) * reach * 0.9 + 0.05, Math.cos(az) * Math.cos(el) * reach);
        rig.lookAt(0, 0, 0); rig.scale.setScalar(Math.max(0.001, Math.min(1, t / 0.05, (1 - t) / 0.04)));
        const burst = local >= SHOT_AT && local < SHOT_AT + 0.2 ? 1 - (local - SHOT_AT) / 0.2 : 0;
        if (light.current) light.current.intensity = burst * 14;
        if (flash.current) flash.current.scale.setScalar(1 + burst * 5);
        if (cone.current) { cone.current.visible = burst > 0; (cone.current.material as MeshBasicMaterial).opacity = burst * 0.16; }
      }
    }
  });

  return <group>
    <group ref={spin}>
      <group scale={scale}><group position={[-center.x, -center.y, -center.z]}><primitive object={solid}/><primitive object={wire}/><primitive object={ghost}/></group></group>
    </group>
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} visible={false}><torusGeometry args={[radius * 1.12 + 0.06, 0.008, 8, 120]}/><meshBasicMaterial color={PINK} toneMapped={false}/></mesh>
    {shardSeeds.map((_, i) => <mesh key={i} ref={m => { shards.current[i] = m; }} material={shardMats[i % 3]} visible={false}><circleGeometry args={[1, 3]}/></mesh>)}
    {[halo, halo2].map((ref, i) => <mesh key={i} ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -height / 2 + 0.01, 0]} visible={false}><ringGeometry args={[radius * 0.95, radius * 0.95 + 0.035, 96]}/><meshBasicMaterial color={i ? '#1B1D22' : PINK} transparent depthWrite={false}/></mesh>)}
    <Phone phoneRef={phone} flashRef={flash} coneRef={cone} lightRef={light} reach={reach}/>
    <Suspense fallback={null}><CoinFountain coin={coin} clock={clock} radius={radius} height={height}/></Suspense>
    <ContactShadows position={[0, -height / 2 - 0.02, 0]} opacity={0.32} scale={7} blur={2.6} far={3.5} frames={1}/>
  </group>;
}

/** Warms the cache for the next exhibit so switching objects never flashes an empty stage. */
function Preload({ src, coin }: { src: string; coin: string }) { useEffect(() => { useGLTF.preload(src); useTexture.preload(coin); }, [src, coin]); return null; }

/**
 * Auto-playing capture-to-coin stage. The model is always centred and can be orbited 360° by dragging (no pan, no
 * zoom) while the five steps play: spin, phone scan, bottom-up rebuild, one-of-one check and the coin launch.
 */
export default function ScanScene({ src, coin, next, nextCoin, clock, active, onReady }: { src: string; coin: string; next: string; nextCoin: string; clock: MutableRefObject<ScanClock>; active: boolean; onReady: () => void }) {
  return <Canvas dpr={CANVAS_DPR} camera={{ position: [0, 0.45, 6.3], fov: 32 }} gl={{ antialias: !IS_TOUCH, alpha: true, powerPreference: 'default' }} frameloop={active ? 'always' : 'demand'} onCreated={({ gl }) => { gl.localClippingEnabled = true; }} className="touch-pan-y cursor-grab active:cursor-grabbing">
    <ambientLight intensity={1.25}/><hemisphereLight args={['#ffffff', '#d9d7cf', 0.9]}/><directionalLight position={[3.5, 5, 4]} intensity={2.3}/><directionalLight position={[-4, 1.5, -3]} intensity={0.9} color="#e6ecff"/>
    <Suspense fallback={null}><Specimen key={src} src={src} coin={coin} clock={clock} onReady={onReady}/></Suspense>
    <Preload src={next} coin={nextCoin}/>
    <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping dampingFactor={0.08} rotateSpeed={0.85} minPolarAngle={0.35} maxPolarAngle={1.95} target={[0, 0, 0]}/>
  </Canvas>;
}
