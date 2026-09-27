import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseEther } from 'viem';
import { ArrowUpRight, Calculator, Check, Landmark, Receipt, ShoppingBasket, Wallet } from 'lucide-react';
import { useApp } from '../store';
import { Fmt } from '../format';
import { PushScreen, Sheet, SheetHeader } from '../chrome';
import { CoinAvatar, Display, Enter, Lab, PadButton, PAD, Sparkline, Spinner } from '../ui';
import { AFFILIATION_LABEL, executeBasketBuy, forTab, quoteBasket, recordReceipt, TABS, useLeaderboard, useVault, useVaults, type BasketQuote, type CombinedReceipt, type TabId, type Vault } from '@/lib/vaults';
import { explorerTx } from '@/shared/pons';
import { cn } from '@/lib/utils';

const eth = (v: number, d = 3): string => `${v.toFixed(d)} ETH`;
const pct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
function Logos({ v, size = 26 }: { v: Vault; size?: number }) { const extra = v.constituents.length - 5; return <div className="flex -space-x-2">{v.constituents.slice(0, 5).map(c => <span key={c.token} className="rounded-full ring-2 ring-white"><CoinAvatar url={c.logo} symbol={c.symbol} size={size}/></span>)}{extra > 0 && <span className="ap-mono flex items-center justify-center rounded-full bg-ink text-[10px] font-black text-white ring-2 ring-white" style={{ width: size, height: size }}>+{extra}</span>}</div>; }
function Tag({ v }: { v: Vault }) { return <span className={cn('ap-mono rounded-full px-1.5 py-0.5 text-[9.5px] font-black uppercase', v.execution === 'basket' ? 'bg-[#12A150]/[0.12] text-[#12A150]' : 'bg-ink/[0.07] text-ink/60')}>{v.execution === 'basket' ? 'Index · basket' : v.execution === 'halted' ? 'Halted' : 'Track only'}</span>; }

const HOW: [typeof Calculator, string, string][] = [
  [Calculator, 'How is this calculated?', 'Eligible coins only (valid proof, fresh price, ≥2 traders, 7-day volume, real depth, no whale over 5%). score = √float × √depth × ln(1+vol). Max 25% per coin. Rebalances are announced 24h ahead and hashed.'],
  [ShoppingBasket, 'What happens when I buy?', 'One atomic transaction buys every ETH-quoted coin on its own curve. You get the underlying coins, not shares. Every leg fills or nothing does.'],
  [Wallet, 'Where are the assets held?', 'Index: nothing is held. Basket: in your wallet. Backed vault: in an audited contract, which isn’t deployed yet.'],
];

/** /app/vaults: Object Vaults on iPhone. */
export default function VaultsView() {
  const app = useApp(); const vaults = useVaults(null); const board = useLeaderboard(); const [tab, setTab] = useState<TabId>('trending'); const [how, setHow] = useState<number | null>(null);
  const items = useMemo(() => forTab(vaults.data?.items ?? [], tab), [vaults.data, tab]);
  return <PushScreen title="Object Vaults"><div className="flex flex-col gap-4 px-4 pb-28">
    <Enter><div className="flex flex-col gap-2 pt-2"><Lab>Object Vaults · V2</Lab><Display size={38}>Buy a category, not a ticker.</Display><p className="text-[14.5px] font-semibold text-ink/65">Photograph a thing. Launch its market. Group markets into a vault. Buy the whole category in one transaction.</p></div></Enter>
    <Enter delay={0.05}><div className="grid grid-cols-3 gap-2">{[['Index', 'Tracks prices', 'Live', PAD.ink], ['Basket', 'Coins to you', 'Live', PAD.up], ['Backed vault', 'Redeemable shares', 'Audit', PAD.muted]].map(([a, b, s, c]) => <div key={a} className="ap-raised flex flex-col gap-1 rounded-[18px] p-3"><span className="size-2 rounded-full" style={{ background: c }}/><p className="text-[14px] font-extrabold leading-tight">{a}</p><p className="text-[11.5px] font-semibold text-[#6A6E78]">{b}</p><p className="ap-mono text-[9.5px] font-black uppercase" style={{ color: c }}>{s}</p></div>)}</div></Enter>
    <Enter delay={0.1}><div className="flex flex-col gap-1.5">{HOW.map(([I, t], i) => <button key={t} type="button" onClick={() => setHow(i)} className="ap-press ap-raised flex min-h-[52px] items-center gap-3 rounded-[18px] px-3.5 text-left"><span className="flex size-8 items-center justify-center rounded-full bg-ink text-white"><I size={15}/></span><span className="flex-1 text-[14.5px] font-extrabold">{t}</span><ArrowUpRight size={15} className="text-ink/40"/></button>)}</div></Enter>
    <div className="ap-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4">{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={cn('ap-press min-h-10 shrink-0 rounded-full px-3.5 text-[13.5px] font-extrabold', tab === t.id ? 'bg-ink text-white' : 'bg-white text-ink/65')}>{t.label}</button>)}</div>
    {vaults.isPending ? <div className="flex justify-center py-10"><Spinner/></div> : !items.length ? <p className="py-6 text-center text-[14px] font-semibold text-[#6A6E78]">Nothing in this tab yet.</p> : items.map((v, i) => <Enter key={v.id} delay={Math.min(i, 6) * 0.04}><button type="button" onClick={() => app.push(`/app/vaults/${v.slug}`)} className="ap-press ap-raised flex w-full flex-col gap-2.5 rounded-[24px] p-4 text-left">
      <div className="flex items-center gap-1.5"><Tag v={v}/><span className="ap-mono rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[9.5px] font-black uppercase text-ink/60">{AFFILIATION_LABEL[v.affiliation]}</span></div>
      <div className="flex items-center justify-between gap-2"><p className="truncate text-[18px] font-extrabold">{v.name}</p><Logos v={v}/></div>
      <div className="flex items-end justify-between"><div><p className="ap-display ap-num text-[30px] leading-none">{v.level.toFixed(2)}</p><p className="ap-mono mt-1 text-[11px] font-bold" style={{ color: v.change7d >= 0 ? PAD.up : PAD.down }}>7d {pct(v.change7d)}</p></div><Sparkline points={v.history.map(h => h.v)} up={v.change7d >= 0} className="h-10 w-28"/></div>
      <div className="ap-mono grid grid-cols-3 gap-1 border-t border-ink/[0.07] pt-2 text-[10.5px] font-bold text-[#6A6E78]"><span>Vol {eth(v.volume24hEth, 3)}</span><span>Liq {eth(v.liquidityEth, 3)}</span><span className="text-right" style={{ color: v.health.proof === v.health.total ? PAD.up : PAD.muted }}>{v.health.proof}/{v.health.total} proof</span></div>
    </button></Enter>)}
    <Enter><div className="ap-raised flex flex-col gap-2 rounded-[24px] p-4"><p className="text-[17px] font-extrabold">Earn on vaults</p><p className="text-[13px] font-semibold text-[#6A6E78]">Creators set a 0–1% fee, paid in ETH on every basket trade. Traders earn 1 point per 0.001 ETH of verified basket volume. Points are an activity record, not a token.</p>
      {(board.data?.traders ?? []).slice(0, 5).map((t, i) => <div key={t.wallet} className="flex items-center gap-2 text-[13px]"><span className="ap-mono w-5 font-black">{i + 1}</span><span className="ap-mono flex-1">{t.wallet.slice(0, 6)}…{t.wallet.slice(-4)}</span><span className="font-extrabold">{t.points.toLocaleString()} pts</span></div>)}
      <a href="/vaults#earn" className="ap-mono text-[12px] font-extrabold underline">Create a vault on the web →</a></div></Enter>
    <p className="text-[11px] font-semibold text-[#6A6E78]">Creating can be free. Ownership is transparent. Trading remains a market decision. Object coins track their own markets, not ownership of any company or object.</p>
    <Sheet open={how !== null} onClose={() => setHow(null)} height="auto"><SheetHeader title={how !== null ? HOW[how][1] : ''} onDone={() => setHow(null)}/><div className="flex flex-col gap-3 px-[18px] pb-4 pt-2"><p className="text-[15px] font-semibold leading-6 text-ink/75">{how !== null ? HOW[how][2] : ''}</p>{how === 0 && <a href="/whitepaper#vault-calculation" className="ap-mono text-[12.5px] font-extrabold underline">Full math in the white paper →</a>}</div></Sheet>
  </div></PushScreen>;
}

/** /app/vaults/:slug: top 5 constituents, sticky Buy basket, bottom sheet with execution details. */
export function VaultDetailView() {
  const { slug = '' } = useParams(); const app = useApp(); const vault = useVault(slug, null); const qc = useQueryClient(); const [open, setOpen] = useState<boolean>(false); const [amount, setAmount] = useState<string>('0.01'); const [receipt, setReceipt] = useState<CombinedReceipt | null>(null); const [phase, setPhase] = useState<string>('');
  const v = vault.data; const wei = useMemo(() => { try { return parseEther(amount || '0'); } catch { return 0n; } }, [amount]);
  const quote = useQuery<BasketQuote>({ queryKey: ['objectpad', 'basket-quote', slug, wei.toString(), 300], enabled: open && Boolean(v) && wei > 0n && v?.execution === 'basket', queryFn: () => quoteBasket(v as Vault, wei, 300), refetchInterval: 15_000, retry: 0 });
  const buy = useMutation({ mutationFn: async () => { if (!v) throw new Error('Loading…'); const s = app.signer(); const r = await executeBasketBuy({ wallet: s.address, vault: v, quote: quote.data ?? await quoteBasket(v, wei, 300), send: s.sendPrepared, pairs: app.pairs?.assets ?? [], router: app.pairs?.router.swapRouter, quoter: app.pairs?.router.quoter, ceilingBps: 300, onPhase: setPhase }); setReceipt(r); await recordReceipt(slug, r, await app.accountToken()); return r; }, onSettled: () => { setPhase(''); void qc.invalidateQueries({ queryKey: ['objectpad', 'vault'] }); } });
  if (!v) return <PushScreen title="Vault"><div className="flex justify-center py-20">{vault.isError ? <p className="font-semibold text-[#6A6E78]">This vault isn’t available.</p> : <Spinner/>}</div></PushScreen>;
  const q = quote.data;
  return <PushScreen title={v.name}><div className="flex flex-col gap-3.5 px-4 pb-44">
    <Enter><div className="flex flex-col gap-2 pt-2"><div className="flex gap-1.5"><Tag v={v}/><span className="ap-mono rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[9.5px] font-black uppercase text-ink/60">{AFFILIATION_LABEL[v.affiliation]}</span></div><Display size={32}>{v.name}</Display><p className="ap-display ap-num text-[48px] leading-none">{v.level.toFixed(2)}</p><p className="ap-mono text-[12px] font-bold" style={{ color: v.change24h >= 0 ? PAD.up : PAD.down }}>24h {pct(v.change24h)} · 7d {pct(v.change7d)}</p><Sparkline points={v.history.map(h => h.v)} up={v.change7d >= 0} className="h-24 w-full"/></div></Enter>
    {v.stock && <p className="rounded-2xl bg-[#2F7BF2]/10 p-3 text-[12.5px] font-semibold text-ink/75">{v.stock.note}</p>}
    <Lab>Top constituents</Lab>
    {v.constituents.slice(0, 5).map((c, i) => <Enter key={c.token} delay={i * 0.04}><div className="ap-raised flex items-center gap-3 rounded-[18px] p-3"><CoinAvatar url={c.logo} symbol={c.symbol} size={38}/><div className="min-w-0 flex-1"><p className="truncate text-[14.5px] font-extrabold">{c.name}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]"><div className="h-full rounded-full bg-ink" style={{ width: `${c.weight * 400}%` }}/></div></div><p className="ap-mono text-[14px] font-black">{(c.weight * 100).toFixed(1)}%</p></div></Enter>)}
    <div className="ap-raised flex flex-col gap-1.5 rounded-[18px] p-3.5 text-[12.5px] font-semibold text-[#6A6E78]"><p className="flex items-center gap-1.5 font-extrabold text-ink"><Landmark size={14}/>Methodology {v.methodology.version}</p><p className="ap-mono break-all text-[10.5px]">{v.methodology.hash}</p><p>Creator fee: {v.creatorFee.bps ? `${(v.creatorFee.bps / 100).toFixed(2)}%` : 'none'} · Backed vault: {v.backed.status === 'deployed' ? 'live' : 'awaiting audit'}</p><a href={`/vaults/${v.slug}`} className="ap-mono font-extrabold text-ink underline">Full table, contracts & rebalances →</a></div>
    <div className="ap-fixed fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 px-4"><PadButton title={v.execution === 'basket' ? `Buy basket · ${v.constituents.length} coins` : v.executionNote.split(':')[0]} icon={ShoppingBasket} kind="ink" enabled={v.execution === 'basket'} onClick={() => setOpen(true)}/></div>
    <Sheet open={open} onClose={() => setOpen(false)} height="large"><SheetHeader title="Buy basket" onDone={() => setOpen(false)}/><div className="flex flex-col gap-3 px-[18px] pt-2">
      <div className="ap-raised rounded-[20px] p-4"><Lab>You pay</Lab><div className="mt-1 flex items-center"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[30px] font-extrabold outline-none"/><span className="rounded-full bg-ink px-3 py-1 text-[13px] font-extrabold text-white">ETH</span></div><div className="mt-2 flex gap-1.5">{['0.005', '0.01', '0.05'].map(a => <button key={a} onClick={() => setAmount(a)} className={cn('ap-press min-h-9 flex-1 rounded-xl text-[12.5px] font-extrabold', amount === a ? 'bg-ink text-white' : 'bg-ink/[0.06]')}>{a}</button>)}</div></div>
      <div className="ap-raised flex flex-col gap-1.5 rounded-[20px] p-4 text-[13px]">{(q?.legs ?? []).map(l => <div key={l.token} className="flex items-center gap-2"><span className="flex-1 font-extrabold">${l.symbol}</span><span className="ap-mono text-[#6A6E78]">{(l.weight * 100).toFixed(1)}%</span><span className="ap-mono w-16 text-right font-bold">{l.route === 'atomic' ? `${(l.impact * 100).toFixed(2)}%` : l.route}</span></div>)}
        <div className="mt-1 flex justify-between border-t border-ink/[0.08] pt-2 font-bold"><span className="text-[#6A6E78]">Aggregate impact</span><span className="ap-mono">{q ? `${(q.impact * 100).toFixed(2)}%` : quote.isFetching ? 'quoting…' : '—'}</span></div>
        <div className="flex justify-between font-bold"><span className="text-[#6A6E78]">Slippage ceiling</span><span className="ap-mono">3%</span></div>
        {v.creatorFee.bps > 0 && <div className="flex justify-between font-bold"><span className="text-[#6A6E78]">Creator fee</span><span className="ap-mono">{(v.creatorFee.bps / 100).toFixed(2)}%</span></div>}
        <div className="flex justify-between font-bold"><span className="text-[#6A6E78]">Confirmations</span><span className="ap-mono">1</span></div>
        {q?.problem && <p className="font-bold text-[#E5484D]">{q.problem}</p>}{quote.isError && <p className="font-bold text-[#E5484D]">{quote.error.message}</p>}</div>
      <PadButton title={buy.isPending ? (phase || 'Working…') : 'Buy basket · 1 transaction'} icon={ShoppingBasket} kind="ink" busy={buy.isPending} enabled={Boolean(q?.ok) && !buy.isPending} onClick={() => buy.mutate()}/>
      {buy.isError && <p className="text-[13px] font-bold text-[#E5484D]">{buy.error.message.split('\n')[0]}</p>}
      {receipt && <div className="ap-raised flex flex-col gap-1.5 rounded-[20px] p-4 text-[13px]"><p className="flex items-center gap-1.5 font-extrabold"><Receipt size={15}/>Combined receipt</p>{receipt.legs.map(l => <p key={l.symbol} className="flex items-center gap-1.5"><Check size={13} color={PAD.up}/><span className="flex-1 font-extrabold">${l.symbol}</span><span className="ap-mono">{Fmt.compact(l.tokensOut)}</span></p>)}<a href={explorerTx(receipt.hash)} target="_blank" rel="noreferrer" className="ap-mono font-extrabold underline">View transaction →</a></div>}
      <p className="text-[11px] font-semibold text-[#6A6E78]">Every leg fills at or above its minimum or the whole transaction reverts. Coins go straight to your wallet. Trading remains a market decision.</p>
    </div></Sheet>
  </div></PushScreen>;
}
