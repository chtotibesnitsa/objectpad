import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

/** What the camera is looking at. Faces get a real facial mesh, bodies a skeleton, objects a tracked box. */
export type ScanKind = 'face' | 'body' | 'object';

/** Stride of `ArFrame.points`: x, y (normalized image space), z (depth, same scale as x) and visibility. */
export const PT = 4;

export interface ArFrame {
  kind: ScanKind;
  found: boolean;
  /** Human-readable status, e.g. "Face locked" or "Picking up: cup 87%". */
  label: string;
  /** Viewing angle of the subject in degrees. 0 = facing the camera, positive = turned to their left. Null when unknown. */
  yaw: number | null;
  /** Share (0..1) of the face mesh that has been seen so far. */
  coverage: number;
  vw: number; vh: number;
  /** Tracked region in normalized image space. */
  anchor: { cx: number; cy: number; rx: number; ry: number } | null;
  points: Float32Array | null;
  /** Face only: triangle vertex indices and how "seen" each triangle is (0..1). */
  tris: Uint16Array | null;
  painted: Float32Array | null;
}

export interface ArInfo { found: boolean; label: string; yaw: number | null; coverage: number; }
export type ArStatus = 'idle' | 'loading' | 'ready' | 'error';

interface Detector { detect: (video: HTMLVideoElement, now: number) => ArFrame; close: () => void; }

const BASE = '/mediapipe';
const EMPTY = (kind: ScanKind, label: string): ArFrame => ({ kind, found: false, label, yaw: null, coverage: 0, vw: 0, vh: 0, anchor: null, points: null, tris: null, painted: null });

/** Pose skeleton edges (MediaPipe indices) drawn over a person. */
export const BODY_EDGES: readonly (readonly [number, number])[] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
/** Triangles between body joints, filled green as the person turns. */
export const BODY_TRIS: readonly (readonly [number, number, number])[] = [[11, 12, 23], [12, 24, 23], [11, 13, 15], [12, 14, 16], [23, 25, 27], [24, 26, 28], [0, 11, 12], [23, 24, 25], [24, 26, 25]];

/** Viewing-angle windows in which each guided photo is auto-captured (degrees, 0 = front, + = their left). */
export const VIEW_RANGE: Record<string, (yaw: number) => boolean> = {
  front: y => Math.abs(y) <= 12,
  left: y => y >= 28 && y <= 58,
  right: y => y <= -28 && y >= -58,
  back: y => Math.abs(y) >= 150,
  body_front: y => Math.abs(y) <= 15,
  body_side: y => Math.abs(y) >= 65 && Math.abs(y) <= 115,
  body_back: y => Math.abs(y) >= 150,
};

/**
 * True when `yaw` is inside the window for `view`. With a rear camera the person walks around the subject, which mirrors
 * left and right compared with a selfie, so those two accept either side.
 */
export function viewMatches(view: string, yaw: number, swapSides: boolean): boolean {
  const y = swapSides && (view === 'left' || view === 'right') ? Math.abs(yaw) * (view === 'left' ? 1 : -1) : yaw;
  return VIEW_RANGE[view]?.(y) ?? false;
}

/** Best-effort rendering of a subject's yaw target for the angle dial. */
export const VIEW_TARGET_DEG: Record<string, number> = { front: 0, left: 45, right: -45, back: 180, body_front: 0, body_side: 90, body_back: 180 };

type Vision = typeof import('@mediapipe/tasks-vision');
type WasmFileset = Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>>;
let visionPromise: Promise<{ vision: Vision; fileset: WasmFileset }> | null = null;
const loadVision = (): Promise<{ vision: Vision; fileset: WasmFileset }> => (visionPromise ??= import('@mediapipe/tasks-vision').then(async vision => ({ vision, fileset: await vision.FilesetResolver.forVisionTasks(BASE) })).catch(e => { visionPromise = null; throw e; }));
const withDelegate = async <T,>(make: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> => { try { return await make('GPU'); } catch { return make('CPU'); } };
const deg = (r: number): number => (r * 180) / Math.PI;

/** Turns MediaPipe's tessellation edge list into a flat list of triangle vertex triples. */
function triangulate(edges: { start: number; end: number }[]): Uint16Array {
  const adj = new Map<number, Set<number>>();
  for (const { start, end } of edges) { if (!adj.has(start)) adj.set(start, new Set()); if (!adj.has(end)) adj.set(end, new Set()); adj.get(start)?.add(end); adj.get(end)?.add(start); }
  const out: number[] = [];
  for (const { start: a, end: b } of edges) {
    if (a >= b) continue;
    for (const c of adj.get(a) ?? []) if (c > b && adj.get(b)?.has(c)) out.push(a, b, c);
  }
  return Uint16Array.from(out);
}

async function faceDetector(): Promise<Detector> {
  const { vision, fileset } = await loadVision();
  const landmarker = await withDelegate(delegate => vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true }));
  const tris = triangulate(vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION);
  const painted = new Float32Array(tris.length / 3);
  let lastTime = -1; let last: ArFrame = EMPTY('face', 'Looking for a face…');
  return {
    detect(video, now) {
      if (video.currentTime === lastTime) return last; lastTime = video.currentTime;
      const vw = video.videoWidth; const vh = video.videoHeight; if (!vw || !vh) return last;
      const res = landmarker.detectForVideo(video, now); const lm = res.faceLandmarks[0];
      if (!lm) { last = { ...EMPTY('face', 'Looking for a face…'), vw, vh, painted, tris, coverage: last.coverage }; return last; }
      const n = Math.min(lm.length, 468); const pts = new Float32Array(n * PT);
      let minX = 1, minY = 1, maxX = 0, maxY = 0, cxs = 0, cys = 0, czs = 0;
      for (let i = 0; i < n; i++) { const p = lm[i]; pts[i * PT] = p.x; pts[i * PT + 1] = p.y; pts[i * PT + 2] = p.z; pts[i * PT + 3] = 1; cxs += p.x; cys += p.y; czs += p.z; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      cxs /= n; cys /= n; czs /= n;
      // Yaw magnitude from the fitted head pose; direction from where the nose sits between the cheeks.
      const m = res.facialTransformationMatrixes?.[0]?.data; let mag = 0;
      if (m && m.length >= 11) mag = deg(Math.atan2(Math.abs(m[2]), Math.abs(m[10])));
      const nose = lm[1]; const l = lm[234]; const r = lm[454]; const off = nose.x - (l.x + r.x) / 2; const sign = off >= 0 ? 1 : -1;
      if (!m) mag = deg(Math.asin(Math.min(1, Math.abs(off) / (Math.abs(r.x - l.x) / 2 || 1))));
      const yaw = mag * sign;
      // A triangle counts as seen once its outward normal points at the camera. Seen triangles stay green.
      let seen = 0;
      for (let t = 0; t < painted.length; t++) {
        const a = tris[t * 3]; const b = tris[t * 3 + 1]; const c = tris[t * 3 + 2]; if (a >= n || b >= n || c >= n) continue;
        const ax = pts[a * PT] * vw, ay = pts[a * PT + 1] * vh, az = pts[a * PT + 2] * vw;
        const ux = pts[b * PT] * vw - ax, uy = pts[b * PT + 1] * vh - ay, uz = pts[b * PT + 2] * vw - az;
        const vx = pts[c * PT] * vw - ax, vy = pts[c * PT + 1] * vh - ay, vz = pts[c * PT + 2] * vw - az;
        let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
        const mx = (pts[a * PT] + pts[b * PT] + pts[c * PT]) / 3 - cxs; const my = (pts[a * PT + 1] + pts[b * PT + 1] + pts[c * PT + 1]) / 3 - cys; const mz = (pts[a * PT + 2] + pts[b * PT + 2] + pts[c * PT + 2]) / 3 - czs;
        if (nx * mx * vw + ny * my * vh + nz * mz * vw < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const len = Math.hypot(nx, ny, nz) || 1;
        if (nz / len < -0.32) painted[t] = Math.min(1, painted[t] + 0.22);
        if (painted[t] > 0.5) seen++;
      }
      const coverage = Math.min(1, seen / (painted.length * 0.92));
      const w = maxX - minX; const h = maxY - minY;
      last = { kind: 'face', found: true, label: Math.abs(yaw) < 12 ? 'Face locked · front' : `Face locked · ${Math.round(Math.abs(yaw))}° ${yaw > 0 ? 'left' : 'right'}`, yaw, coverage, vw, vh, anchor: { cx: minX + w / 2, cy: minY + h / 2, rx: w / 2, ry: h / 2 }, points: pts, tris, painted };
      return last;
    },
    close() { landmarker.close(); },
  };
}

async function bodyDetector(): Promise<Detector> {
  const { vision, fileset } = await loadVision();
  const pose = await withDelegate(delegate => vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${BASE}/pose_landmarker_lite.task`, delegate }, runningMode: 'VIDEO', numPoses: 1 }));
  let lastTime = -1; let last: ArFrame = EMPTY('body', 'Step back so your whole body is in view');
  return {
    detect(video, now) {
      if (video.currentTime === lastTime) return last; lastTime = video.currentTime;
      const vw = video.videoWidth; const vh = video.videoHeight; if (!vw || !vh) return last;
      const res = pose.detectForVideo(video, now); const lm = res.landmarks[0]; const world = res.worldLandmarks[0];
      if (!lm) { last = { ...EMPTY('body', 'Step back so your whole body is in view'), vw, vh }; return last; }
      const pts = new Float32Array(lm.length * PT); let minX = 1, minY = 1, maxX = 0, maxY = 0;
      lm.forEach((p, i) => { pts[i * PT] = p.x; pts[i * PT + 1] = p.y; pts[i * PT + 2] = p.z; pts[i * PT + 3] = p.visibility ?? 0; if ((p.visibility ?? 0) > 0.4) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); } });
      const shoulders = (lm[11]?.visibility ?? 0) > 0.5 && (lm[12]?.visibility ?? 0) > 0.5;
      let yaw: number | null = null;
      if (shoulders && world?.[11] && world[12]) yaw = deg(Math.atan2(world[11].z - world[12].z, world[11].x - world[12].x));
      const pad = 0.04; const w = Math.max(0.05, maxX - minX) + pad; const h = Math.max(0.05, maxY - minY) + pad;
      last = { kind: 'body', found: true, label: shoulders ? (yaw !== null && Math.abs(yaw) < 15 ? 'Body locked · front' : `Body locked · ${Math.round(Math.abs(yaw ?? 0))}° turn`) : 'Show both shoulders', yaw, coverage: 0, vw, vh, anchor: { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rx: w / 2, ry: h / 2 }, points: pts, tris: null, painted: null };
      return last;
    },
    close() { pose.close(); },
  };
}

async function objectDetector(): Promise<Detector> {
  const { vision, fileset } = await loadVision();
  const det = await withDelegate(delegate => vision.ObjectDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${BASE}/efficientdet_lite0.tflite`, delegate }, runningMode: 'VIDEO', maxResults: 6, scoreThreshold: 0.3 }));
  let lastTime = -1; let last: ArFrame = EMPTY('object', 'Aim at the object');
  const centre = { cx: 0.5, cy: 0.5, rx: 0.26, ry: 0.3 };
  return {
    detect(video, now) {
      if (video.currentTime === lastTime) return last; lastTime = video.currentTime;
      const vw = video.videoWidth; const vh = video.videoHeight; if (!vw || !vh) return last;
      const res = det.detectForVideo(video, now);
      let best: { cx: number; cy: number; rx: number; ry: number; name: string; score: number; rank: number } | null = null;
      for (const d of res.detections) {
        const c = d.categories[0]; const b = d.boundingBox; if (!c || !b || c.categoryName === 'person') continue;
        const cx = (b.originX + b.width / 2) / vw; const cy = (b.originY + b.height / 2) / vh; const rank = c.score * (1 - Math.min(0.9, Math.hypot(cx - 0.5, cy - 0.5)));
        if (!best || rank > best.rank) best = { cx, cy, rx: b.width / vw / 2, ry: b.height / vh / 2, name: c.categoryName, score: c.score, rank };
      }
      last = best
        ? { kind: 'object', found: true, label: `Picking up: ${best.name} ${Math.round(best.score * 100)}%`, yaw: null, coverage: 0, vw, vh, anchor: { cx: best.cx, cy: best.cy, rx: best.rx, ry: best.ry }, points: null, tris: null, painted: null }
        : { ...EMPTY('object', 'Tracking the centre · walk slowly around it'), vw, vh, anchor: centre };
      return last;
    },
    close() { det.close(); },
  };
}

const MAKERS: Record<ScanKind, () => Promise<Detector>> = { face: faceDetector, body: bodyDetector, object: objectDetector };

/**
 * Runs an on-device detector over a live <video> and publishes the newest frame through a ref (for drawing at 60 fps)
 * plus a throttled `info` state (for buttons and auto-capture). Nothing leaves the device: models are served from /mediapipe.
 */
export function useArScan(kind: ScanKind | null, videoRef: RefObject<HTMLVideoElement | null>): { status: ArStatus; error: string | null; frame: MutableRefObject<ArFrame>; info: ArInfo } {
  const frame = useRef<ArFrame>(EMPTY(kind ?? 'face', ''));
  const [status, setStatus] = useState<ArStatus>('idle'); const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ArInfo>({ found: false, label: '', yaw: null, coverage: 0 });
  useEffect(() => {
    if (!kind) { setStatus('idle'); return; }
    let dead = false; let raf = 0; let detector: Detector | null = null; let lastRun = 0; let lastInfo = 0;
    frame.current = EMPTY(kind, 'Loading scanner…'); setStatus('loading'); setError(null);
    MAKERS[kind]().then(d => {
      if (dead) { d.close(); return; }
      detector = d; setStatus('ready');
      const loop = () => {
        raf = requestAnimationFrame(loop); const now = performance.now(); const video = videoRef.current;
        if (!video || video.readyState < 2 || now - lastRun < 40) return; lastRun = now;
        try { frame.current = d.detect(video, now); } catch { return; }
        if (now - lastInfo > 140) { lastInfo = now; const f = frame.current; setInfo({ found: f.found, label: f.label, yaw: f.yaw, coverage: f.coverage }); }
      };
      raf = requestAnimationFrame(loop);
    }).catch((e: unknown) => { if (!dead) { setStatus('error'); setError(e instanceof Error ? e.message : 'The scanner could not start on this device.'); } });
    return () => { dead = true; cancelAnimationFrame(raf); detector?.close(); detector = null; };
  }, [kind, videoRef]);
  return { status, error, frame, info };
}
