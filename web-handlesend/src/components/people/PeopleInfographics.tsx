import { memo, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Eraser, Eye, Gauge, ScanFace, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { Donut } from '@/components/Charts';
import { useInView } from '@/hooks/use-in-view';
import { FRIENDLY, FALLBACK_ICON } from '@/components/people/features';
import { allocate, BPS, MAX_LAUNCHER_BPS, PLATFORM_BPS, splitFor, type PeopleFeature, type Relationship } from '@/shared/people';
import { cn } from '@/lib/utils';

const WEI = 10n ** 18n;
const eth = (wei: bigint, dp = 4): string => { const whole = wei / WEI; const frac = (wei % WEI).toString().padStart(18, '0').slice(0, dp); return `${whole.toLocaleString('en-US')}.${frac}`; };
const STOPS = [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000];

/**
 * Interactive fee maths. Uses the exact integer allocation the server signs: launcher and platform shares round down
 * in wei, the person receives the remainder, so the parts always sum to the pool.
 */
export const SplitCalculator = memo(function SplitCalculator() {
  const [rel, setRel] = useState<Relationship>('self'); const [lbps, setLbps] = useState<number>(2_000); const [stop, setStop] = useState<number>(4);
  const pool = STOPS[stop]; const poolWei = BigInt(Math.round(pool * 1e6)) * 10n ** 12n;
  const split = splitFor(rel, lbps); const a = useMemo(() => allocate(poolWei, split), [poolWei, split.launcherBps, split.subjectBps]); // eslint-disable-line react-hooks/exhaustive-deps
  const slices = [{ label: 'You', value: split.subjectBps, color: '#2EE584' }, { label: 'Collaborator', value: split.launcherBps, color: '#5B9BFF' }, { label: 'ObjectPad', value: split.platformBps, color: '#FFD84A' }].filter(s => s.value > 0);
  return <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-center">
    <div className="mx-auto"><Donut slices={slices} size={236} thickness={30} center={<><p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/45">You keep</p><p className="display text-[44px] leading-none text-white tnum">{split.subjectBps / 100}%</p><p className="mt-1 font-mono text-[11px] font-bold text-white/50">{split.subjectBps.toLocaleString()} bps</p></>}/></div>
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-1.5 rounded-full bg-white/[0.06] p-1">{(['self', 'assisted'] as const).map(r => <button key={r} type="button" onClick={() => setRel(r)} aria-pressed={rel === r} className={cn('press min-h-11 rounded-full text-[14px] font-extrabold transition-colors', rel === r ? 'bg-white text-ink' : 'text-white/60')}>{r === 'self' ? 'I launch myself' : 'A collaborator helps'}</button>)}</div>
      <label className="block"><span className="flex items-baseline justify-between font-mono text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55"><span>Creator fees collected, F</span><span className="display text-[22px] normal-case tracking-normal text-white tnum">{pool.toLocaleString('en-US')} ETH</span></span>
        <input type="range" min={0} max={STOPS.length - 1} step={1} value={stop} onChange={e => setStop(Number(e.target.value))} className="mt-2 w-full accent-[#2EE584]"/></label>
      {rel === 'assisted' && <label className="slide-in block"><span className="flex items-baseline justify-between font-mono text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55"><span>Collaborator share, L</span><span className="text-[14px] text-white tnum">{lbps.toLocaleString()} bps · {lbps / 100}%</span></span>
        <input type="range" min={0} max={MAX_LAUNCHER_BPS} step={100} value={lbps} onChange={e => setLbps(Number(e.target.value))} className="mt-2 w-full accent-[#5B9BFF]"/></label>}
      <ul className="grid gap-1.5">{[['You', a.subject, '#2EE584', split.subjectBps], ['Collaborator', a.launcher, '#5B9BFF', split.launcherBps], ['ObjectPad', a.platform, '#FFD84A', split.platformBps]].map(([l, v, c, b]) => <li key={l as string} className={cn('flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-2.5', (b as number) === 0 && 'opacity-40')}><span className="size-2.5 rounded-full" style={{ background: c as string }}/><span className="flex-1 text-[14px] font-extrabold text-white/80">{l as string}</span><span className="font-mono text-[14px] font-bold text-white tnum">{eth(v as bigint)} ETH</span></li>)}</ul>
    </div>
    <div className="lg:col-span-2 overflow-x-auto rounded-2xl bg-black/40 px-5 py-4 font-mono text-[12.5px] font-bold leading-7 text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
      <p><span className="text-[#5B9BFF]">collab</span> = ⌊F × {split.launcherBps} / {BPS.toLocaleString()}⌋ = {eth(a.launcher, 6)}</p>
      <p><span className="text-[#FFD84A]">objectpad</span> = ⌊F × {PLATFORM_BPS} / {BPS.toLocaleString()}⌋ = {eth(a.platform, 6)}</p>
      <p><span className="text-[#2EE584]">you</span> = F − collab − objectpad = {eth(a.subject, 6)} <span className="text-white/40">· rounding dust {a.dust.toString()} wei → you</span></p>
      <p className="text-white/40">constraints: S + L + P = 10,000 · P = 1,000 fixed · 0 ≤ L ≤ 2,000 · integers only · F = fees actually collected, not volume</p>
    </div>
  </div>;
});

type Lane = { key: 'live' | 'pilot' | 'planned'; title: string; sub: string };
const LANES: Lane[] = [
  { key: 'live', title: 'Today', sub: 'Open to everyone' },
  { key: 'pilot', title: 'Testing now', sub: 'Running with the first creators' },
  { key: 'planned', title: 'Next up', sub: 'In build order' },
];

/** Vertical build timeline from the server feature registry: a line fills to where the build is today. */
export const BuildTimeline = memo(function BuildTimeline({ features }: { features: PeopleFeature[] }) {
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, '0px', true);
  const n = features.length || 1; const live = features.filter(f => f.state === 'live').length; const pilot = features.filter(f => f.state === 'pilot').length;
  const done = (live + pilot * 0.5) / n;
  return <div ref={ref} className="grid gap-8 lg:grid-cols-[0.55fr_1fr]">
    <div className="lg:sticky lg:top-28 lg:self-start">
      <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/45">Build meter · straight from the server</p>
      <p className="display mt-2 text-[clamp(72px,11vw,132px)] leading-[0.8] tnum">{Math.round(done * 100)}<span className="text-[0.4em] text-ink/35">%</span></p>
      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-ink/[0.07]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0C0D10,#12A150)] transition-[width] duration-[1600ms] ease-out" style={{ width: seen ? `${done * 100}%` : '0%' }}/></div>
      <p className="mt-3 font-mono text-[11.5px] font-bold leading-5 text-ink/50">progress = (today + ½ × testing) / all = ({live} + ½ × {pilot}) / {n}</p>
    </div>
    <ol className="relative grid gap-9 pl-9">
      <span aria-hidden className="absolute bottom-2 left-[13px] top-2 w-[3px] rounded-full bg-ink/[0.08]"/>
      <span aria-hidden className="absolute left-[13px] top-2 w-[3px] rounded-full bg-[linear-gradient(#12A150,#0C0D10)] transition-[height] duration-[1800ms] ease-out" style={{ height: seen ? `${Math.min(96, (live / n) * 100 + (pilot / n) * 60)}%` : '0%' }}/>
      {LANES.map(lane => { const items = features.filter(f => f.state === lane.key); if (!items.length) return null; return <li key={lane.key} className="relative">
        <span aria-hidden className={cn('absolute -left-9 top-1 flex size-[29px] items-center justify-center rounded-full ring-4 ring-[#F2F3F5]', lane.key === 'live' ? 'bg-[#12A150]' : lane.key === 'pilot' ? 'bg-ink' : 'bg-white shadow-[inset_0_0_0_2px_rgba(12,13,16,.18)]')}>{lane.key !== 'planned' && <span className={cn('size-2.5 rounded-full bg-white', lane.key === 'live' && 'animate-pulse')}/>}</span>
        <p className="display text-[28px] leading-none">{lane.title}</p><p className="mt-1 text-[13.5px] font-bold text-ink/45">{lane.sub} · {items.length}</p>
        <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">{items.map((f, i) => { const meta = FRIENDLY[f.id]; const Icon = meta?.icon ?? FALLBACK_ICON; return <li key={f.id} className="people-in flex gap-3" style={{ ['--i' as string]: i }}>
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-[13px]', lane.key === 'planned' ? 'bg-ink/[0.05] text-ink/50' : 'bg-ink text-white')}><Icon size={18}/></span>
          <span className="min-w-0"><span className="block text-[15px] font-extrabold leading-tight tracking-[-0.01em]">{meta?.title ?? f.label}</span><span className="mt-0.5 block text-[13px] font-semibold leading-[18px] text-ink/50">{meta?.line ?? f.detail}</span></span>
        </li>; })}</ul>
      </li>; })}
    </ol>
  </div>;
});

const PIPE: { icon: typeof Camera; title: string; math: string }[] = [
  { icon: Camera, title: 'You shoot', math: 'live: light 48–222 · focus σ² > 26' },
  { icon: Eraser, title: 'Re-encoded', math: '≥ 720 px short side · ≤ 4 MP · EXIF/GPS dropped' },
  { icon: Gauge, title: 'Quality gate', math: 'server: blur ≥ 6 · exposure 16–246' },
  { icon: Eye, title: 'Safety screen', math: 'one person · clothed adult · not a screen' },
  { icon: Sparkles, title: '3D engine', math: '≤ 3 builds · 20 min timeout · GLB validated' },
  { icon: UserCheck, title: 'You approve', math: 'only you see it · approve or rebuild' },
  { icon: CheckCircle2, title: 'Photos deleted', math: 'on approval or delete · model digest kept' },
];
/** Animated capture-to-deletion pipeline with the real thresholds each stage enforces. */
export function PhotoPipeline() {
  return <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2">
    <ol className="relative flex min-w-[980px] gap-3">
      <svg aria-hidden className="pointer-events-none absolute inset-x-8 top-[34px] h-2 w-[calc(100%-4rem)]" preserveAspectRatio="none" viewBox="0 0 100 2"><line x1="0" y1="1" x2="100" y2="1" stroke="#0C0D10" strokeOpacity=".15" strokeWidth="2" vectorEffect="non-scaling-stroke"/><line x1="0" y1="1" x2="100" y2="1" stroke="#12A150" strokeWidth="2.5" strokeDasharray="6 10" vectorEffect="non-scaling-stroke" style={{ animation: 'wp-flow 1.4s linear infinite' }}/></svg>
      {PIPE.map((p, i) => <li key={p.title} className="relative flex-1">
        <span className={cn('relative mx-auto flex size-[68px] items-center justify-center rounded-[22px] shadow-[0_14px_28px_-16px_rgba(12,13,16,.6)]', i === PIPE.length - 1 ? 'bg-[#12A150] text-white' : 'bg-ink text-white')}><p.icon size={24}/><span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-white font-mono text-[10.5px] font-extrabold text-ink shadow">{i + 1}</span></span>
        <p className="mt-3 text-center text-[15px] font-extrabold">{p.title}</p>
        <p className="mt-1 text-center font-mono text-[10.5px] font-bold leading-4 text-ink/50">{p.math}</p>
      </li>)}
    </ol>
  </div>;
}

/** What is and isn't written publicly when a profile goes live. */
export function ChainLedger() {
  const on = ['Random subject reference (32 bytes)', 'SHA-256 digest of the approved 3D model', 'Fee split in basis points + recipient wallet', 'Proof labels: which check passed, and when'];
  const off = ['Your photos (deleted on approval)', 'Face embeddings or biometric hashes', 'Liveness video or its scores', 'Email, location, legal name'];
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-[26px] bg-white/[0.06] p-5"><p className="flex items-center gap-2 text-[15px] font-extrabold text-white"><ShieldCheck size={17} className="text-[#2EE584]"/>Public record</p><ul className="mt-3 grid gap-2">{on.map(t => <li key={t} className="flex gap-2.5 font-mono text-[12.5px] font-bold leading-5 text-white/70"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#2EE584]"/>{t}</li>)}</ul></div>
    <div className="rounded-[26px] bg-white/[0.06] p-5"><p className="flex items-center gap-2 text-[15px] font-extrabold text-white"><ScanFace size={17} className="text-[#FF8A8A]"/>Never on-chain</p><ul className="mt-3 grid gap-2">{off.map(t => <li key={t} className="flex gap-2.5 font-mono text-[12.5px] font-bold leading-5 text-white/55 line-through decoration-white/25"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#FF8A8A]"/>{t}</li>)}</ul></div>
  </div>;
}
