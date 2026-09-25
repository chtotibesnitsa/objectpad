import { useEffect, useState, type RefObject } from 'react';

/** True while the element is on (or near) screen. Used to pause 3D scenes and tickers off screen. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '120px', once = false): boolean {
  const [inView, setInView] = useState<boolean>(false);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    if (!('IntersectionObserver' in window)) { setInView(true); return; }
    const observer = new IntersectionObserver(([entry]) => { setInView(entry.isIntersecting); if (entry.isIntersecting && once) observer.disconnect(); }, { rootMargin, threshold: 0.01 });
    observer.observe(element); return () => observer.disconnect();
  }, [ref, rootMargin, once]);
  return inView;
}
