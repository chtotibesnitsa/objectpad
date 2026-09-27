import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fingerprint, Lock, Radio, ScanFace, ShieldCheck, Wallet } from 'lucide-react';
import { AsciiHuman, type Probe } from '@/components/people/AsciiHuman';
import { CaPill } from '@/components/CaPill';
import { cn } from '@/lib/utils';

/** Scanned stand-in figure for the work-in-progress demo. Empty string falls back to the procedural figure. */
const PEOPLE_MODEL = '/models/people/subject-0001.glb';
const SUBJECT = 'SUBJECT_0001';

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function landmark(p: Probe): string {
  const side = Math.abs(p.x) < 0.08 ? '' : p.x > 0 ? ' · L' : ' · R';
  const y = p.y;
  const name = y > 0.78 ? 'Vertex / crown' : y > 0.55 ? 'Frontal bone' : y > 0.4 ? 'Orbit · brow ridge' : y > 0.25 ? 'Nasion · zygoma' : y > 0.1 ? 'Philtrum · maxilla' : y > -0.08 ? 'Mandible · mentum' : y > -0.4 ? 'Cervical · neck' : 'Clavicle · deltoid';
  return `${name}${side}`;
}
/** Deterministic PRNG so the simulated chart looks the same for everyone. */
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const BOOT = [
  'mount /people ............................ ok',
  'liveness.challenge(nonce, t) ............. building',
  'capture.multiview(front,left,right,body) . building',
  'template → commit = SHA-256(salt ‖ E) ..... building',
  'uniqueness: cos(Eₐ,E_b) < θ  ∀ passports .. building',
  'wallet.link(sig = sign(nonce ‖ @handle)) .. building',
  'fees.route → verified identity only ....... building',
  'stream.proof(rotating nonce) .............. queued',
  'missions · sponsorships ................... queued',
  'trading ................................... LOCKED',
];

const NEWS: { tag: 'OFFICIAL' | 'COMMUNITY'; text: string }[] = [
  { tag: 'OFFICIAL', text: `${SUBJECT} completed a proof-of-life check-in. Streak: 14 days.` },
  { tag: 'COMMUNITY', text: `Holders funded a mission for ${SUBJECT}: record a 3D walk-through of their studio.` },
  { tag: 'OFFICIAL', text: `${SUBJECT} went live. Stream signed with rotating wallet nonce 0x9f3a…e21c.` },
  { tag: 'COMMUNITY', text: `A sponsor routed 0.4 ETH directly to ${SUBJECT}'s verified wallet. No middleman address.` },
  { tag: 'OFFICIAL', text: `${SUBJECT} approved a new 3D animation for their double: “wave”.` },
  { tag: 'COMMUNITY', text: `Fan-made clip linked to ${SUBJECT}'s timeline, labeled community, not official.` },
  { tag: 'OFFICIAL', text: `Creator fees claimed via ${SUBJECT}'s official X. Badge upgraded: SELF-LAUNCHED.` },
];

const MATH: { k: string; title: string; formula: string; body: string }[] = [
  { k: '01', title: 'Scan', formula: 'P = { pᵢ ∈ ℝ³ }ᵢ₌₁ᴺ   ←   f(I_front, I_left, I_right, I_body)', body: 'One photo builds a head. Several angles build the whole body. Every capture becomes a dense cloud of surface points, then your 3D double.' },
  { k: '02', title: 'Prove you’re alive', formula: 'c = H(nonce ‖ t)   →   gesture(c)   →   score ≥ τ', body: 'A random challenge you can’t pre-record: a gesture or phrase you do on camera, right now. A photo of someone else can’t answer it.' },
  { k: '03', title: 'Fingerprint, never publish', formula: 'C = SHA-256( salt ‖ E(face) )', body: 'Your face becomes a salted commitment. Only C touches the chain. The raw face and template never do, so C can’t be turned back into you.' },
  { k: '04', title: 'One human, one passport', formula: '∀ j :  Eₙₑw · Eⱼ / ‖Eₙₑw‖‖Eⱼ‖  <  θ', body: 'A new scan is compared against every existing passport. Too similar, and it’s rejected. Nobody gets launched twice, and nobody can clone you.' },
  { k: '05', title: 'Link wallet + socials', formula: 'ecrecover( sign_sk(nonce ‖ @handle) ) = wallet', body: 'You sign with the wallet that gets paid, from the account that’s really yours. No pasted addresses, no fake payout wallets.' },
  { k: '06', title: 'Fees find the real person', formula: 'fee → escrow(@handle)  ⟶  claim(official socials) → wallet', body: 'Anyone can tokenize a public figure. It only becomes official, and the fees only move, when that person claims through their own verified socials.' },
];

const Terminal = memo(function Terminal() {
  const [n, setN] = useState<number>(0);
  useEffect(() => { const id = setInterval(() => setN(v => (v >= BOOT.length + 6 ? 0 : v + 1)), 520); return () => clearInterval(id); }, []);
  return <div className="rounded-2xl border border-white/10 bg-black/60 p-4 font-mono text-[11.5px] leading-[1.7] text-[#ECEEF1]/80 backdrop-blur sm:text-[12px]">
    <div className="mb-2 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-[#ECEEF1]/45"><span className="size-1.5 animate-pulse rounded-full bg-[#12A150]"/>dev team · shipping live</div>
    {BOOT.slice(0, Math.min(n, BOOT.length)).map(line => { const s = line.split(' ').pop() ?? ''; return <div key={line} className="truncate"><span className="text-[#ECEEF1]/35">$ </span>{line.slice(0, line.length - s.length)}<span className={cn(s === 'ok' ? 'text-[#12A150]' : s === 'LOCKED' ? 'text-[#E5484D]' : s === 'queued' ? 'text-[#ECEEF1]/40' : 'text-[#2F7BF2]')}>{s}</span></div>; })}
    <span className="inline-block h-3.5 w-2 animate-pulse bg-[#ECEEF1]/80 align-middle"/>
  </div>;
});

const SimChart = memo(function SimChart() {
  const base = useMemo(() => { const r = mulberry(1337); let v = 40; return Array.from({ length: 90 }, (_, i) => { v += (r() - 0.46) * 4 + (i > 55 && i < 62 ? 3.4 : 0); return Math.max(8, v); }); }, []);
  const [data, setData] = useState<number[]>(base);
  useEffect(() => { const r = mulberry(Date.now() & 0xffff); const id = setInterval(() => setData(d => { const last = d[d.length - 1]; return [...d.slice(1), Math.max(8, last + (r() - 0.47) * 3.2)]; }), 900); return () => clearInterval(id); }, []);
  const min = Math.min(...data), max = Math.max(...data); const W = 600, H = 190;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 12 - ((v - min) / (max - min || 1)) * (H - 30)}`).join(' ');
  const change = ((data[data.length - 1] - data[0]) / data[0]) * 100; const up = change >= 0;
  return <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0"><p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[#ECEEF1]/45">${SUBJECT.replace('_', '')} · human market</p><p className="mt-1 font-mono text-[26px] font-bold tabular-nums text-[#ECEEF1] sm:text-[30px]">Ξ{(data[data.length - 1] / 1e6).toFixed(8)}</p></div>
      <span className={cn('rounded-full px-2.5 py-1 font-mono text-[12px] font-bold', up ? 'bg-[#12A150]/15 text-[#12A150]' : 'bg-[#E5484D]/15 text-[#E5484D]')}>{up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</span>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[170px] w-full" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="pfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={up ? '#12A150' : '#E5484D'} stopOpacity=".28"/><stop offset="1" stopColor={up ? '#12A150' : '#E5484D'} stopOpacity="0"/></linearGradient>
        <pattern id="pgrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#ECEEF1" strokeOpacity=".06"/></pattern></defs>
      <rect width={W} height={H} fill="url(#pgrid)"/>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#pfill)"/>
      <polyline points={pts} fill="none" stroke={up ? '#12A150' : '#E5484D'} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
    </svg>
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="-rotate-6 rounded-md border-2 border-[#E5484D]/70 px-3 py-1 font-mono text-[13px] font-black uppercase tracking-[0.3em] text-[#E5484D]/80">Simulated</span></div>
    <p className="mt-2 font-mono text-[10.5px] text-[#ECEEF1]/40">Simulated preview. Not a real market, not tradable, not live.</p>
  </div>;
});

const NewsFeed = memo(function NewsFeed() {
  const [head, setHead] = useState<number>(0);
  useEffect(() => { const id = setInterval(() => setHead(h => (h + 1) % NEWS.length), 3200); return () => clearInterval(id); }, []);
  const items = Array.from({ length: 4 }, (_, i) => ({ ...NEWS[(head + i) % NEWS.length], key: (head + i) % NEWS.length, ago: i * 7 + 1 }));
  return <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
    <div className="flex items-center justify-between"><p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[#ECEEF1]/45">Living timeline</p><span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase text-[#E5484D]"><Radio size={12}/>simulated</span></div>
    <ul className="mt-3 flex flex-col gap-2.5">{items.map((it, i) => <li key={it.key} className={cn('people-news rounded-2xl border border-white/[0.07] bg-black/30 p-3', i === 0 && 'border-white/20')}>
      <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider"><span className={cn('rounded px-1.5 py-0.5', it.tag === 'OFFICIAL' ? 'bg-[#12A150]/15 text-[#12A150]' : 'bg-[#2F7BF2]/15 text-[#2F7BF2]')}>{it.tag}</span><span className="text-[#ECEEF1]/35">{it.ago}m ago</span></div>
      <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-[#ECEEF1]/85">{it.text}</p>
    </li>)}</ul>
  </div>;
});

function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [out, setOut] = useState<string>(text);
  useEffect(() => { let f = 0; const chars = '▲△◢◣01#%@/\\'; const id = setInterval(() => { f++; setOut(text.split('').map((c, i) => (c === ' ' || i < f / 2 ? c : chars[(i * 7 + f) % chars.length])).join('')); if (f / 2 > text.length) clearInterval(id); }, 34); return () => clearInterval(id); }, [text]);
  return <span className={className}>{out}</span>;
}

/** /people: locked, work-in-progress teaser for ObjectPad People (verified human markets). */
export default function People() {
  const [probe, setProbe] = useState<(Probe & { hash: string; name: string }) | null>(null);
  const [taps, setTaps] = useState<number>(0);
  const salt = useRef<string>(crypto.getRandomValues(new Uint32Array(2)).join(''));
  const onProbe = useCallback((p: Probe) => {
    const name = landmark(p); setTaps(t => t + 1); navigator.vibrate?.(8);
    void sha256(`${salt.current}|${SUBJECT}|${p.index}|${p.x.toFixed(4)}|${p.y.toFixed(4)}|${p.z.toFixed(4)}`).then(hash => setProbe({ ...p, name, hash }));
  }, []);
  useEffect(() => { document.title = 'ObjectPad · People · coming soon'; }, []);

  return <div className="people-root relative isolate overflow-hidden bg-[#0C0D10] text-[#ECEEF1]">
    <div aria-hidden className="people-grid pointer-events-none absolute inset-0 -z-10"/>
    <div aria-hidden className="people-scan pointer-events-none absolute inset-x-0 top-0 -z-10 h-40"/>

    <section className="page relative grid min-h-[calc(100dvh-64px)] items-center gap-6 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-14">
      <div className="relative z-10 order-2 lg:order-1">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[#ECEEF1]/55"><span className="flex items-center gap-1.5 rounded-full border border-[#E5484D]/40 bg-[#E5484D]/10 px-2.5 py-1 text-[#E5484D]"><span className="size-1.5 animate-pulse rounded-full bg-[#E5484D]"/>Work in progress</span>ObjectPad People</p>
        <h1 className="display-wide mt-5 text-[clamp(64px,15vw,168px)] leading-[0.82] text-white"><ScrambleText text="PEOPLE"/></h1>
        <p className="mt-5 max-w-[34rem] text-[clamp(18px,2.4vw,23px)] font-semibold leading-snug text-[#ECEEF1]/85">First, we put objects on-chain. Now we’re building a living, evolving market around any human life.</p>
        <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[#ECEEF1]/60">Scan your face and body into a 3D double. Link your wallet and socials. Prove you’re alive. Stream, launch missions, take sponsorships, and route every fee back to your verified identity.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <button disabled className="flex min-h-12 cursor-not-allowed items-center gap-2 rounded-full bg-white/10 px-5 font-bold text-[#ECEEF1]/50 ring-1 ring-white/15"><Lock size={16}/>Tokenize a human</button>
          <button disabled className="flex min-h-12 cursor-not-allowed items-center gap-2 rounded-full px-5 font-bold text-[#ECEEF1]/40 ring-1 ring-white/10"><Lock size={16}/>Claim my page</button>
        </div>
        <p className="mt-3 font-mono text-[11.5px] text-[#ECEEF1]/40">Coming soon. The dev team is shipping right now. Nothing here is claimable or tradable yet.</p>
      </div>

      <div className="relative order-1 aspect-[4/5] max-h-[78dvh] w-full lg:order-2">
        <div aria-hidden className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgba(236,238,241,.10),transparent)]"/>
        <AsciiHuman src={PEOPLE_MODEL || undefined} onProbe={onProbe}/>
        <Reticle/>
        <div className="pointer-events-none absolute left-2 top-2 font-mono text-[10.5px] leading-5 text-[#ECEEF1]/55 sm:left-4 sm:top-4">
          <div>{SUBJECT} · <span className="text-[#E5484D]">UNVERIFIED</span></div>
          <div>mesh: {PEOPLE_MODEL ? 'scan' : 'procedural'} · probes: {taps}</div>
          <div>liveness: <span className="text-[#ECEEF1]/80">—</span> · passport: <span className="text-[#ECEEF1]/80">pending</span></div>
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4">
          {probe ? <div key={probe.hash} className="people-pop rounded-2xl border border-white/15 bg-black/70 p-3 font-mono text-[11px] leading-5 backdrop-blur">
            <div className="flex items-center justify-between gap-2"><span className="font-bold text-[#12A150]">▲ {probe.name}</span><span className="text-[#ECEEF1]/40">pt #{probe.index}</span></div>
            <div className="text-[#ECEEF1]/60">xyz ({probe.x.toFixed(3)}, {probe.y.toFixed(3)}, {probe.z.toFixed(3)})</div>
            <div className="truncate text-[#ECEEF1]/85">sha256 {probe.hash}</div>
          </div> : <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[#ECEEF1]/45">drag to rotate · tap anywhere on the body</p>}
        </div>
      </div>
    </section>

    <section className="page relative py-10 sm:py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#ECEEF1]/45">// preview of a human market</p>
      <h2 className="display mt-3 max-w-3xl text-[clamp(32px,5.5vw,60px)] text-white">A person, alive on-chain.</h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]"><SimChart/><NewsFeed/></div>
    </section>

    <section className="page relative py-10 sm:py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#ECEEF1]/45">// how it works · in progress</p>
      <h2 className="display mt-3 max-w-3xl text-[clamp(32px,5.5vw,60px)] text-white">Math that knows it’s really you.</h2>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{MATH.map(m => <article key={m.k} className="people-card group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between"><span className="font-mono text-[12px] font-bold text-[#ECEEF1]/40">{m.k}</span><span className="font-mono text-[10px] uppercase tracking-widest text-[#2F7BF2]">building</span></div>
        <h3 className="mt-3 text-[19px] font-extrabold text-white">{m.title}</h3>
        <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-xl border border-white/[0.07] bg-black/50 px-3 py-2.5 font-mono text-[12.5px] text-[#12A150]">{m.formula}</code>
        <p className="mt-3 text-[14px] leading-relaxed text-[#ECEEF1]/65">{m.body}</p>
      </article>)}</div>
    </section>

    <section className="page relative grid gap-8 py-10 sm:py-16 lg:grid-cols-2 lg:items-center">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#ECEEF1]/45">// why it’s different</p>
        <h2 className="display mt-3 text-[clamp(30px,5vw,54px)] text-white">No dev steals the story. Or the fees.</h2>
        <p className="mt-4 text-[15.5px] leading-relaxed text-[#ECEEF1]/70">Most coins that name a person never pay them. Some even paste a fake wallet. On ObjectPad, celebrities and viral figures can be tokenized, but they only become official when the fees are claimed through their own official socials.</p>
        <ul className="mt-5 grid gap-2.5 text-[14.5px] font-semibold text-[#ECEEF1]/85">
          {[[ScanFace, 'A 3D double from your own scan'], [Fingerprint, 'One human, one passport. No clones.'], [Wallet, 'Wallet and socials cryptographically linked'], [ShieldCheck, 'Official only when the real person claims']].map(([Icon, text]) => { const I = Icon as typeof ScanFace; return <li key={text as string} className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5"><I size={17}/></span>{text as string}</li>; })}
        </ul>
        <p className="mt-5 font-mono text-[11px] leading-5 text-[#ECEEF1]/40">A human coin never represents ownership of a person, their labor, income, or identity.</p>
      </div>
      <Terminal/>
    </section>

    <section className="page relative pb-20 pt-6 text-center">
      <p className="display-wide text-[clamp(26px,5vw,52px)] text-white">It sounds like Black Mirror.</p>
      <p className="mt-2 text-[16px] font-semibold text-[#ECEEF1]/65">We promise it’s coming. ObjectPad People starts today.</p>
      <div className="mx-auto mt-6 max-w-xl text-left text-[#0C0D10]"><CaPill/></div>
    </section>
  </div>;
}

function Reticle() {
  return <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 125" preserveAspectRatio="none">
    <g fill="none" stroke="#ECEEF1" strokeOpacity=".35" strokeWidth=".25" vectorEffect="non-scaling-stroke">
      <path d="M6 6h8M6 6v8M94 6h-8M94 6v8M6 119h8M6 119v-8M94 119h-8M94 119v-8"/>
      <circle cx="50" cy="40" r="19" strokeDasharray="1.2 1.6" className="people-spin" style={{ transformOrigin: '50px 40px' }}/>
      <polygon points="50,19 68,51 32,51" strokeOpacity=".18"/>
    </g>
  </svg>;
}
