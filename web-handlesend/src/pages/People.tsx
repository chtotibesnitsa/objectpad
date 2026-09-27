import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BadgeCheck, Camera, Fingerprint, HeartPulse, Instagram, Lock, Radio, ScanFace, ShieldCheck, Sparkles, Twitch, Wallet, X as XIcon, Youtube, Check, Minus, Eye, Target, Handshake, Users } from 'lucide-react';
import { HalfHuman } from '@/components/people/HalfHuman';
import { CaPill } from '@/components/CaPill';
import { cn } from '@/lib/utils';

/** 3D double shown in the hero. Swap for a consenting person's scan when they claim. */
const PEOPLE_MODEL = '/models/people/subject-real.glb';
const AVATAR = '/people/subject-avatar.jpg';
const BANNER = '/people/subject-banner.jpg';

/** Demo profile. Fictional person so no real identity is simulated without consent. */
const P = { name: 'Milo Reyes', handle: 'miloreyes', ticker: '$MILO', role: 'Onchain trader · streamer', city: 'Lisbon', bio: 'Trading memecoins live since 2021. 4 hours a day on stream, every trade public. Building in the open.' };

const SOCIALS: { icon: typeof XIcon; name: string; value: number; delta: string }[] = [
  { icon: XIcon, name: 'X', value: 412_300, delta: '+3.1k this week' },
  { icon: Twitch, name: 'Twitch', value: 186_900, delta: '9.4k avg live' },
  { icon: Youtube, name: 'YouTube', value: 94_200, delta: '+1.2k this week' },
  { icon: Instagram, name: 'Instagram', value: 58_700, delta: '+640 this week' },
];

type Post = { kind: 'official' | 'community' | 'mission' | 'stream'; who: string; text: string; ago: string; likes: number };
const FEED: Post[] = [
  { kind: 'stream', who: '@miloreyes', text: 'Live now: 4h trading session. Stream signed with rotating wallet code, so you know it’s really me.', ago: '2m', likes: 1840 },
  { kind: 'official', who: '@miloreyes', text: 'Claimed my page with my own X. Every fee from here goes to my verified wallet. Nobody else can touch it.', ago: '18m', likes: 5210 },
  { kind: 'mission', who: 'Holders', text: 'Mission funded: “Stream a full day from the Lisbon office.” Pays out when Milo posts proof.', ago: '41m', likes: 932 },
  { kind: 'community', who: '@degenfilms', text: 'Fan edit of Milo’s best calls this month. Tagged community, not official.', ago: '1h', likes: 611 },
  { kind: 'official', who: '@miloreyes', text: 'Proof-of-life check-in done. 14 days straight. Double updated with a new “wave” animation.', ago: '3h', likes: 2380 },
  { kind: 'community', who: 'Sponsor', text: 'A trading tool sponsored today’s stream. Paid straight to Milo’s verified wallet, no middleman.', ago: '5h', likes: 470 },
];

const LIFE: { when: string; title: string; body: string; icon: typeof XIcon }[] = [
  { when: 'Day 1', title: 'Scanned', body: 'Front, left, right and body photos became a 3D double.', icon: ScanFace },
  { when: 'Day 1', title: 'Proved alive', body: 'Did a random gesture on camera. A photo can’t pass it.', icon: HeartPulse },
  { when: 'Day 2', title: 'Linked socials', body: 'Signed from the wallet that gets paid, from the real X.', icon: Wallet },
  { when: 'Day 9', title: 'First mission', body: 'Holders funded a studio tour. Paid on proof.', icon: Target },
  { when: 'Day 14', title: 'First sponsor', body: 'Sponsorship routed straight to the verified wallet.', icon: Handshake },
];

const STEPS: { icon: typeof XIcon; title: string; body: string; stat: string }[] = [
  { icon: Camera, title: 'Scan', body: 'Your face and body become a 3D double.', stat: '4 angles' },
  { icon: HeartPulse, title: 'Prove you’re alive', body: 'A random live challenge. No photos, no deepfakes.', stat: '5 sec' },
  { icon: Fingerprint, title: 'One human, one passport', body: 'Only a salted fingerprint goes on-chain. Never your face.', stat: '0 clones' },
  { icon: Wallet, title: 'Fees find you', body: 'Only your official socials can claim. No dev can take it.', stat: '70% to you' },
];

const COMPARE: [string, boolean, boolean][] = [
  ['The real person gets paid', false, true],
  ['Official only when they claim', false, true],
  ['Proof they’re alive and human', false, true],
  ['No dev can take the fees', false, true],
  ['A 3D double you can stream, license and animate', false, true],
];

function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n);

function CountUp({ value, format = fmt }: { value: number; format?: (n: number) => string }) {
  const [v, setV] = useState<number>(0);
  useEffect(() => { let raf = 0; const start = performance.now(); const tick = (now: number) => { const k = Math.min(1, (now - start) / 1400); setV(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [value]);
  return <>{format(Math.round(v))}</>;
}

function SoonButton({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return <span aria-disabled className={cn('inline-flex min-h-12 cursor-not-allowed select-none items-center gap-2.5 rounded-full py-1 pl-1 pr-4 text-[14.5px] font-extrabold', primary ? 'bg-ink text-white shadow-[0_18px_34px_-16px_rgba(12,13,16,.6)]' : 'raised text-ink')}>
    <span className={cn('flex size-10 items-center justify-center rounded-full', primary ? 'bg-white/15' : 'bg-ink/[0.06]')}><Lock size={15}/></span>
    {children}
    <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider', primary ? 'bg-white/15 text-white/80' : 'bg-ink/[0.06] text-ink/55')}>Soon</span>
  </span>;
}

const Chart = memo(function Chart() {
  const base = useMemo(() => { const r = mulberry(4663); let v = 30; return Array.from({ length: 72 }, (_, i) => { v += (r() - 0.44) * 3 + (i === 30 ? 9 : 0) + (i === 52 ? 7 : 0); return Math.max(10, v); }); }, []);
  const [data, setData] = useState<number[]>(base);
  useEffect(() => { const r = mulberry(Date.now() & 0xffff); const id = setInterval(() => setData(d => [...d.slice(1), Math.max(10, d[d.length - 1] + (r() - 0.46) * 2.4)]), 1100); return () => clearInterval(id); }, []);
  const min = Math.min(...data), max = Math.max(...data); const W = 600, H = 200;
  const xy = (v: number, i: number): [number, number] => [(i / (data.length - 1)) * W, H - 14 - ((v - min) / (max - min || 1)) * (H - 40)];
  const pts = data.map((v, i) => xy(v, i).join(',')).join(' ');
  const change = ((data[data.length - 1] - data[0]) / data[0]) * 100; const up = change >= 0; const c = up ? '#12A150' : '#E5484D';
  const [lx, ly] = xy(data[data.length - 1], data.length - 1);
  const marks = [{ i: 30, label: 'Claimed page' }, { i: 52, label: 'First sponsor' }].map(m => ({ ...m, p: xy(data[Math.max(0, m.i - (72 - data.length))] ?? data[0], m.i) }));
  return <div className="raised relative overflow-hidden rounded-[28px] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="stat-label">{P.ticker} · human market</p><p className="display mt-1.5 text-[36px] leading-none tnum">${(data[data.length - 1] / 1000).toFixed(4)}</p></div>
      <div className="flex items-center gap-2"><span className={cn('rounded-full px-2.5 py-1 font-mono text-[12px] font-extrabold tnum', up ? 'bg-up/10 text-up' : 'bg-down/10 text-down')}>{up ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%</span><span className="rounded-full bg-ink/[0.06] px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Preview</span></div>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-[190px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="pp-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".22"/><stop offset="1" stopColor={c} stopOpacity="0"/></linearGradient></defs>
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#0C0D10" strokeOpacity=".06" strokeDasharray="3 5"/>)}
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#pp-fill)"/>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      {marks.map(m => <line key={m.label} x1={m.p[0]} x2={m.p[0]} y1={m.p[1]} y2={H} stroke="#0C0D10" strokeOpacity=".18" strokeDasharray="2 4" vectorEffect="non-scaling-stroke"/>)}
      <circle cx={lx} cy={ly} r="5" fill={c}><animate attributeName="r" values="4;8;4" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.4;1" dur="1.8s" repeatCount="indefinite"/></circle>
    </svg>
    <div className="mt-3 flex flex-wrap gap-2">{marks.map(m => <span key={m.label} className="chip !text-[10.5px]"><span className="size-1.5 rounded-full bg-ink"/>{m.label}</span>)}</div>
    <div className="mt-4 grid grid-cols-3 gap-2">{[['Holders', '8,214'], ['Fees to Milo', '$41.2K'], ['Missions paid', '12']].map(([a, b]) => <div key={a} className="sunk rounded-2xl px-3 py-2.5"><p className="text-[11px] font-bold uppercase text-ink/50">{a}</p><p className="text-[17px] font-extrabold tnum">{b}</p></div>)}</div>
  </div>;
});

const KIND: Record<Post['kind'], { label: string; cls: string; icon: typeof XIcon }> = {
  official: { label: 'Official', cls: 'bg-up/10 text-up', icon: BadgeCheck },
  community: { label: 'Community', cls: 'bg-blue/10 text-blue', icon: Users },
  mission: { label: 'Mission', cls: 'bg-ink text-white', icon: Target },
  stream: { label: 'Live', cls: 'bg-down/10 text-down', icon: Radio },
};

const Feed = memo(function Feed() {
  const [head, setHead] = useState<number>(0);
  useEffect(() => { const id = setInterval(() => setHead(h => (h + 1) % FEED.length), 3600); return () => clearInterval(id); }, []);
  const items = Array.from({ length: 4 }, (_, i) => FEED[(head + i) % FEED.length]);
  return <div className="raised rounded-[28px] p-5">
    <div className="flex items-center justify-between"><p className="stat-label">Life feed</p><span className="flex items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase text-up"><span className="pulse-dot size-2 rounded-full bg-up"/>Live</span></div>
    <ul className="mt-3 flex flex-col gap-2">{items.map((p, i) => { const K = KIND[p.kind]; return <li key={`${head}-${i}`} className={cn('people-in flex gap-3 rounded-2xl p-3', i === 0 ? 'bg-white shadow-[0_0_0_1px_rgba(12,13,16,.08),0_10px_24px_-14px_rgba(20,24,40,.35)]' : 'bg-ink/[0.03]')} style={{ ['--i' as string]: i }}>
      {p.who === '@miloreyes' ? <img src={AVATAR} alt="" className="size-9 shrink-0 rounded-full object-cover"/> : <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.07]"><K.icon size={15}/></span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]"><span className="font-extrabold">{p.who}</span>{p.who === '@miloreyes' && <BadgeCheck size={14} className="text-blue"/>}<span className="text-ink/40">· {p.ago}</span><span className={cn('ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase', K.cls)}><K.icon size={11}/>{K.label}</span></div>
        <p className="mt-1 text-[13.5px] font-semibold leading-snug text-ink/80">{p.text}</p>
        <p className="mt-1 text-[11.5px] font-bold text-ink/40">♥ {p.likes.toLocaleString()}</p>
      </div>
    </li>; })}</ul>
  </div>;
});

function Donut() {
  const parts = [{ v: 70, c: '#0C0D10', l: 'The real person' }, { v: 20, c: '#12A150', l: 'Whoever launched it' }, { v: 10, c: '#2F7BF2', l: 'ObjectPad treasury' }];
  let acc = 0; const R = 42, C = 2 * Math.PI * R;
  return <div className="raised flex items-center gap-5 rounded-[28px] p-5">
    <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={R} fill="none" stroke="#0C0D10" strokeOpacity=".06" strokeWidth="12"/>
      {parts.map(p => { const dash = (p.v / 100) * C; const el = <circle key={p.l} cx="50" cy="50" r={R} fill="none" stroke={p.c} strokeWidth="12" strokeDasharray={`${dash - 1.5} ${C}`} strokeDashoffset={-acc} className="people-arc"/>; acc += dash; return el; })}
    </svg>
    <div className="min-w-0"><p className="stat-label">Where every fee goes</p><ul className="mt-2 space-y-1.5">{parts.map(p => <li key={p.l} className="flex items-center gap-2 text-[14px] font-bold"><span className="size-2.5 rounded-full" style={{ background: p.c }}/><span className="display w-11 text-[20px] tnum">{p.v}%</span><span className="text-ink/65">{p.l}</span></li>)}</ul></div>
  </div>;
}

function Levels() {
  const L = [['Nominated', true], ['Self-launched', true], ['Liveness passed', true], ['Official socials', true], ['Org-verified', false]] as const;
  return <div className="raised rounded-[28px] p-5">
    <p className="stat-label">Identity level</p>
    <div className="mt-3 flex items-center gap-1.5">{L.map(([, on], i) => <span key={i} className={cn('people-bar h-2.5 flex-1 rounded-full', on ? 'bg-ink' : 'bg-ink/10')} style={{ ['--i' as string]: i }}/>)}</div>
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">{L.map(([l, on]) => <li key={l} className={cn('flex items-center gap-1.5 text-[13px] font-bold', on ? 'text-ink' : 'text-ink/40')}>{on ? <Check size={14} className="text-up" strokeWidth={3}/> : <Minus size={14}/>}{l}</li>)}</ul>
  </div>;
}

/** /people: locked preview of ObjectPad People, a verified market around a real human life. */
export default function People() {
  useEffect(() => { document.title = 'ObjectPad People · Every human, a market'; }, []);
  const poster = <div className="flex h-full items-center justify-center"><img src={AVATAR} alt="" className="size-48 rounded-full object-cover opacity-90 shadow-xl"/></div>;

  return <div className="page py-6 sm:py-10">
    {/* HERO */}
    <section className="relative grid items-center gap-6 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
      <div className="relative z-10 order-2 lg:order-1">
        <div className="flex flex-wrap items-center gap-2"><span className="chip"><span className="pulse-dot size-2 rounded-full bg-up"/>ObjectPad People</span><span className="chip !bg-ink/[0.05] !text-ink/60 !shadow-none">Preview · shipping now</span></div>
        <h1 className="display mt-5 text-[clamp(46px,7.4vw,104px)] leading-[0.88]"><span className="word-in inline-block">Every human,</span><br/><span className="word-in inline-block text-ink/40" style={{ animationDelay: '120ms' }}>a market.</span></h1>
        <p className="mt-5 max-w-[36rem] text-[clamp(17px,1.8vw,20px)] font-bold leading-snug text-ink/70">Scan yourself into a 3D double. Prove you’re real. <span className="text-ink">Every fee goes to the actual person</span>, never a dev.</p>
        <div className="mt-6 grid max-w-[36rem] grid-cols-3 gap-2">
          {[[ScanFace, '3D double', 'from your scan'], [ShieldCheck, 'Verified', 'liveness + socials'], [Wallet, '70%', 'of fees to you']].map(([I, a, b]) => { const Icon = I as typeof XIcon; return <div key={a as string} className="raised rounded-2xl p-3"><Icon size={18}/><p className="mt-2 text-[16px] font-extrabold leading-none">{a as string}</p><p className="mt-1 text-[11.5px] font-bold text-ink/50">{b as string}</p></div>; })}
        </div>
        <div className="mt-6 flex flex-wrap gap-2.5"><SoonButton primary>Launch a human</SoonButton><SoonButton>Claim my page</SoonButton></div>
      </div>

      <div className="relative order-1 lg:order-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-[36px] sm:aspect-[5/4.4]">
          <div aria-hidden className="scan-stage absolute inset-0"/>
          <div aria-hidden className="scan-grid absolute inset-0"/>
          <div aria-hidden className="people-halo absolute left-1/2 top-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full"/>
          <HalfHuman src={PEOPLE_MODEL} fallback={poster}/>
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 sm:left-5 sm:top-5"><span className="chip"><span className="size-2 rounded-sm bg-ink"/>Real</span><span className="chip"><span className="font-black">▲</span>Double</span></div>
          <div className="people-float pointer-events-none absolute right-3 top-3 sm:right-5 sm:top-5"><div className="raised flex items-center gap-2 rounded-full py-1 pl-1 pr-3"><img src={AVATAR} alt="" className="size-8 rounded-full object-cover"/><span className="text-[13px] font-extrabold">@{P.handle}</span><BadgeCheck size={15} className="text-blue"/></div></div>
          <div className="people-float pointer-events-none absolute bottom-14 left-3 sm:left-5" style={{ animationDelay: '-2s' }}><div className="raised flex items-center gap-2.5 rounded-2xl px-3 py-2"><span className="relative flex size-8 items-center justify-center"><svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="#0C0D10" strokeOpacity=".08" strokeWidth="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="#12A150" strokeWidth="4" strokeDasharray="94" strokeDashoffset="6" className="people-ring"/></svg><HeartPulse size={13} className="text-up"/></span><div><p className="text-[12.5px] font-extrabold leading-tight">Alive · 14 days</p><p className="text-[11px] font-bold text-ink/50">liveness 0.98</p></div></div></div>
          <div className="people-float pointer-events-none absolute bottom-14 right-3 sm:right-5" style={{ animationDelay: '-4s' }}><div className="raised rounded-2xl px-3 py-2"><p className="text-[11px] font-bold uppercase text-ink/50">Fees to Milo</p><p className="text-[16px] font-extrabold tnum text-up">+$<CountUp value={41200} format={n => n.toLocaleString()}/></p></div></div>
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center font-mono text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/45">Drag to spin · tap to pulse</p>
        </div>
      </div>
    </section>

    {/* PROFILE */}
    <section className="mt-14 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">Meet the first person</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)]">A life, live on-chain.</h2></div><span className="chip !bg-ink/[0.05] !text-ink/55 !shadow-none">Demo profile · not tradable</span></div>

      <div className="raised mt-6 overflow-hidden rounded-[32px]">
        <div className="relative h-36 sm:h-52"><img src={BANNER} alt="" className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent"/></div>
        <div className="relative -mt-14 px-5 pb-5 sm:-mt-16 sm:px-7">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative"><img src={AVATAR} alt={P.name} className="size-24 rounded-full border-4 border-white object-cover shadow-xl sm:size-28"/><span className="absolute bottom-1 right-1 flex size-7 items-center justify-center rounded-full border-2 border-white bg-blue text-white"><BadgeCheck size={15}/></span></div>
            <div className="min-w-0 flex-1 pb-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[26px] font-extrabold leading-none">{P.name}</h3><span className="rounded-full bg-up/10 px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase text-up">Official</span></div><p className="mt-1 text-[14px] font-bold text-ink/55">@{P.handle} · {P.role} · {P.city}</p></div>
            <div className="flex gap-2 pb-1"><SoonButton primary>Buy {P.ticker}</SoonButton></div>
          </div>
          <p className="mt-4 max-w-2xl text-[15px] font-semibold leading-relaxed text-ink/70">{P.bio}</p>
          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">{SOCIALS.map((s, i) => <div key={s.name} className="card-pop sunk flex items-center gap-3 rounded-2xl p-3" style={{ ['--delay' as string]: `${i * 70}ms` }}><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><s.icon size={17}/></span><div className="min-w-0"><p className="text-[19px] font-extrabold leading-none tnum"><CountUp value={s.value}/></p><p className="mt-1 truncate text-[11.5px] font-bold text-ink/50">{s.name} · {s.delta}</p></div><BadgeCheck size={15} className="ml-auto shrink-0 text-up"/></div>)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]"><Chart/><Feed/></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><Donut/><Levels/></div>

      <div className="raised mt-4 overflow-hidden rounded-[28px] p-5">
        <p className="stat-label">Life timeline</p>
        <ol className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1">{LIFE.map((e, i) => <li key={e.title} className="card-pop relative w-[210px] shrink-0" style={{ ['--delay' as string]: `${i * 90}ms` }}>
          <div className="flex items-center gap-2"><span className="flex size-10 items-center justify-center rounded-full bg-ink text-white"><e.icon size={16}/></span>{i < LIFE.length - 1 && <span className="people-line h-[2px] flex-1 rounded-full bg-ink/10"/>}</div>
          <p className="mt-3 font-mono text-[11px] font-extrabold uppercase text-ink/45">{e.when}</p><p className="text-[16px] font-extrabold">{e.title}</p><p className="mt-0.5 text-[13px] font-semibold leading-5 text-ink/55">{e.body}</p>
        </li>)}</ol>
      </div>
    </section>

    {/* HOW IT WORKS */}
    <section className="mt-14 sm:mt-20">
      <p className="lab">How it works</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)]">Real person in. Real person paid.</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{STEPS.map((s, i) => <div key={s.title} className="raised lift card-pop group relative overflow-hidden rounded-[26px] p-5" style={{ ['--delay' as string]: `${i * 80}ms` }}>
        <div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white transition-transform group-hover:rotate-[-8deg]"><s.icon size={20}/></span><span className="display text-[42px] leading-none text-ink/[0.08]">0{i + 1}</span></div>
        <p className="mt-5 text-[19px] font-extrabold">{s.title}</p><p className="mt-1 text-[14px] font-semibold leading-5 text-ink/60">{s.body}</p>
        <span className="mt-4 inline-flex rounded-full bg-ink/[0.06] px-3 py-1 font-mono text-[12px] font-extrabold">{s.stat}</span>
      </div>)}</div>
    </section>

    {/* WHY */}
    <section className="mt-14 grid gap-4 sm:mt-20 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <div><p className="lab">Why it’s different</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)]">No dev steals the story. Or the fees.</h2><p className="mt-4 max-w-xl text-[16px] font-semibold leading-relaxed text-ink/65">Most coins with a person’s name never pay them. Here anyone can launch a public figure, but it only turns official, and fees only move, when that person claims through their own socials.</p></div>
      <div className="raised overflow-hidden rounded-[28px]">
        <div className="grid grid-cols-[1fr_84px_84px] items-center gap-2 border-b border-ink/[0.07] px-5 py-3 text-center font-mono text-[11px] font-extrabold uppercase text-ink/50 sm:grid-cols-[1fr_110px_110px]"><span className="text-left">What you get</span><span>Other coins</span><span className="text-ink">People</span></div>
        {COMPARE.map(([t, a, b], i) => <div key={t} className="card-pop grid grid-cols-[1fr_84px_84px] items-center gap-2 px-5 py-3 text-[14px] font-bold odd:bg-ink/[0.02] sm:grid-cols-[1fr_110px_110px]" style={{ ['--delay' as string]: `${i * 60}ms` }}><span>{t}</span><span className="flex justify-center">{a ? <Check size={17}/> : <span className="flex size-6 items-center justify-center rounded-full bg-down/10 text-down"><XIcon size={13} strokeWidth={3}/></span>}</span><span className="flex justify-center">{b && <span className="flex size-6 items-center justify-center rounded-full bg-up text-white"><Check size={14} strokeWidth={3}/></span>}</span></div>)}
      </div>
    </section>

    {/* PRIVACY STRIP */}
    <section className="mt-4 grid gap-3 md:grid-cols-3">{[[Eye, 'Your face never goes on-chain', 'Only a salted fingerprint does. It can’t be turned back into you.'], [Sparkles, 'You approve your double', 'Nothing goes live until you’ve seen and okayed the scan.'], [ShieldCheck, 'Not ownership of a person', 'A human coin never owns you, your work, income or identity.']].map(([I, a, b]) => { const Icon = I as typeof XIcon; return <div key={a as string} className="sunk flex gap-3 rounded-[22px] p-4"><Icon size={19} className="mt-0.5 shrink-0"/><div><p className="text-[15px] font-extrabold">{a as string}</p><p className="mt-0.5 text-[13px] font-semibold leading-5 text-ink/55">{b as string}</p></div></div>; })}</section>

    {/* CLOSER */}
    <section className="smoke mt-14 overflow-hidden rounded-[36px] px-6 py-12 text-center sm:mt-20 sm:py-16">
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-60"/>
      <div className="relative"><p className="font-mono text-[12px] font-extrabold uppercase tracking-[0.16em] text-white/55">Sounds like Black Mirror</p>
        <h2 className="display mt-3 text-[clamp(34px,6vw,72px)] text-white">We promise it’s coming.</h2>
        <p className="mt-3 text-[16px] font-bold text-white/65">ObjectPad People starts today.</p>
        <div className="mx-auto mt-7 max-w-xl text-left text-ink"><CaPill/></div></div>
    </section>
  </div>;
}
