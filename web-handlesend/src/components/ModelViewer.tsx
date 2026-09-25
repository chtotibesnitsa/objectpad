import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CANVAS_DPR, IS_TOUCH } from '@/lib/perf';
import { Canvas } from '@react-three/fiber';
import { Bounds, ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import { Mesh, MeshStandardMaterial } from 'three';
import { Box, Expand, Grid3X3, Pause, RotateCw, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { usePreferences } from '@/hooks/use-preferences';

class WebGLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Artifact({ src, wireframe }: { src: string; wireframe: boolean }) {
  const { scene } = useGLTF(src);
  const clone = useMemo(() => { const copy = scene.clone(true); copy.traverse(item => { if (item instanceof Mesh) { const list = Array.isArray(item.material) ? item.material : [item.material]; const materials = list.map(source => { const m = source.clone(); if (m instanceof MeshStandardMaterial) { m.wireframe = wireframe; m.roughness = Math.max(m.roughness, 0.45); } return m; }); item.material = Array.isArray(item.material) ? materials : materials[0]; } }); return copy; }, [scene, wireframe]);
  useEffect(() => () => { clone.traverse(item => { if (item instanceof Mesh) (Array.isArray(item.material) ? item.material : [item.material]).forEach(m => m.dispose()); }); }, [clone]);
  return <primitive object={clone}/>;
}

/** Interactive viewer for a validated, content-addressed GLB. Starts as a poster unless `autoLoad` is set. */
export default function ModelViewer({ src, poster, height = 'h-[430px]', autoLoad = false, label = 'Scanned 3D model' }: { src: string; poster: string; height?: string; autoLoad?: boolean; label?: string }) {
  const { reducedMotion } = usePreferences(); const [active, setActive] = useState<boolean>(autoLoad); const [rotate, setRotate] = useState<boolean>(autoLoad && !reducedMotion); const [wireframe, setWireframe] = useState<boolean>(false); const [daylight, setDaylight] = useState<boolean>(true);
  const fallback = <div className="flex h-full items-center justify-center"><img src={poster} alt="Preview of the scanned object" className="h-full w-full object-contain"/><span className="absolute bottom-5 rounded-full bg-paper px-3 py-1 text-xs">Preview · 3D unavailable on this device</span></div>;
  return <div className={`glass relative overflow-hidden rounded-[28px] ${height}`}>
    <div className="scan-stage pointer-events-none absolute inset-[6px] rounded-[23px]" aria-hidden="true"/>
    <div className="scan-grid pointer-events-none absolute inset-0" aria-hidden="true"/>
    {!active ? <><img src={poster} alt="Preview of the scanned object" className="relative h-full w-full object-contain p-6"/><Button onClick={() => { setActive(true); setRotate(!reducedMotion); }} className="press absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap"><Box/>Spin in 3D</Button></>
      : <WebGLBoundary fallback={fallback}><Suspense fallback={<div role="status" className="flex h-full items-center justify-center text-sm text-muted">Loading the 3D model…</div>}>
        <Canvas className="touch-pan-y" dpr={CANVAS_DPR} camera={{ position: [0, 0.4, 5], fov: 36 }} gl={{ antialias: !IS_TOUCH, alpha: true }} frameloop={rotate && !reducedMotion ? 'always' : 'demand'}>
          <ambientLight intensity={daylight ? 1.6 : 0.6}/><hemisphereLight args={['#ffffff', '#c9cad6', daylight ? 0.8 : 0.3]}/><directionalLight position={[4, 5, 3]} intensity={daylight ? 2.8 : 1.2}/><directionalLight position={[-4, 1, -3]} intensity={0.9} color="#dfe4ff"/>
          <Bounds fit clip observe margin={1.3}><Artifact src={src} wireframe={wireframe}/></Bounds>
          <ContactShadows position={[0, -1.2, 0]} opacity={0.28} scale={8} blur={2.5} far={4} frames={1}/>
          <OrbitControls makeDefault enablePan={false} autoRotate={rotate && !reducedMotion} autoRotateSpeed={1.1} minDistance={1.5} maxDistance={9}/>
        </Canvas>
      </Suspense></WebGLBoundary>}
    {active && <div className="glass-strong absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full p-1">
      <Button variant="ghost" size="icon" onClick={() => setRotate(!rotate)} aria-label={rotate ? 'Pause rotation' : 'Auto rotate'} aria-pressed={rotate}>{rotate ? <Pause/> : <RotateCw/>}</Button>
      <Button variant="ghost" size="icon" onClick={() => setWireframe(!wireframe)} aria-label="Wireframe view" aria-pressed={wireframe}><Grid3X3/></Button>
      <Button variant="ghost" size="icon" onClick={() => setDaylight(!daylight)} aria-label="Change lighting" aria-pressed={daylight}><Sun/></Button>
      <Button variant="ghost" size="icon" onClick={event => { const root = event.currentTarget.closest('div.relative'); if (root && document.fullscreenEnabled) void root.requestFullscreen().catch(() => {}); }} aria-label="Fullscreen viewer"><Expand/></Button>
    </div>}
    <span className="glass-strong absolute left-4 top-4 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest">{label}</span>
  </div>;
}
