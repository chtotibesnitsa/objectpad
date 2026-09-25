import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CANVAS_DPR, IS_TOUCH } from '@/lib/perf';
import { useInView } from '@/hooks/use-in-view';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, Plane, PointsMaterial, Vector3 } from 'three';
import type { MemeExhibit } from '@/lib/memes';

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** One loop, in seconds: dense dots → a quick scan fills in the solid model → long hold → quick scan back → dots. */
const LOOP = { dots: 1.1, up: 0.9, solid: 4.6, down: 0.9 };
const TOTAL = LOOP.dots + LOOP.up + LOOP.solid + LOOP.down;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function levelAt(t: number): number {
  const lo = -1.08; const hi = 1.08;
  if (t < LOOP.dots) return lo;
  if (t < LOOP.dots + LOOP.up) return lo + (hi - lo) * ease((t - LOOP.dots) / LOOP.up);
  if (t < LOOP.dots + LOOP.up + LOOP.solid) return hi;
  return hi - (hi - lo) * ease((t - LOOP.dots - LOOP.up - LOOP.solid) / LOOP.down);
}

function Morph({ exhibit, onLoop, active, held }: { exhibit: MemeExhibit; onLoop: () => void; active: boolean; held: boolean }) {
  const { scene } = useGLTF(exhibit.url);
  const [cloud, setCloud] = useState<{ p: number[]; c: string[] } | null>(null);
  useEffect(() => { let alive = true; void fetch(exhibit.points).then(r => r.json() as Promise<{ p: number[]; c: string[] }>).then(d => { if (alive) setCloud(d); }).catch(() => undefined); return () => { alive = false; }; }, [exhibit.points]);
  const keepBelow = useMemo(() => new Plane(new Vector3(0, -1, 0), -1.08), []);
  const keepAbove = useMemo(() => new Plane(new Vector3(0, 1, 0), 1.08), []);
  const model = useMemo(() => {
    const copy = scene.clone(true); const materials: Material[] = [];
    copy.traverse(node => { if (node instanceof Mesh) { const list = (Array.isArray(node.material) ? node.material : [node.material]).map(m => { const next = m.clone(); next.clippingPlanes = [keepBelow]; next.side = DoubleSide; materials.push(next); return next; }); node.material = Array.isArray(node.material) ? list : list[0]; } });
    copy.updateMatrixWorld(true); const box = new Box3().setFromObject(copy); const size = box.getSize(new Vector3()); const center = box.getCenter(new Vector3());
    return { copy, materials, scale: 2 / Math.max(size.x, size.y, size.z, 1e-6), center, height: (size.y * 2) / Math.max(size.x, size.y, size.z, 1e-6) };
  }, [scene, keepBelow]);
  const points = useMemo(() => {
    if (!cloud) return null;
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(cloud.p), 3));
    const colors = new Float32Array(cloud.c.length * 3); const color = new Color(); cloud.c.forEach((hex, i) => { color.set(hex); colors.set([color.r, color.g, color.b], i * 3); });
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    return { geometry, material: new PointsMaterial({ size: 0.042, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 1, clippingPlanes: [keepAbove], depthWrite: true }) };
  }, [cloud, keepAbove]);
  useEffect(() => () => { model.materials.forEach(m => m.dispose()); }, [model]);
  useEffect(() => () => { points?.geometry.dispose(); points?.material.dispose(); }, [points]);
  const glow = useRef<Mesh>(null); const spinner = useRef<Group>(null); const clock = useRef<number>(0); const looped = useRef<boolean>(false);
  // A soft white light sheet instead of a hard coloured line.
  const glowMaterial = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }), []);
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);
  useFrame((_, delta) => {
    if (!active) return;
    // While someone drags the model, show it solid and pause the loop.
    if (held) { keepBelow.constant = 9; keepAbove.constant = -9; glowMaterial.opacity = 0; return; }
    clock.current += Math.min(delta, 0.05); const t = clock.current % TOTAL;
    if (clock.current > TOTAL && !looped.current) { looped.current = true; onLoop(); }
    const level = levelAt(t); keepBelow.constant = level; keepAbove.constant = -level;
    if (glow.current) { glow.current.position.y = level; glowMaterial.opacity = level > -1.06 && level < 1.06 ? 0.22 : 0; }
    if (spinner.current) spinner.current.rotation.y += delta * 0.5;
  });
  return <group ref={spinner}>
    <group scale={model.scale}><group position={[-model.center.x, -model.center.y, -model.center.z]}><primitive object={model.copy}/></group></group>
    {points && <points geometry={points.geometry} material={points.material}/>}
    <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} material={glowMaterial}><circleGeometry args={[1.3, 64]}/></mesh>
  </group>;
}

/**
 * A real scanned model that loops from its dense colour point cloud into the solid, textured model and back. The scan
 * is quick and the solid model holds most of the loop; dragging always shows the full model.
 */
export default function MorphViewer({ exhibits, active: wanted = true, onExhibit, fallback }: { exhibits: MemeExhibit[]; active?: boolean; onExhibit?: (e: MemeExhibit) => void; fallback: ReactNode }) {
  const box = useRef<HTMLDivElement>(null); const seen = useInView(box, '40px'); const active = wanted && seen;
  const [index, setIndex] = useState<number>(0); const [held, setHeld] = useState<boolean>(false); const exhibit = exhibits[index % exhibits.length];
  useEffect(() => { onExhibit?.(exhibit); }, [exhibit, onExhibit]);
  useEffect(() => { useGLTF.preload(exhibits[(index + 1) % exhibits.length].url); }, [index, exhibits]);
  return <div ref={box} className="touch-pan-y absolute inset-0"><Boundary fallback={fallback}>
    <Canvas dpr={CANVAS_DPR} camera={{ position: [0, 0.6, 4.3], fov: 36 }} gl={{ antialias: !IS_TOUCH, alpha: true, localClippingEnabled: true }} frameloop={active ? 'always' : 'demand'} onCreated={({ gl }) => { gl.localClippingEnabled = true; }} onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)} className="cursor-grab active:cursor-grabbing">
      <ambientLight intensity={1.3}/><hemisphereLight args={['#ffffff', '#c9cad6', 0.8]}/><directionalLight position={[3, 5, 4]} intensity={2.3}/><directionalLight position={[-4, 2, -3]} intensity={0.9} color="#e6ebf5"/>
      <Suspense fallback={null}><Morph key={exhibit.id} exhibit={exhibit} active={active} held={held} onLoop={() => setIndex(i => i + 1)}/></Suspense>
      <OrbitControls makeDefault enablePan={false} enableZoom={false} minPolarAngle={0.6} maxPolarAngle={1.8}/>
    </Canvas>
  </Boundary></div>;
}
