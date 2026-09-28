import { Component, Suspense, memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { CANVAS_DPR, IS_TOUCH } from '@/lib/perf';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';

const GLYPHS = '01#%@+/▲';

function glyphAtlas(): THREE.CanvasTexture {
  const size = 64; const c = document.createElement('canvas'); c.width = size * GLYPHS.length; c.height = size;
  const g = c.getContext('2d');
  if (g) { g.fillStyle = '#fff'; g.font = `800 ${size * 0.82}px "Geist Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; [...GLYPHS].forEach((ch, i) => g.fillText(ch, i * size + size / 2, size / 2 + 3)); }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
}

const VERT = /* glsl */ `
uniform float uTime; uniform float uSplit; uniform float uSize; uniform float uPulse;
attribute float aSeed; varying float vSeed; varying float vSide; varying float vEdge;
void main() {
  vec3 p = position;
  float edge = smoothstep(0.35, 0.0, uSplit - p.x);
  float dust = step(0.72, aSeed) * edge;
  float life = fract(uTime * (0.12 + aSeed * 0.18) + aSeed * 7.0);
  p += normalize(vec3(-0.6 - aSeed, 0.35 + sin(aSeed * 40.0) * 0.4, cos(aSeed * 90.0) * 0.4)) * dust * life * 0.55;
  p += normalize(position + 0.0001) * uPulse * (0.06 + aSeed * 0.08) * sin(aSeed * 30.0 + uTime * 20.0);
  vSeed = aSeed; vSide = uSplit - position.x; vEdge = dust * (1.0 - life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.7 + aSeed * 0.6) * (3.0 / -mv.z) * (dust > 0.0 ? (1.0 - life * 0.6) : 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uAtlas; uniform float uTime; uniform float uSplit; uniform vec3 uInk;
varying float vSeed; varying float vSide; varying float vEdge;
void main() {
  if (vSide < 0.0 && vEdge <= 0.0) discard;
  float idx = floor(mod(vSeed * 97.0 + floor(uTime * (0.5 + vSeed * 2.0)), 8.0));
  vec2 uv = vec2((gl_PointCoord.x + idx) / 8.0, 1.0 - gl_PointCoord.y);
  float a = texture2D(uAtlas, uv).a;
  if (a < 0.2) discard;
  vec3 ink = uInk;
  vec3 green = vec3(0.07, 0.63, 0.31);
  float seam = smoothstep(0.06, 0.0, abs(vSide));
  vec3 col = mix(ink, green, max(seam, step(0.93, vSeed) * 0.9));
  gl_FragColor = vec4(col, a * (0.55 + vSeed * 0.45));
}`;

type Built = { mesh: THREE.Group; points: THREE.BufferGeometry; plane: THREE.Plane };

function build(scene: THREE.Object3D, count: number): Built {
  const root = scene.clone(true);
  const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
  const s = 2.1 / Math.max(size.y, size.x, 0.0001);
  const holder = new THREE.Group(); holder.add(root); root.position.sub(center); holder.scale.setScalar(s); holder.updateMatrixWorld(true);
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const meshes: THREE.Mesh[] = [];
  holder.traverse(o => { if (o instanceof THREE.Mesh) { meshes.push(o); const list = Array.isArray(o.material) ? o.material : [o.material]; const next = list.map(m => { const c = m.clone(); c.clippingPlanes = [plane]; c.clipShadows = true; if (c instanceof THREE.MeshStandardMaterial) c.roughness = Math.max(c.roughness, 0.55); return c; }); o.material = Array.isArray(o.material) ? next : next[0]; } });
  const pos = new Float32Array(count * 3); const seed = new Float32Array(count); const v = new THREE.Vector3();
  const areas = meshes.map(m => { const g = m.geometry; return g.index ? g.index.count : g.attributes.position.count; }); const total = areas.reduce((a, b) => a + b, 0) || 1;
  let k = 0;
  meshes.forEach((m, i) => {
    const n = i === meshes.length - 1 ? count - k : Math.floor((areas[i] / total) * count);
    if (n <= 0) return;
    const sampler = new MeshSurfaceSampler(m).build();
    for (let j = 0; j < n && k < count; j++, k++) { sampler.sample(v); v.applyMatrix4(m.matrixWorld); pos.set([v.x, v.y, v.z], k * 3); seed[k] = Math.random(); }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return { mesh: holder, points: geo, plane };
}

function Figure({ src, paused, tint }: { src: string; paused: boolean; tint: [number, number, number] }) {
  const { scene } = useGLTF(src);
  const built = useMemo(() => build(scene, IS_TOUCH ? 4200 : 7800), [scene]);
  const atlas = useMemo(() => glyphAtlas(), []);
  const pulse = useRef<number>(0);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uSplit: { value: 0 }, uSize: { value: IS_TOUCH ? 40 : 46 }, uPulse: { value: 0 }, uAtlas: { value: atlas }, uInk: { value: new THREE.Vector3(...tint) } } }), [atlas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { built.points.dispose(); mat.dispose(); atlas.dispose(); }, [built, mat, atlas]);
  useFrame((_, dt) => {
    if (paused) return;
    const t = (mat.uniforms.uTime.value as number) + dt; mat.uniforms.uTime.value = t;
    const split = Math.sin(t * 0.45) * 0.22; mat.uniforms.uSplit.value = split; built.plane.constant = -split;
    pulse.current = Math.max(0, pulse.current - dt * 1.6); mat.uniforms.uPulse.value = pulse.current;
  });
  return <group onPointerDown={() => { pulse.current = 1; navigator.vibrate?.(6); }}>
    <primitive object={built.mesh}/>
    <points geometry={built.points} material={mat}/>
  </group>;
}

function Clipping() { const { gl } = useThree(); useEffect(() => { gl.localClippingEnabled = true; }, [gl]); return null; }

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * Draggable 3D person: one half the real textured scan, the other half a live ASCII point cloud that sheds glyph dust.
 * Renders only while on screen (frameloop "never" off screen), with a capped pixel ratio and a small point budget.
 */
export const HalfHuman = memo(function HalfHuman({ src, fallback, dark = false, camera = [0, 0.05, 4.1] }: { src: string; fallback: ReactNode; dark?: boolean; camera?: [number, number, number] }) {
  const { reducedMotion } = usePreferences();
  const wrap = useRef<HTMLDivElement>(null); const visible = useInView(wrap, '80px');
  const tint: [number, number, number] = dark ? [0.86, 0.9, 0.95] : [0.047, 0.051, 0.063];
  return <div ref={wrap} className="absolute inset-0">
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Canvas className="!touch-pan-y" frameloop={visible && !reducedMotion ? 'always' : 'demand'} dpr={IS_TOUCH ? [1, 1] : [1, Math.min(CANVAS_DPR[1], 1.25)]} camera={{ position: camera, fov: 34 }} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}>
          <Clipping/>
          <ambientLight intensity={1.1}/>
          <hemisphereLight args={['#ffffff', '#c8ccd6', 0.9]}/>
          <directionalLight position={[3, 4, 4]} intensity={2.4}/>
          <directionalLight position={[-4, 1, -2]} intensity={0.8} color="#dfe8ff"/>
          <Figure src={src} paused={!visible} tint={tint}/>
          <OrbitControls makeDefault enablePan={false} enableZoom={false} autoRotate={!reducedMotion} autoRotateSpeed={0.9} minPolarAngle={Math.PI * 0.3} maxPolarAngle={Math.PI * 0.62} rotateSpeed={0.7}/>
        </Canvas>
      </Suspense>
    </Boundary>
  </div>;
});
