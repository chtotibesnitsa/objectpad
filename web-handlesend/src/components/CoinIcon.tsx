import { memo, useMemo, useState, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

const PALETTE = ['#E6E8EC', '#D5D9E0', '#F1F2F4', '#C9CED8', '#FFE2D6', '#DDE3EC'];

/** 5×5 mirrored pixel identicon, used when a coin has no resolvable on-chain logo. */
export const PixelIdenticon = memo(function PixelIdenticon({ seed, size = 36, className }: { seed: string; size?: number; className?: string }) {
  const { bits, color } = useMemo(() => {
    let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const out: boolean[] = []; for (let i = 0; i < 15; i++) out.push(((h >>> i) & 1) === 1);
    return { bits: out, color: PALETTE[h % PALETTE.length] };
  }, [seed]);
  const rects: ReactElement[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const source = x < 3 ? x : 4 - x; if (bits[y * 3 + source]) rects.push(<rect key={`${x}-${y}`} x={x + 1.5} y={y + 1.5} width={1} height={1} fill="#1B1D22"/>); }
  return <svg viewBox="0 0 8 8" width={size} height={size} className={cn('shrink-0 rounded-full shadow-[0_0_0_1px_rgba(12,13,16,.12)]', className)} style={{ background: color, imageRendering: 'pixelated' }} shapeRendering="crispEdges" aria-hidden="true">{rects}</svg>;
});

/** A coin's own logo (proxied from its on-chain Pons metadata), falling back to a pixel identicon. */
export const CoinIcon = memo(function CoinIcon({ src, seed, size = 36, className }: { src?: string; seed: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState<boolean>(false);
  if (src && !failed) return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('shrink-0 rounded-full bg-white object-cover shadow-[0_0_0_1px_rgba(12,13,16,.12)]', className)} style={{ width: size, height: size }}/>;
  return <PixelIdenticon seed={seed} size={size} className={className}/>;
});
