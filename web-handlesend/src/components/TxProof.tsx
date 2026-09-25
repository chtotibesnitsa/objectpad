import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decodeFunctionData, stringToHex, type Hex } from 'viem';
import { ArrowUpRight, Check, ChevronDown, LoaderCircle } from 'lucide-react';
import { chain } from '@/lib/chain';
import { objectSuffixText, parseObjectSpecs, readObjectSuffix } from '@/shared/domain';
import { explorerTx, ROUTER_ABI } from '@/shared/pons';
import { shortHash } from '@/shared/security';
import { GlassIcon } from './GlassIcon';
import { cn } from '@/lib/utils';

/** Everything the receipt shows about one launch transaction. */
export interface TxView { hash: string; block: string; from: string; input: string; fn: string; coinName: string; symbol: string; record: { text: string; tag: string; objectName: string; objectId: string; specs?: string } | null; description: string; sample: boolean; }

/** Reads a launch transaction straight from Robinhood Chain and decodes the launch call plus the ObjectPad object record. */
export function useLaunchTx(hash: string | undefined | null) {
  return useQuery({ queryKey: ['objectpad', 'launch-tx', hash], enabled: Boolean(hash && /^0x[a-fA-F0-9]{64}$/.test(hash)), staleTime: Infinity, retry: 2, queryFn: async (): Promise<TxView> => {
    const tx = await chain.getTransaction({ hash: hash as Hex });
    let fn = 'unknown'; let coinName = ''; let symbol = ''; let description = '';
    try { const decoded = decodeFunctionData({ abi: ROUTER_ABI, data: tx.input }); fn = decoded.functionName; const params = decoded.args[0]; coinName = params.name; symbol = params.symbol; description = params.description; } catch { /* not a launch call */ }
    return { hash: tx.hash, block: tx.blockNumber?.toString() ?? 'pending', from: tx.from, input: tx.input, fn, coinName, symbol, record: readObjectSuffix(tx.input), description, sample: false };
  } });
}

/** Specimen receipt for lab objects, encoded exactly the way real launches are. Never linked to an explorer. */
export function sampleTx(input: { tag: string; objectName: string; objectId: string; coinName: string; symbol: string; specs?: string }): TxView {
  const text = objectSuffixText(input.tag, input.objectName, input.objectId, input.specs);
  const body = `0x5e4f6d21${'0'.repeat(56)}${Array.from({ length: 6 }, (_, i) => (i * 2654435761 >>> 0).toString(16).padStart(8, '0')).join('')}`;
  return { hash: `0x${'5a'.repeat(4)}${input.objectId.slice(0, 56)}`, block: '—', from: '0x', input: `${body}${stringToHex(text).slice(2)}`, fn: 'launchAndBuy', coinName: input.coinName, symbol: input.symbol, record: { text, ...input }, description: '', sample: true };
}

const n = (value: string | undefined) => (value && /^\d+$/.test(value) ? Number(value).toLocaleString() : value ?? '—');
const MAX: Record<string, number> = { tris: 120_000, verts: 160_000, edges: 230_000 };

/**
 * The launch receipt, readable in five seconds: the object's name, its tag and its 3D measurements as written into the
 * launch transaction, with the exact on-chain text one tap away.
 */
export const TxPanel = memo(function TxPanel({ view, expected, loading, className, colors, coin, image }: { view?: TxView; expected?: { objectName?: string; objectTag?: string }; loading?: boolean; className?: string; colors?: string[]; coin?: string; image?: string }) {
  const [raw, setRaw] = useState<boolean>(false);
  if (loading || !view) return <div className={cn('raised flex min-h-64 items-center justify-center rounded-[28px] text-sm font-semibold text-ink/65', className)}><LoaderCircle size={18} className="mr-2 animate-spin"/>Reading the launch from Robinhood Chain…</div>;
  const record = view.record; const specs = parseObjectSpecs(record?.specs); const verified = Boolean(record && (!expected?.objectTag || expected.objectTag === record.tag));
  const swatches = (specs.rgb ? specs.rgb.split('+') : colors ?? []).slice(0, 4);
  const bars: [string, string, string | undefined][] = [['Triangles', 'tris', specs.tris], ['Vertices', 'verts', specs.verts], ['Edges', 'edges', specs.edges]];
  return <div className={cn('raised relative overflow-hidden rounded-[28px]', className)}>
    <div className="grid-paper pointer-events-none absolute inset-0 opacity-50" aria-hidden="true"/>
    <div className="relative flex items-center gap-3 border-b border-ink/[0.08] px-5 py-4 sm:px-6">
      {coin ? <img src={coin} alt="" className="size-11 rounded-full object-cover shadow-[0_0_0_2px_#fff,0_0_0_3px_rgba(12,13,16,.1),0_8px_16px_-8px_rgba(20,24,40,.5)]"/> : <GlassIcon name="chain" size={40}/>}
      <div className="min-w-0 flex-1"><p className="text-[15px] font-extrabold">Launch transaction</p><p className="font-mono text-[11px] font-semibold text-ink/65">Robinhood Chain · {view.fn}{view.block !== '—' ? ` · block ${Number(view.block).toLocaleString()}` : ''}</p></div>
      {view.sample ? <span className="chip">Specimen</span> : <a href={explorerTx(view.hash)} target="_blank" rel="noreferrer" className="press chip !text-ink">{shortHash(view.hash)}<ArrowUpRight size={12}/></a>}
    </div>
    <div className="relative grid grid-cols-2 gap-px border-b border-ink/[0.08] bg-ink/[0.06] font-mono text-[12px] font-extrabold sm:grid-cols-4">
      {([['Network', 'Robinhood Chain', '#0C0D10'], ['Chain ID', '4663', '#0C0D10'], ['Gas token', 'ETH', '#4A5BB8'], ['Method', `${view.fn}()`, '#0C0D10']] as const).map(([k, v, c]) => <div key={k} className="bg-white/90 px-4 py-2.5"><p className="text-[12px] uppercase text-ink/60">{k}</p><p className="mt-0.5 flex items-center gap-1.5 truncate" style={{ color: c }}><span className="size-2 shrink-0 rounded-full" style={{ background: c }}/>{v}</p></div>)}
    </div>
    <div className="relative bg-[#0F1115] px-5 py-3.5 font-mono text-[12px] font-semibold leading-[1.8] text-white/80 sm:px-6">
      <p><span className="text-[#7EE787]">tx</span>{'    '}<span className="text-white">{`${view.hash.slice(0, 18)}…${view.hash.slice(-8)}`}</span></p>
      <p><span className="text-[#79C0FF]">from</span>{'  '}<span className="text-white">{view.from.length > 4 ? `${view.from.slice(0, 10)}…${view.from.slice(-6)}` : '0x516CD7D7…9086Ac'}</span> <span className="text-white/40">{'// launch treasury'}</span></p>
      <p><span className="text-[#D2A8FF]">call</span>{'  '}<span className="text-[#FFA657]">{view.fn}</span>(<span className="text-[#A5D6FF]">"{view.coinName}"</span>, <span className="text-[#A5D6FF]">"${view.symbol}"</span>)</p>
      {record && <p className="truncate"><span className="text-[#7EE787]">data</span>{'  '}<span className="text-white/40">…</span><span className="text-[#7EE787]">{stringToHex(record.text).slice(2, 58)}</span><span className="text-white/40">…</span></p>}
    </div>
    {record ? <div className="relative px-5 pb-5 pt-5 sm:px-6">
      <div className="flex items-start gap-4">
        {image && <div className="scan-stage relative size-24 shrink-0 overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgba(12,13,16,.1)]"><img src={image} alt="" className="h-full w-full object-contain p-2"/>{coin && <img src={coin} alt="" className="absolute bottom-1 right-1 size-8 rounded-full ring-2 ring-white"/>}</div>}
        <div className="min-w-0"><p className="lab">Object on-chain</p><p className="display mt-2 text-[26px] leading-[1.02] sm:text-[32px]">{record.objectName}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="chip-dark !text-[11px]">{record.tag}</span>
        <span className="chip"><GlassIcon name="fingerprint" size={16} className="!filter-none"/>1 of 1 · tokenizable once</span>
        {view.symbol && <span className="chip">${view.symbol}</span>}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">{bars.map(([label, key, value]) => <div key={key} className="sunk rounded-2xl px-3.5 py-3"><p className="stat-label !text-[11px]">{label}</p><p className="mt-1 text-[20px] font-extrabold tnum">{n(value)}</p><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"><span className="bar-grow block h-full rounded-full" style={{ width: `${Math.min(100, (Number(value ?? 0) / MAX[key]) * 100)}%`, background: 'linear-gradient(90deg,#1B1D22,#6A6E78)' }}/></span></div>)}</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="sunk rounded-2xl px-3.5 py-3"><p className="stat-label !text-[11px]">Proportions</p><p className="mt-1 font-mono text-[13px] font-bold">{specs.dims ? specs.dims.replace(/x/g, ' × ') : '—'}</p></div>
        <div className="sunk rounded-2xl px-3.5 py-3"><p className="stat-label !text-[11px]">Material</p><p className="mt-1 truncate text-[13px] font-bold capitalize">{specs.mat ? specs.mat.replace(/\+/g, ', ') : '—'}</p></div>
        <div className="sunk rounded-2xl px-3.5 py-3"><p className="stat-label !text-[11px]">Colour print</p><p className="mt-1.5 flex gap-1">{swatches.length ? swatches.map(c => <span key={c} className="size-5 rounded-md ring-2 ring-white shadow-[0_0_0_1px_rgba(12,13,16,.12)]" style={{ background: c }}/>) : '—'}</p></div>
      </div>
      <button onClick={() => setRaw(v => !v)} aria-expanded={raw} className="sunk mt-3 flex w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left font-mono text-[11px] font-semibold text-ink/65">
        <span className="min-w-0 flex-1 truncate"><span className="text-ink/65">calldata … </span><span className="tx-hl">{record.text.slice(0, 64)}</span></span><ChevronDown size={14} className={cn('shrink-0 transition-transform', raw && 'rotate-180')}/>
      </button>
      {raw && <div className="slide-in mt-2 space-y-2"><p className="sunk break-all rounded-2xl px-3.5 py-3 font-mono text-[11px] font-semibold leading-5 text-ink">{record.text}</p><p className="sunk break-all rounded-2xl px-3.5 py-3 font-mono text-[11.5px] leading-[1.7] text-ink/65">{view.input.slice(0, 96)}…<span className="tx-hl">{stringToHex(record.text).slice(2, 180)}…</span></p></div>}
      <p className={cn('mt-3 flex items-center gap-1.5 text-xs font-bold', view.sample || verified ? 'text-ink/70' : 'text-down')}>{view.sample ? 'Encoded exactly like every ObjectPad launch' : verified ? <><Check size={14} strokeWidth={3} className="text-up"/>Matches this coin’s sealed record</> : 'Does not match the sealed record'}</p>
    </div> : <p className="relative px-6 py-6 text-sm leading-6 text-ink/60">{view.description ? <>This coin launched before object records were appended. Its object is named in the on-chain description: <span className="font-mono text-[11px] text-ink">{view.description.slice(0, 160)}</span></> : 'No ObjectPad object record was found in this transaction.'}</p>}
  </div>;
});
