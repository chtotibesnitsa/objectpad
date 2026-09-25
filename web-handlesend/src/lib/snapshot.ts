import { AmbientLight, Box3, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Material, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> => new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))), type, quality));

/**
 * Renders a front-facing studio shot of a GLB (the same framing as the coin page viewer) on a pearl backdrop, for the coin icon.
 * Runs fully in the browser; the GPU context is released right after.
 */
export async function snapshotModel(model: Blob, size = 640): Promise<Blob> {
  const url = URL.createObjectURL(model);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const scene = new Scene(); const object = gltf.scene; scene.add(object);
    scene.add(new AmbientLight(0xffffff, 1.5)); scene.add(new HemisphereLight(0xffffff, 0xc9cad6, 0.8));
    const key = new DirectionalLight(0xffffff, 2.6); key.position.set(3, 5, 4); scene.add(key);
    const rim = new DirectionalLight(0xdfe4ff, 0.8); rim.position.set(-4, 2, -3); scene.add(rim);
    object.updateMatrixWorld(true); const box = new Box3().setFromObject(object); const center = box.getCenter(new Vector3()); const dims = box.getSize(new Vector3());
    const fov = 30; const radius = Math.max(dims.x, dims.y, dims.z * 0.6) / 2 || 1; const distance = (radius / Math.tan((fov / 2) * Math.PI / 180)) * 1.42;
    const camera = new PerspectiveCamera(fov, 1, distance / 100, distance * 10); camera.position.set(center.x, center.y + distance * 0.1, center.z + distance); camera.lookAt(center);
    renderer.setPixelRatio(1); renderer.setSize(size, size, false); renderer.setClearColor(0x000000, 0); renderer.render(scene, camera);
    const out = document.createElement('canvas'); out.width = size; out.height = size; const ctx = out.getContext('2d'); if (!ctx) throw new Error('Could not create the image.');
    const bg = ctx.createRadialGradient(size * 0.5, size * 0.38, size * 0.05, size * 0.5, size * 0.5, size * 0.72); bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(0.6, '#EEF0F3'); bg.addColorStop(1, '#D9DDE3');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(12,13,16,0.10)'; ctx.beginPath(); ctx.ellipse(size / 2, size * 0.84, size * 0.26, size * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(renderer.domElement, 0, 0, size, size);
    object.traverse(node => { if (node instanceof Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach((m: Material) => { Object.values(m).forEach(v => { if (v && typeof v === 'object' && 'isTexture' in v) (v as Texture).dispose(); }); m.dispose(); }); } });
    return await canvasBlob(out, 'image/png');
  } finally { renderer.dispose(); renderer.forceContextLoss(); URL.revokeObjectURL(url); }
}

/** Center-crops any photo to a square and re-encodes it (which drops EXIF and GPS) for a custom coin icon. */
export async function squareIcon(file: File, size = 640): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.decoding = 'async'; image.src = url; await image.decode().catch(() => { throw new Error('That image couldn’t be opened. Try a JPG or PNG.'); });
    const side = Math.min(image.naturalWidth, image.naturalHeight); if (side < 128) throw new Error('Use an image at least 128 × 128 pixels.');
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not create the image.');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await canvasBlob(canvas, 'image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}
