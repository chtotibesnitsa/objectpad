import { useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, CircleDashed, Clock, Copy, Flame, HandCoins, Inbox, RefreshCw, ShieldCheck } from 'lucide-react';
import { ErrorState, Loading } from '@/components/Feedback';
import { GlassIcon } from '@/components/GlassIcon';
import { useDevActivity } from '@/lib/dev-activity';
import type { DevActivityItem } from '@/lib/dev-activity';
import { copyText, eth, shortAddress, timeAgo, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE = 5;

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'up' | 'muted' }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-extrabold uppercase tracking-wider',
    tone === 'up' ? 'bg-up/12 text-up' : tone === 'muted' ? 'bg-ink/[0.05] text-ink/55' : 'chip')}>{children}</span>;
}

function Row({ item }: { item: DevActivityItem }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (hash: string) => void copyText(hash).then(ok => { if (ok) { setCopied(hash); setTimeout(() => setCopied(null), 1400); } });
  const badge = item.kind === 'removal_only' ? 'Supply removal' : item.burnTxHash ? 'Buyback + burn cycle' : 'Buyback (pending pair)';
  const badgeIcon = item.kind === 'removal_only' ? <ShieldCheck size={13}/> : <Flame size={13}/>;
  return <div className="raised rounded-[22px] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase tracking-wider text-ink/70">{badgeIcon}{badge}</span>
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase tracking-wider', item.status === 'confirmed' ? 'bg-up/12 text-up' : 'bg-ink/[0.06] text-ink/55')}>
        {item.status === 'confirmed' ? <Check size={11}/> : <CircleDashed size={11} className="animate-spin motion-reduce:animate-none"/>}{item.status === 'confirmed' ? 'Confirmed' : 'Pending'}
      </span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {item.buyTxHash && <div><p className="stat-label !text-[10.5px]">ETH spent</p><p className="mt-0.5 font-mono text-[15px] font-extrabold tnum">{eth(Number(item.quoteAmount), 5)}</p></div>}
      {item.buyTxHash && <div><p className="stat-label !text-[10.5px]">$OBJECTPAD bought</p><p className="mt-0.5 font-mono text-[15px] font-extrabold tnum">{Number(item.tokenAmountBought).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>}
      {item.burnTxHash && <div><p className="stat-label !text-[10.5px]">Removed / burned</p><p className="mt-0.5 font-mono text-[15px] font-extrabold tnum">{Number(item.tokenAmountRemoved).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>}
      <div><p className="stat-label !text-[10.5px]">Execution</p><p className="mt-0.5 text-[15px] font-extrabold capitalize">{item.executionMode}</p></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Chip tone="muted"><Clock size={11}/>{timeAgo(item.timestamp)}</Chip>
      {item.burnClassification === 'CIRCULATING_SUPPLY_REMOVAL' && <Chip tone="muted">Removed from circulation, not a verified burn</Chip>}
      {item.burnClassification === 'SUPPLY_BURN' && <Chip tone="up">Permanently burned</Chip>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11.5px] font-bold text-ink/65">
      {item.buyTxHash && <button onClick={() => copy(item.buyTxHash!)} className="press flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 hover:bg-ink/10">Buy {shortAddress(item.buyTxHash, 8, 6)}{copied === item.buyTxHash ? <Check size={12}/> : <Copy size={12}/>}</button>}
      {item.burnTxHash && <button onClick={() => copy(item.burnTxHash!)} className="press flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 hover:bg-ink/10">{item.kind === 'removal_only' ? 'Removal' : 'Burn'} {shortAddress(item.burnTxHash, 8, 6)}{copied === item.burnTxHash ? <Check size={12}/> : <Copy size={12}/>}</button>}
      {item.explorerUrls.buy && <a href={item.explorerUrls.buy} target="_blank" rel="noreferrer" className="press flex items-center gap-1 rounded-full bg-ink/[0.05] px-3 py-1.5 hover:bg-ink/10">Buy on Robinhood Chain<ArrowUpRight size={11}/></a>}
      {item.explorerUrls.burn && <a href={item.explorerUrls.burn} target="_blank" rel="noreferrer" className="press flex items-center gap-1 rounded-full bg-ink/[0.05] px-3 py-1.5 hover:bg-ink/10">{item.kind === 'removal_only' ? 'Removal' : 'Burn'} on Robinhood Chain<ArrowUpRight size={11}/></a>}
    </div>
  </div>;
}

/** Read-only developer buyback/burn ledger for the treasury page. Every row is derived from a decoded Robinhood Chain receipt — nothing simulated. */
export function DevActivity() {
  const [shown, setShown] = useState<number>(PAGE);
  const summary = useDevActivity(0, Math.max(shown, PAGE));
  const data = summary.data;

  return <section className="raised mt-4 rounded-[32px] p-6 sm:p-10">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="lab"><GlassIcon name="burn" size={20}/>Developer Buybacks &amp; Burns</p>
        <h2 className="display mt-3 text-[32px] sm:text-[44px]">The dev wallet fights supply, in public.</h2>
        <p className="mt-3 max-w-2xl text-[15px] font-semibold leading-7 text-ink/65">Creator fees already fund launches and community rewards. The developer wallet also performs hourly $OBJECTPAD buyback-and-burn cycles. Every confirmed action appears here directly from Robinhood Chain.</p>
      </div>
    </div>

    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Chip tone="up"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live on-chain data</Chip>
      {data?.developerWallet && <button onClick={() => void copyText(data.developerWallet)} className="chip press flex items-center gap-1.5"><HandCoins size={12}/>Dev wallet {shortAddress(data.developerWallet, 6, 4)}<Copy size={11}/></button>}
      <Chip>Execution: {data ? (data.executionMode === 'automatic' ? 'Automatic' : 'Manual') : '…'}</Chip>
      <Chip tone="muted">Automation: In development</Chip>
      {data && <Chip tone="muted"><Clock size={11}/>Updated {timeAgo(data.updatedAt)}</Chip>}
    </div>

    {/* CREATOR FEES -> REWARDS TREASURY -> DEV BUYBACK -> VERIFIED BURN */}
    <div className="no-scrollbar mt-6 flex items-center gap-2 overflow-x-auto">
      {['Creator fees', 'Rewards treasury', 'Dev buyback', 'Verified burn'].map((step, i, arr) => <span key={step} className="flex shrink-0 items-center gap-2">
        <span className="sunk whitespace-nowrap rounded-full px-3.5 py-2 font-mono text-[11px] font-extrabold uppercase tracking-wider text-ink/70">{step}</span>
        {i < arr.length - 1 && <ArrowUpRight size={14} className="shrink-0 rotate-45 text-ink/30"/>}
      </span>)}
    </div>

    {summary.isPending ? <div className="mt-8"><Loading label="Reading the developer wallet from Robinhood Chain…"/></div>
      : summary.isError || !data ? <div className="mt-8 max-w-xl"><ErrorState message="Developer buyback activity could not be read from the chain right now." retry={() => void summary.refetch()}/></div>
      : !data.tokenAddress ? <div className="mt-8 flex flex-wrap items-center gap-3"><Chip tone="muted">Not deployed</Chip><p className="max-w-xl text-sm font-semibold text-ink/65">The $OBJECTPAD token address isn’t configured on this deployment, so there is nothing to index yet.</p></div>
      : <>
        <div className="no-scrollbar mt-6 -mx-1 flex gap-2.5 overflow-x-auto px-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
          {[
            ['Buyback cycles', data.totals.cycles.toLocaleString('en-US')],
            ['ETH used', eth(data.totals.ethSpent, 4)],
            ['$OBJECTPAD purchased', Math.round(data.totals.tokensBought).toLocaleString('en-US')],
            ['Permanently burned', data.tokenSupportsBurn ? Math.round(data.totals.tokensBurned).toLocaleString('en-US') : 'No verified burn()'],
            ['Removed from circulation', Math.round(data.totals.tokensRemovedFromCirculation).toLocaleString('en-US')],
            ['Last confirmed cycle', data.latestCycle ? timeAgo(data.latestCycle.timestamp) : '—'],
          ].map(([label, value]) => <div key={label} className="sunk min-w-[150px] shrink-0 rounded-2xl px-4 py-3.5 sm:min-w-0"><p className="stat-label !text-[10.5px]">{label}</p><p className="mt-1 text-[19px] font-extrabold tnum leading-tight">{value}</p></div>)}
        </div>
        {data.totals.usdSpent > 0 && <p className="mt-3 font-mono text-[11.5px] font-bold text-ink/50">≈ {usd(data.totals.usdSpent)} at each cycle’s recorded ETH/USD price · not today’s price</p>}

        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-ink/[0.035] px-4 py-3 text-[12.5px] font-semibold leading-5 text-ink/60">
          <ShieldCheck size={15} className="mt-0.5 shrink-0"/>
          <span>{data.tokenSupportsBurn ? '$OBJECTPAD exposes a verified burn() function: totals above reduce real total supply.' : '$OBJECTPAD has no verified burn() function on-chain, so dev-wallet transfers to the dead address are counted as “removed from circulation”, not “permanently burned”, until that changes.'}</span>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">Activity timeline</h3>{data.total > 0 && <span className="font-mono text-[11px] font-bold text-ink/50">{Math.min(shown, data.total)} of {data.total}</span>}</div>
          {!data.activities.length
            ? <div className="mt-4 flex flex-col items-center gap-3 rounded-[22px] bg-ink/[0.03] px-6 py-14 text-center"><Inbox size={26} className="text-ink/30"/><p className="text-sm font-bold text-ink/55">No confirmed developer buyback or burn activity yet. This list fills in automatically the moment one is confirmed on Robinhood Chain — nothing is added by hand.</p></div>
            : <div className="mt-4 grid gap-3">{data.activities.map(item => <Row key={item.cycleId} item={item}/>)}</div>}
          {data.nextCursor !== null && <button onClick={() => setShown(v => v + PAGE)} disabled={summary.isFetching} className="btn-ghost press mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-50">{summary.isFetching ? <RefreshCw size={14} className="animate-spin"/> : <ChevronDown size={14}/>}View all activity</button>}
        </div>

        <p className="mt-6 font-mono text-[11px] font-bold text-ink/45">Indexed through block {data.lastIndexedBlock.toLocaleString('en-US')}{!data.backfillComplete && ' · still backfilling history'}. A pending entry needs more confirmations before it’s shown as confirmed; nothing here promises a next cycle time.</p>
      </>}
  </section>;
}
