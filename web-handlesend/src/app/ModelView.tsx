import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF } from '@react-three/drei';
import type { WebGLRenderer } from 'three';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="flex size-full items-center justify-center text-[13px] font-bold opacity-60">3D isn’t available on this device.</div> : this.props.children; }
}
function Model({ src }: { src: string }) { const { scene } = useGLTF(src); return <primitive object={scene}/>; }
function Loaded({ onLoaded }: { onLoaded?: (gl: WebGLRenderer) => void }) { const gl = useThree(s => s.gl); const done = useRef<boolean>(false); useEffect(() => { if (done.current) return; done.current = true; const t = setTimeout(() => onLoaded?.(gl), 400); return () => clearTimeout(t); }, [gl, onLoaded]); return null; }

/** Interactive 3D model (drag to orbit, auto-rotate), like the iOS app's model viewer. Works with public and private (blob) URLs. */
export default function ModelView({ src, onLoaded }: { src: string; onLoaded?: (gl: WebGLRenderer) => void }) {
  return <Boundary><Canvas className="!size-full touch-none" dpr={[1, 2]} camera={{ position: [0, 0.3, 4.6], fov: 34 }} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}>
    <ambientLight intensity={1.6}/><hemisphereLight args={['#ffffff', '#c9cad6', 0.8]}/><directionalLight position={[4, 5, 3]} intensity={2.6}/><directionalLight position={[-4, 1, -3]} intensity={0.9} color="#dfe4ff"/>
    <Suspense fallback={null}><Bounds fit clip observe margin={1.25}><Model src={src}/></Bounds><Loaded onLoaded={onLoaded}/></Suspense>
    <OrbitControls makeDefault enablePan={false} autoRotate autoRotateSpeed={1.4} minDistance={1.5} maxDistance={9}/>
  </Canvas></Boundary>;
}
