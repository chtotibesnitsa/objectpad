import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Cuboid, Fingerprint, LoaderCircle, Lock, ScanLine, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { BuildLattice } from '@/components/BuildLattice';
import { BuildStage } from '@/components/BuildingCoin';
import { ErrorState } from '@/components/Feedback';
import { usePreferences } from '@/hooks/use-preferences';
import { copyText } from '@/lib/format';
import type { BuildingCoin, CoinPreview } from '@/shared/domain';
import { ObjectView } from './ObjectDetail';
import { ShareCardDialog } from '@/components/ShareCardDialog';
import { explorerTx } from '@/shared/pons';

const ModelViewer = lazy(() => import('@/components/ModelViewer'));
interface ShortLink { state: 'live' | 'reserved'; objectId?: string; building?: BuildingCoin | null; preview?: CoinPreview | null; }
const short = (h: string): string => `${h.slice(0, 12)}…${h.slice(-8)}`;

/** Public pre-launch page: only the 3D model, the AI object profile and the SHA-256 fingerprints. Never capture photos. */
function SealedPreview({ p, code }: { p: CoinPreview; code: string }) {
  const [copied, setCopied] = useState<string>(''); const [shareOpen, setShareOpen] = useState<boolean>(false); const url = `https://www.objectpad.fun/o/${code}`;
  const copy = (value: string, key: string) => void copyText(value).then(ok => { if (ok) { setCopied(key); setTimeout(() => setCopied(''), 1600); } });
  const tags = [...p.colors, ...p.materials].slice(0, 8);
  const facts: [string, string][] = [['Object', p.objectName ?? '—'], ['Tag', p.objectTag ?? '—'], ['Triangles', p.triangles?.toLocaleString() ?? '—'], ['Textures', p.textures !== null ? String(p.textures) : '—'], ['Size', p.bounds ? p.bounds.max.map((v, i) => Math.abs(v - (p.bounds?.min[i] ?? 0)).toFixed(2)).join(' × ') + ' u' : '—'], ['Angles captured', String(p.views)]];
  return <div className="page py-5 sm:py-8">
    <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <div className="relative">
        {p.modelUrl && p.posterUrl ? <Suspense fallback={<div className="glass h-[420px] rounded-[28px] sm:h-[600px]"/>}><ModelViewer src={p.modelUrl} poster={p.posterUrl} height="h-[420px] sm:h-[600px]" autoLoad label={`Real 3D scan · ${p.triangles?.toLocaleString() ?? ''} triangles`}/></Suspense> : <div className="glass h-[420px] rounded-[28px]"/>}
        <span className="chip-dark absolute right-4 top-4 !bg-white !text-ink"><Lock size={11}/>{p.stage === 'launching' ? 'Going live now' : 'Launching soon'}</span>
      </div>
      <div className="space-y-4">
        <div className="raised rounded-[30px] p-6">
          <div className="flex items-center gap-3.5">{p.iconUrl ? <img src={p.iconUrl} alt="" className="size-16 rounded-full bg-white object-cover shadow-[0_0_0_1px_rgba(12,13,16,.08)]"/> : <span className="flex size-16 items-center justify-center rounded-full bg-[#0F1115] font-mono text-[9px] font-extrabold text-white">LOADING</span>}<div className="min-w-0"><h1 className="display truncate text-[34px] leading-none sm:text-[42px]">{p.name}</h1>{p.symbol && <span className="chip-dark mt-2">${p.symbol}</span>}</div></div>
          {p.story && <p className="mt-4 text-[15px] font-semibold leading-7 text-ink/70">{p.story}</p>}
          <p className="mt-4 rounded-2xl bg-ink/[0.04] px-3.5 py-3 text-[13.5px] font-bold text-ink/70">{p.stage === 'launching' ? 'The launch transaction is on its way to Robinhood Chain. This page turns into the live chart and trade page by itself.' : 'Sealed by its creator. It goes live on Robinhood Chain as soon as the launch is sent, and this page turns into the chart and trade page by itself.'}</p>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => copy(url, 'link')} className="btn-ghost press min-h-11 px-4 text-sm">{copied === 'link' ? <Check size={15}/> : <Copy size={15}/>}{copied === 'link' ? 'Copied' : 'Copy coin link'}</button><button onClick={() => setShareOpen(true)} className="btn press min-h-11 px-4 text-sm">Share on X</button>{p.xUrl && <a href={p.xUrl} target="_blank" rel="noreferrer nofollow" className="btn-ghost press min-h-11 px-4 text-sm">X</a>}{p.telegram && <a href={p.telegram} target="_blank" rel="noreferrer nofollow" className="btn-ghost press min-h-11 px-4 text-sm">Telegram</a>}</div>
        </div>
        <div className="raised rounded-[28px] p-5">
          <p className="spec flex items-center gap-1.5 !text-[11px]"><Sparkles size={11}/>AI object profile</p>
          <p className="mt-1.5 text-[18px] font-extrabold">{p.category || p.objectName}</p>
          {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{tags.map(t => <span key={t} className="chip">{t}</span>)}</div>}
          <dl className="mt-3 grid grid-cols-2 gap-2">{facts.map(([k, v]) => <div key={k} className="sunk rounded-2xl px-3 py-2.5"><dt className="spec !text-[10.5px]">{k}</dt><dd className="mt-0.5 truncate font-mono text-[12.5px] font-bold">{v}</dd></div>)}</dl>
        </div>
      </div>
    </div>
    <section className="mt-4 overflow-hidden rounded-[28px] bg-[#0F1115] p-6 text-white sm:p-8">
      <p className="flex items-center gap-2 font-mono text-[12px] font-extrabold uppercase tracking-wider text-white/60"><Fingerprint size={14}/>SHA-256 on Robinhood Chain · can’t be vamped</p>
      <h2 className="display mt-3 text-[30px] leading-none sm:text-[40px]">One real object. One fingerprint. One coin.</h2>
      <p className="mt-3 max-w-2xl text-[14.5px] font-semibold leading-7 text-white/65">The 3D model and the capture are SHA-256 hashed and written into this coin’s launch transaction with its AI name and tag. Change a single byte and the fingerprint changes. The same model or capture can never launch a second coin on ObjectPad.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">{([['3D model sha256', p.modelHash], ['Capture sha256', p.manifestHash]] as [string, string | null][]).map(([k, v]) => <button key={k} disabled={!v} onClick={() => v && copy(v, k)} className="press flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-white/[0.07] px-4 text-left"><span><span className="block font-mono text-[10.5px] font-bold uppercase text-white/45">{k}</span><span className="font-mono text-[13px] font-bold">{v ? short(v) : 'computing…'}</span></span>{copied === k ? <Check size={15}/> : <Copy size={15} className="text-white/50"/>}</button>)}</div>
      <div className="mt-4 grid gap-2 text-[12.5px] font-bold text-white/70 sm:grid-cols-3">{[[ScanLine, 'Scanned in 3D from a real object'], [ShieldCheck, 'AI checked one of one'], [Cuboid, 'Name + tag + hashes on-chain']].map(([Icon, label]) => { const I = Icon as typeof ScanLine; return <span key={String(label)} className="flex items-center gap-2"><I size={14}/>{String(label)}</span>; })}</div>
    </section>
    <ShareCardDialog open={shareOpen} onOpenChange={setShareOpen} url={url} postText={`I just tokenized a real ${p.category || p.objectName || 'object'}: $${p.symbol} on @ObjectPad. Scanned in 3D, named on-chain, one of one.`} input={{ name: p.name, symbol: p.symbol, imageUrl: p.iconUrl, category: p.category }}/>
  </div>;
}

/**
 * Permanent coin link (/o/<code>), fixed before launch and written into the Pons launch as the coin's website.
 * Live coins render their full page here. A sealed coin still building shows the live 3D build (dots + real %),
 * and swaps to the full page with the draggable 3D model the moment it goes live.
 */
export default function CoinLink() {
  const { code = '' } = useParams(); const valid = /^[a-f0-9]{12}$/.test(code); const { play } = usePreferences();
  const query = useQuery({ queryKey: ['objectpad', 'short', code], enabled: valid, queryFn: () => api<ShortLink>(`/objects/short/${code}`), retry: false, refetchInterval: q => q.state.data?.state === 'reserved' ? (q.state.data.building || q.state.data.preview?.stage === 'launching' ? 2500 : 6000) : false });
  const wasBuilding = useRef<boolean>(false); const [landed, setLanded] = useState<boolean>(false); const [copied, setCopied] = useState<boolean>(false);
  const live = query.data?.state === 'live';
  useEffect(() => { if (query.data?.building || query.data?.preview) wasBuilding.current = true; if (live && wasBuilding.current) { wasBuilding.current = false; setLanded(true); play('launch'); } }, [query.data, live, play]);
  if (!valid) return <div className="page max-w-xl py-16"><ErrorState message="This coin link isn’t valid."/></div>;
  if (query.isPending) return <div className="flex min-h-[60vh] items-center justify-center text-muted"><LoaderCircle className="animate-spin"/></div>;
  if (live && query.data?.objectId) return <div className={landed ? 'card-pop' : undefined}>{landed && <div className="page pt-5"><p className="slide-in rounded-2xl bg-up/[0.1] px-4 py-3 text-[14px] font-extrabold text-up">Your 3D model just landed and the coin is live. Drag it around.</p></div>}<ObjectView id={query.data.objectId}/></div>;
  const building = query.data?.building; const preview = query.data?.preview;
  // The 3D model is done: the coin link shows it right away, with the object profile and SHA-256 fingerprints.
  if (query.data?.state === 'reserved' && preview?.modelUrl) return <SealedPreview p={preview} code={code}/>;
  if (query.data?.state === 'reserved' && building) {
    const url = `https://www.objectpad.fun/o/${code}`;
    return <div className="page py-6 sm:py-10"><div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <div className="raised overflow-hidden rounded-[30px] p-1.5"><BuildStage coin={building} big className="h-[380px] rounded-[25px] sm:h-[560px]"/></div>
      <div className="raised flex flex-col rounded-[30px] p-6 sm:p-7">
        <p className="lab">objectpad.fun/o/{code}</p>
        <h1 className="display mt-3 text-[40px] leading-[0.95] sm:text-[52px]">{building.name}</h1>
        <span className="chip-dark mt-3 self-start">${building.symbol}</span>
        <p className="mt-4 text-[16px] font-bold leading-7 text-ink/65">{building.state === 'launching' ? 'The 3D model is done. The launch is going out on Robinhood Chain right now.' : 'Launch is sealed. The 3D model is being built from the real photos, and the coin goes live on its own the second it’s done.'}</p>
        <ol className="mt-5 space-y-2">{[['Photos in', true], ['Launch sealed', true], ['3D model built', building.state === 'launching'], ['Live on Robinhood Chain', false]].map(([label, done], i) => <li key={String(label)} className={done ? 'raised flex min-h-11 items-center gap-2.5 rounded-2xl px-3.5 text-[14px] font-extrabold' : 'sunk flex min-h-11 items-center gap-2.5 rounded-2xl px-3.5 text-[14px] font-bold text-ink/55'}>{done ? <Check size={15} strokeWidth={3} className="text-up"/> : i === (building.state === 'launching' ? 3 : 2) ? <LoaderCircle size={15} className="animate-spin"/> : <Lock size={14}/>}{String(label)}</li>)}</ol>
        <button onClick={() => void copyText(url).then(ok => { setCopied(ok); setTimeout(() => setCopied(false), 1800); })} className="btn-ghost press mt-5 min-h-12 px-5 text-sm">{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? 'Copied' : 'Copy coin link'}</button>
        <p className="mt-auto pt-5 text-[12px] font-semibold text-ink/55">This page updates by itself. No need to refresh.</p>
      </div>
    </div></div>;
  }
  if (query.data?.state === 'reserved') return <div className="page py-10"><div className="glass mx-auto grid max-w-4xl items-center gap-6 overflow-hidden rounded-[30px] md:grid-cols-2"><div className="relative h-72 md:h-full md:min-h-[380px]"><BuildLattice progress={60} mode="search" className="absolute inset-0"/></div><div className="p-6 sm:p-8"><p className="spec">objectpad · /o/{code}</p><h1 className="display mt-3 text-4xl">This coin is on its way.</h1><p className="mt-3 text-[15px] leading-7 text-muted">A real object has been scanned and this link is reserved for its coin. The page goes live here the moment the launch confirms on Robinhood Chain.</p><Link to="/launch" className="press mt-6 inline-flex min-h-12 items-center gap-2 btn px-5 text-sm font-semibold "><ScanLine size={16}/>Tokenize your own object</Link></div></div></div>;
  return <div className="page max-w-xl py-16"><ErrorState message="No coin uses this link." retry={() => void query.refetch()}/></div>;
}
