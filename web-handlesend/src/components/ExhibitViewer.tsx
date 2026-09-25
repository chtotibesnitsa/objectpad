import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CANVAS_DPR, IS_TOUCH } from '@/lib/perf';
import { useInView } from '@/hooks/use-in-view';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Loads a GLB and normalises it with a parent transform (never by baking geometry) so it always fills the stage. */
function Model({ src, onReady }: { src: string; onReady?: () => void }) {
  const { scene } = useGLTF(src);
  useEffect(() => { onReady?.(); }, [scene, onReady]);
  const { clone, scale, center, height } = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse(node => { if (node instanceof Mesh) { const material = Array.isArray(node.material) ? node.material[0] : node.material; if (material instanceof MeshStandardMaterial) { const next = material.clone(); next.roughness = Math.max(next.roughness, 0.4); node.material = next; } } });
    copy.updateMatrixWorld(true); const box = new Box3().setFromObject(copy); const size = box.getSize(new Vector3()); const factor = 2 / Math.max(size.x, size.y, size.z, 0.0001);
    return { clone: copy, scale: factor, center: box.getCenter(new Vector3()), height: size.y * factor };
  }, [scene]);
  useEffect(() => () => { clone.traverse(node => { if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose()); }); }, [clone]);
  return <group>
    <group scale={scale}><group position={[-center.x, -center.y, -center.z]}><primitive object={clone}/></group></group>
    <ContactShadows position={[0, -height / 2 - 0.02, 0]} opacity={0.28} scale={6} blur={2.4} far={3} frames={1}/>
  </group>;
}

/** Keeps a model facing the viewer with a slow, small sway instead of a full turn. */
function Sway({ children, active }: { children: ReactNode; active: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (ref.current && active) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.9) * 0.28; });
  return <group ref={ref}>{children}</group>;
}

/** Drag-to-orbit 3D viewer for a demo exhibit. `front` keeps the object facing forward. Pauses rendering off screen. */
export default function ExhibitViewer({ src, active: wanted, fallback, front = false, onReady, speed = 2.4 }: { src: string; active: boolean; fallback: ReactNode; front?: boolean; onReady?: () => void; speed?: number }) {
  const box = useRef<HTMLDivElement>(null); const seen = useInView(box, '40px'); const active = wanted && seen;
  return <div ref={box} className="touch-pan-y absolute inset-0"><Boundary fallback={fallback}>
    <Canvas dpr={CANVAS_DPR} camera={{ position: [0, 0.55, 4.6], fov: 34 }} gl={{ antialias: !IS_TOUCH, alpha: true }} frameloop={active ? 'always' : 'demand'}>
      <ambientLight intensity={1.35}/><hemisphereLight args={['#ffffff', '#c9cad6', 0.8]}/><directionalLight position={[3, 5, 4]} intensity={2.4}/><directionalLight position={[-4, 2, -3]} intensity={0.8} color="#dfe4ff"/>
      <Suspense fallback={null}>{front ? <Sway active={active}><Model key={src} src={src} onReady={onReady}/></Sway> : <Model key={src} src={src} onReady={onReady}/>}</Suspense>
      <OrbitControls makeDefault enablePan={false} enableZoom={false} autoRotate={active && !front} autoRotateSpeed={speed} minPolarAngle={0.5} maxPolarAngle={1.75}/>
    </Canvas>
  </Boundary></div>;
}
