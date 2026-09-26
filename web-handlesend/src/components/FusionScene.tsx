import { Suspense, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, useGLTF, useTexture } from '@react-three/drei';
import { Box3, Vector3, type Group } from 'three';
import { CANVAS_DPR, IS_TOUCH } from '@/lib/perf';
import { FUSE_AT, GlassChart, PairCoin, Sparks, clamp01, fusionPose, useRoomEnv } from './fusion';

export interface FusionClock { startedAt: number; }
/** One full object + stock → coin loop on the V2 page. */
export const FUSION_MS = 7400;
export interface FusionPair { symbol: string; price: string; change: number | null; }

function Model({ src, innerRef, onReady }: { src: string; innerRef: MutableRefObject<Group | null>; onReady: () => void }) {
  const { scene } = useGLTF(src);
  const fit = useMemo(() => { const object = scene.clone(true); const box = new Box3().setFromObject(object); const size = box.getSize(new Vector3()); return { object, scale: 1.9 / Math.max(size.x, size.y, size.z, 0.0001), center: box.getCenter(new Vector3()) }; }, [scene]);
  useEffect(() => { onReady(); }, [onReady]);
  return <group ref={innerRef} visible={false}><group scale={fit.scale}><group position={[-fit.center.x, -fit.center.y, -fit.center.z]}><primitive object={fit.object}/></group></group></group>;
}

function Rig({ src, coin, pair, clock, onReady }: { src: string; coin: string; pair: FusionPair; clock: MutableRefObject<FusionClock>; onReady: () => void }) {
  const env = useRoomEnv(); const obj = useRef<Group | null>(null); const spin = useRef<Group>(null); const chart = useRef<Group | null>(null); const minted = useRef<Group | null>(null); const shadow = useRef<Group>(null);
  const vw = useThree(s => s.viewport.width); const spread = Math.min(1.28, vw * 0.26); const size = Math.min(1.1, vw / 4);
  const ageOf = useCallback(() => (performance.now() - clock.current.startedAt - FUSE_AT * FUSION_MS) / 1000, [clock]);
  useFrame((_, delta) => {
    const now = performance.now(); const p = fusionPose(clamp01((now - clock.current.startedAt) / FUSION_MS), spread, true);
    if (spin.current) spin.current.rotation.y += delta * 0.7;
    const o = obj.current; if (o) { o.visible = p.objVisible; o.position.set(p.objX, p.merge * 0.35, 0); o.scale.setScalar(p.objScale * (1 + (1.3 * size - 1) * p.split)); }
    if (shadow.current) shadow.current.visible = p.split < 0.2;
    const c = chart.current; if (c) { c.visible = p.chartVisible; c.position.set(p.chartX, 0.12 + p.merge * 0.23, 0.1); c.scale.setScalar(p.chartScale * size * 1.1); c.rotation.set(0.05, p.chartTilt + Math.sin(now / 900) * 0.05, 0); }
    const m = minted.current; if (m) { m.visible = p.coinScale > 0.01; m.position.set(0, 0.35 + Math.sin(now / 700) * 0.04, 0.2); m.scale.setScalar(p.coinScale * 1.2 * size); m.rotation.set(0, p.coinSpin, 0); }
  });
  return <group>
    <group ref={spin}><Model src={src} innerRef={obj} onReady={onReady}/></group>
    <GlassChart symbol={pair.symbol} price={pair.price} change={pair.change} env={env} innerRef={chart}/>
    <PairCoin art={coin} pair={pair} env={env} innerRef={minted}/>
    <Sparks ageOf={ageOf} y={0.35}/>
    <group ref={shadow}><ContactShadows position={[0, -1, 0]} opacity={0.28} scale={6} blur={2.6} far={3} frames={1}/></group>
  </group>;
}

function Preload({ src, coin }: { src: string; coin: string }) { useEffect(() => { useGLTF.preload(src); useTexture.preload(coin); }, [src, coin]); return null; }

/** WebGL stage for the V2 fusion: a real 3D object and a liquid-glass stock chart collide into one paired coin. */
export default function FusionScene({ src, coin, pair, next, nextCoin, clock, active, onReady }: { src: string; coin: string; pair: FusionPair; next: string; nextCoin: string; clock: MutableRefObject<FusionClock>; active: boolean; onReady: () => void }) {
  return <Canvas dpr={CANVAS_DPR} camera={{ position: [0, 0.3, 6], fov: 32 }} gl={{ antialias: !IS_TOUCH, alpha: true, powerPreference: 'default' }} frameloop={active ? 'always' : 'demand'}>
    <ambientLight intensity={1.2}/><hemisphereLight args={['#ffffff', '#d9d7cf', 0.9]}/><directionalLight position={[3.5, 5, 4]} intensity={2.2}/><directionalLight position={[-4, 1.5, -3]} intensity={0.9} color="#e6ecff"/>
    <Suspense fallback={null}><Rig key={src} src={src} coin={coin} pair={pair} clock={clock} onReady={onReady}/></Suspense>
    <Preload src={next} coin={nextCoin}/>
  </Canvas>;
}
