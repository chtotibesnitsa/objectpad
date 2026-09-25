import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Fades, lifts and un-blurs its children the first time they scroll into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null); const [shown, setShown] = useState<boolean>(false);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    if (!('IntersectionObserver' in window)) { setShown(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); observer.disconnect(); } }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={cn('reveal', shown && 'in', className)} style={{ '--delay': `${delay}ms` } as CSSProperties}>{children}</div>;
}

/** Animates a number towards its latest value. */
export function CountUp({ value, format, duration = 900 }: { value: number; format: (value: number) => string; duration?: number }) {
  const [shown, setShown] = useState<number>(0); const from = useRef<number>(0);
  useEffect(() => {
    if (!Number.isFinite(value)) return; const start = performance.now(); const origin = from.current; let frame = 0;
    const step = (now: number) => { const k = Math.min(1, (now - start) / duration); const eased = 1 - (1 - k) ** 3; const next = origin + (value - origin) * eased; setShown(next); if (k < 1) frame = requestAnimationFrame(step); else from.current = value; };
    frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <span className="tnum">{format(shown)}</span>;
}
