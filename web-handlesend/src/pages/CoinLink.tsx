import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, LoaderCircle, Lock, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { BuildLattice } from '@/components/BuildLattice';
import { BuildStage } from '@/components/BuildingCoin';
import { ErrorState } from '@/components/Feedback';
import { usePreferences } from '@/hooks/use-preferences';
import { copyText } from '@/lib/format';
import type { BuildingCoin } from '@/shared/domain';
import { ObjectView } from './ObjectDetail';

interface ShortLink { state: 'live' | 'reserved'; objectId?: string; building?: BuildingCoin | null; }

/**
 * Permanent coin link (/o/<code>), fixed before launch and written into the Pons launch as the coin's website.
 * Live coins render their full page here. A sealed coin still building shows the live 3D build (dots + real %),
 * and swaps to the full page with the draggable 3D model the moment it goes live.
 */
export default function CoinLink() {
  const { code = '' } = useParams(); const valid = /^[a-f0-9]{12}$/.test(code); const { play } = usePreferences();
  const query = useQuery({ queryKey: ['objectpad', 'short', code], enabled: valid, queryFn: () => api<ShortLink>(`/objects/short/${code}`), retry: false, refetchInterval: q => q.state.data?.state === 'reserved' ? (q.state.data.building ? 2500 : 8000) : false });
  const wasBuilding = useRef<boolean>(false); const [landed, setLanded] = useState<boolean>(false); const [copied, setCopied] = useState<boolean>(false);
  const live = query.data?.state === 'live';
  useEffect(() => { if (query.data?.building) wasBuilding.current = true; if (live && wasBuilding.current) { wasBuilding.current = false; setLanded(true); play('launch'); } }, [query.data, live, play]);
  if (!valid) return <div className="page max-w-xl py-16"><ErrorState message="This coin link isn’t valid."/></div>;
  if (query.isPending) return <div className="flex min-h-[60vh] items-center justify-center text-muted"><LoaderCircle className="animate-spin"/></div>;
  if (live && query.data?.objectId) return <div className={landed ? 'card-pop' : undefined}>{landed && <div className="page pt-5"><p className="slide-in rounded-2xl bg-up/[0.1] px-4 py-3 text-[14px] font-extrabold text-up">Your 3D model just landed and the coin is live. Drag it around.</p></div>}<ObjectView id={query.data.objectId}/></div>;
  const building = query.data?.building;
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
