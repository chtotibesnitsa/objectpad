import { memo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const FRAMES = 48; const COLS = 24; const ROWS = 2;
interface Spinner { a: HTMLDivElement; b: HTMLDivElement; duration: number; offset: number; paused: boolean; }
const spinners = new Set<Spinner>();
let raf = 0;
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pos = (k: number): string => { const f = ((k % FRAMES) + FRAMES) % FRAMES; return `${((f % COLS) / (COLS - 1)) * 100}% ${(Math.floor(f / COLS) / (ROWS - 1)) * 100}%`; };

/** One shared display-rate loop for every sprite on the page: frame i under frame i+1, the top fading in. */
function tick(now: number) {
  if (!document.hidden) for (const s of spinners) {
    if (s.paused) continue;
    const t = ((((now / 1000 + s.offset) / s.duration) % 1) + 1) % 1 * FRAMES; const i = Math.floor(t);
    s.a.style.backgroundPosition = pos(i); s.b.style.backgroundPosition = pos(i + 1); s.b.style.opacity = (t - i).toFixed(3);
  }
  raf = spinners.size ? requestAnimationFrame(tick) : 0;
}

/**
 * A real 360° turntable of a 3D model: 48 frames rendered from the model at a fixed camera distance (so it never zooms),
 * blended frame-to-frame at display refresh rate. No WebGL, so dozens can spin on one page.
 */
export const SpinSprite = memo(function SpinSprite({ src, className, duration = 5, paused = false, delay = 0 }: { src: string; className?: string; duration?: number; paused?: boolean; delay?: number }) {
  const a = useRef<HTMLDivElement>(null); const b = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!a.current || !b.current || reduced) return;
    const s: Spinner = { a: a.current, b: b.current, duration, offset: delay, paused }; spinners.add(s);
    if (!raf) raf = requestAnimationFrame(tick);
    return () => { spinners.delete(s); };
  }, [duration, delay, paused]);
  const layer = { backgroundImage: `url(${src})`, backgroundSize: `${COLS * 100}% ${ROWS * 100}%`, backgroundRepeat: 'no-repeat', backgroundPosition: '0% 0%', willChange: 'background-position, opacity' } as const;
  return <div role="img" aria-hidden="true" className={cn('relative aspect-square', className)}>
    <div ref={a} className="absolute inset-0" style={layer}/><div ref={b} className="absolute inset-0" style={{ ...layer, opacity: 0 }}/>
  </div>;
});
