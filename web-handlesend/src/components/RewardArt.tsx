import { memo, useEffect, useMemo, useState } from 'react';
import { Check, Crown, Loader2 } from 'lucide-react';
import type { Reward } from '@/lib/rewards';
import { usePreferences } from '@/hooks/use-preferences';
import { cn } from '@/lib/utils';

const GLYPHS = '01#Ξ░▒▓█<>/\\*+=';

/** Text that decodes from random glyphs into the real string, left to right. */
export const Scramble = memo(function Scramble({ text, className, speed = 28 }: { text: string; className?: string; speed?: number }) {
  const { reducedMotion } = usePreferences(); const [shown, setShown] = useState<string>(reducedMotion ? text : '');
  useEffect(() => {
    if (reducedMotion) { setShown(text); return; }
    let frame = 0; const total = text.length + 8;
    const t = window.setInterval(() => {
      frame++; const solid = Math.max(0, frame - 8);
      setShown(text.split('').map((ch, i) => (i < solid || ch === ' ' || ch === '\n' ? ch : i < frame ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : '')).join(''));
      if (frame >= total) window.clearInterval(t);
    }, speed);
    return () => window.clearInterval(t);
  }, [text, speed, reducedMotion]);
  return <span className={cn('whitespace-pre-line', className)} aria-label={text}>{shown}</span>;
});

/** Floating voxel cubes with binary glyphs: the "object dissolving into data" motif from the Rewards posters. */
export const Voxels = memo(function Voxels({ count = 26, seed = 1, className }: { count?: number; seed?: number; className?: string }) {
  const cubes = useMemo(() => { let s = seed * 9301 + 49297; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: count }, (_, i) => ({ i, x: rnd() * 100, y: rnd() * 100, size: 7 + rnd() * 16, delay: rnd() * 4, glyph: rnd() < 0.45 ? ['0', '1', '#'][Math.floor(rnd() * 3)] : '' })); }, [count, seed]);
  return <div aria-hidden="true" className={cn('pointer-events-none absolute', className)}>
    {cubes.map(c => <span key={c.i} className="voxel absolute flex items-center justify-center rounded-[3px] font-mono font-black text-white" style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.size, height: c.size, fontSize: c.size * 0.62, animationDelay: `${c.delay}s` }}>{c.glyph}</span>)}
  </div>;
});

const hash = (s: string): number => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100_000; return h; };

/**
 * A bounty's cover. Uses the real image (ObjectPad artwork, AI cover or the poster's upload) and falls back to a live-drawn
 * poster in the same sky / pedestal / voxel style while the AI cover is still painting.
 */
export const SkyPoster = memo(function SkyPoster({ reward, className, big = false, reveal = true }: { reward: Reward; className?: string; big?: boolean; reveal?: boolean }) {
  const [broken, setBroken] = useState<boolean>(false);
  const painting = reward.coverState === 'generating';
  const hasImage = Boolean(reward.image) && !broken && !painting;
  const seed = hash(reward.id);
  return <div className={cn('sky-poster group/poster relative isolate overflow-hidden bg-[#2F7BF2]', className)}>
    {hasImage ? <img src={reward.image} alt={reward.title} loading="lazy" onError={() => setBroken(true)} className={cn('absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/poster:scale-[1.04]', !reveal && 'scale-110 blur-2xl')}/>
      : <>
        <div className="sky-clouds absolute inset-0"/>
        <span aria-hidden="true" className="absolute -left-10 -top-10 size-40 rounded-full bg-white/70 blur-2xl"/>
        <span aria-hidden="true" className="bubble absolute left-[58%] top-[12%] size-7 rounded-full"/>
        <span aria-hidden="true" className="bubble absolute left-[12%] bottom-[10%] size-10 rounded-full" style={{ animationDelay: '1.2s' }}/>
        <div className="absolute bottom-[10%] right-[6%] h-[16%] w-[40%] rounded-[50%] bg-gradient-to-b from-white/70 to-[#6FB2FF]/40 shadow-[0_0_40px_rgba(140,200,255,.9)]"/>
        <div className="absolute bottom-[20%] right-[12%] flex h-[46%] w-[28%] items-center justify-center">
          <span className={cn('display text-center text-white/95 drop-shadow-[0_6px_18px_rgba(10,40,120,.45)]', big ? 'text-[46px]' : 'text-[26px]')}>{reward.object.split(' ').slice(0, 2).join(' ')}</span>
        </div>
        <Voxels seed={seed} count={big ? 34 : 20} className="bottom-[14%] right-[2%] h-[62%] w-[34%]"/>
        <div className="absolute inset-y-0 left-0 flex w-[62%] flex-col justify-center pl-[5%]">
          <p className={cn('display uppercase leading-[0.9] text-white drop-shadow-[0_4px_14px_rgba(10,40,120,.35)]', big ? 'text-[clamp(30px,4.6vw,58px)]' : 'text-[clamp(20px,2.4vw,28px)]')}>First {reward.object} scan: ${reward.rewardUsd.toLocaleString('en-US')}</p>
          <p className={cn('mt-2 font-extrabold uppercase text-white/95', big ? 'text-[17px]' : 'text-[10.5px]')}>Rewards only go up.</p>
          <p className={cn('display mt-1 text-white', big ? 'text-[34px]' : 'text-[17px]')}>objectpad.fun</p>
        </div>
        {painting && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider text-white backdrop-blur-md"><Loader2 size={11} className="animate-spin"/>AI painting cover</span>}
      </>}
    {!reveal && <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-full border border-white/30 bg-white/15 px-4 py-2 font-mono text-[12px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-md">18+ · tap to view</span></div>}
    <span aria-hidden="true" className="scan-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 opacity-0 group-hover/poster:opacity-100"/>
  </div>;
});

/** Open / won / paid / draft pill for a bounty. */
export function RewardStatusPill({ reward, className }: { reward: Reward; className?: string }) {
  const s = reward.status;
  const label = s === 'open' ? 'Open' : s === 'paid' ? 'Paid' : s === 'won' ? 'Winner picked' : s === 'paying' ? 'Paying out' : s === 'draft' ? 'Draft · fund to go live' : s === 'refunding' ? 'Refunding' : 'Closed';
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] backdrop-blur-md', s === 'open' ? 'bg-white/90 text-ink' : s === 'paid' || s === 'won' ? 'bg-up text-white' : s === 'draft' ? 'bg-ink text-white' : 'bg-white/80 text-ink/70', className)}>
    {s === 'open' ? <span className="pulse-dot size-1.5 rounded-full bg-up"/> : s === 'paid' ? <Check size={12} strokeWidth={3}/> : s === 'won' ? <Crown size={12}/> : s === 'paying' || s === 'refunding' ? <Loader2 size={12} className="animate-spin"/> : null}{label}
  </span>;
}

/** Circular avatar with a monogram fallback. */
export function Avatar({ src, name, size = 28, className }: { src?: string; name: string; size?: number; className?: string }) {
  const [bad, setBad] = useState<boolean>(false);
  return src && !bad ? <img src={src} alt="" onError={() => setBad(true)} className={cn('shrink-0 rounded-full bg-ink/10 object-cover', className)} style={{ width: size, height: size }}/>
    : <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-ink font-mono font-black uppercase text-white', className)} style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?').replace('@', '').slice(0, 1)}</span>;
}
