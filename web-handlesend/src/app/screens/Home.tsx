import { useMemo } from 'react';
import { isNsfwCoin } from '@/shared/nsfw';
import { ArrowRightCircle, ChevronRight, CircleUserRound, ScanLine } from 'lucide-react';
import type { ObjectCoin } from '@/shared/domain';
import { sortRewards } from '@/lib/rewards';
import { useApp } from '../store';
import { Feedback } from '../feedback';
import { Fmt } from '../format';
import { RootScreen } from '../chrome';
import { V2Pill } from '../pairs';
import { CircleIconButton, CloudDrift, CoinAvatar, CountdownPill, Display, Enter, ErrorBanner, GlassIcon, img, Lab, PadButton, PAD, ProgressBar, PulseDot, SectionHeader, Shimmer, SkyPoster, Sparkline, VoxelField } from '../ui';

export function CoinTile({ coin, ethUsd }: { coin: ObjectCoin; ethUsd: number | null }) {
  return <div className="ap-raised flex w-[150px] shrink-0 flex-col gap-2 rounded-[22px] p-3 text-left">
    <div className="flex items-center justify-between"><CoinAvatar url={coin.logo} symbol={coin.symbol} size={44}/><span className="ap-mono text-[11px] font-extrabold" style={{ color: coin.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(coin.change24h)}</span></div>
    <p className="truncate text-[15px] font-extrabold">${coin.symbol}</p>
    <p className="ap-mono truncate text-[10.5px] font-bold text-[#6A6E78]">{Fmt.value(coin.marketCapEth, ethUsd)} mcap</p>
    <Sparkline points={coin.spark} up={coin.change24h >= 0} className="h-[26px] w-full"/>
  </div>;
}

export default function HomeView() {
  const app = useApp(); const lastScan = app.lastScan();
  const trending = useMemo(() => app.coins.filter(c => !isNsfwCoin(c)).sort((a, b) => b.trending - a.trending).slice(0, 8), [app.coins]);
  const open = useMemo(() => sortRewards((app.rewards?.bounties ?? []).filter(b => b.status === 'open'), 'best', Date.now()), [app.rewards]);
  const burned = Number(BigInt(app.burns?.totalTokens ?? '0') / 10n ** 14n) / 1e4;
  return <RootScreen><div className="flex flex-col gap-[18px]">
    {/* Hero */}
    <Enter className="relative mt-1.5">
      <div className="relative h-[470px] overflow-hidden rounded-[34px]">
        <img src={img('glass_pedestal_voxel_cubes')} alt="" className="absolute inset-0 size-full object-cover"/>
        <CloudDrift style={{ opacity: 0.6 }}/>
        <div className="absolute inset-0 flex items-center justify-center"><img src={img('rubber_duck_voxel_dissolve')} alt="" className="ap-bob w-[230px] translate-y-10 drop-shadow-[0_14px_20px_rgba(0,0,0,.18)]"/></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/55"/>
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-4">
        <img src={img('duck_mark')} alt="" className="size-[30px] rounded-full object-cover"/><span className="ap-display text-[19px] text-white">ObjectPad</span><V2Pill small/>
        <span className="ap-glass-dark ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-[7px] text-white"><span className="size-[7px] rounded-full" style={{ background: app.treasuryOpen ? PAD.up : PAD.amber }}/><span className="ap-mono text-[10px] font-extrabold">{!app.status ? '…' : app.treasuryOpen ? `${app.launchesLeft} FREE LAUNCHES` : 'QUEUE OPEN'}</span></span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 p-5">
        <span className="ap-glass-dark flex items-center gap-2 rounded-full px-[11px] py-[7px]"><PulseDot/><span className="ap-mono text-[10.5px] font-extrabold text-white">{app.market?.objectpad?.launched ?? app.coins.length} OBJECTS LIVE ON-CHAIN</span></span>
        <button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.setV2(true)} className="ap-press ap-glass-dark flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5"><span className="ap-gold ap-mono flex h-[18px] items-center rounded-full px-1.5 text-[9.5px] font-black">V2 LIVE</span><span className="text-[12.5px] font-extrabold text-white">Pair any object with a stock</span><ChevronRight size={11} strokeWidth={3} className="text-white"/></button>
        <Display size={42} className="!text-white">{'Real objects.\nReal markets.'}</Display>
        <p className="text-[15px] font-semibold text-white/85">Scan any object, pair it with a tokenized stock, and launch its coin free on Robinhood Chain.</p>
        <div className="flex w-full items-center gap-2.5"><PadButton title="Scan an object" icon={ScanLine} kind="pearl" onClick={() => app.startScan()}/><CircleIconButton icon={CircleUserRound} dark size={56} label="Account" onClick={() => app.setAccount(true)}/></div>
      </div>
    </Enter>

    {lastScan && <Enter delay={0.1}><button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(`/app/studio/${lastScan}`)} className="ap-press ap-raised flex w-full items-center gap-3.5 rounded-[24px] p-4 text-left">
      <GlassIcon name="glass_mesh" size={46} float/><span className="flex-1"><span className="block text-[16px] font-extrabold">Continue your scan</span><span className="block text-[13px] font-semibold text-[#6A6E78]">Your photos are saved. Pick up where you left off.</span></span><ArrowRightCircle size={26} fill={PAD.ink} stroke="#fff"/>
    </button></Enter>}

    <Enter delay={0.15} className="flex flex-col gap-3">
      <SectionHeader lab="How it works" title="Real object → real coin"/>
      <div className="ap-scroll -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2">
        {[['1', 'Six photos', 'Walk around it. The guide tells you where.', 'smartphone_camera_mug'], ['2', 'AI rebuilds it', 'A real 3D model, checked for duplicates.', 'rubber_duck_voxel_dissolve'], ['3', 'Launch free', 'Name it. The treasury pays the gas.', 'rocket_launch_voxel'], ['4', 'Earn forever', '0.5% of every trade, claimable anytime.', 'gold_coins_vault_box']].map(([n, t, b, i]) => <div key={n} className="ap-raised flex w-[178px] shrink-0 flex-col gap-2 rounded-[24px] p-3.5">
          <img src={img(i)} alt="" className="h-[110px] w-full object-contain"/><p className="ap-mono text-[11px] font-extrabold text-[#6A6E78]">{n}</p><p className="text-[16px] font-extrabold">{t}</p><p className="text-[12.5px] font-semibold text-[#6A6E78]">{b}</p>
        </div>)}
      </div>
    </Enter>

    {app.building.length > 0 && <Enter delay={0.2}><div className="ap-raised flex flex-col gap-2.5 rounded-[24px] p-4">
      <span className="flex items-center gap-1.5"><PulseDot color={PAD.sky}/><Lab>Being built right now</Lab></span>
      {app.building.slice(0, 3).map(b => <div key={b.code} className="flex items-center gap-3"><span className="ap-mono w-[70px] shrink-0 text-[12px] font-extrabold">{b.symbol ? `$${b.symbol}` : '···'}</span><span className="min-w-0 flex-1"><span className="mb-1 block truncate text-[13.5px] font-bold">{b.name || 'New object'}</span><ProgressBar value={b.progress} color={PAD.sky}/></span><span className="ap-mono text-[10px] font-bold capitalize text-[#6A6E78]">{b.stage}</span></div>)}
    </div></Enter>}

    <Enter delay={0.25} className="flex flex-col gap-3">
      <SectionHeader lab="Market · live" title="Trending objects" action="All" onAction={() => app.selectTab('market')}/>
      {app.coinsError ? <ErrorBanner message={app.coinsError}/> : !app.loaded ? [0, 1, 2].map(i => <Shimmer key={i} className="h-[72px] rounded-[20px]"/>)
        : <div className="ap-scroll -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2">{trending.map(c => <button key={c.id} type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(`/app/coin/${c.id}`)} className="ap-press"><CoinTile coin={c} ethUsd={app.ethUsd}/></button>)}</div>}
    </Enter>

    <Enter delay={0.3}><button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.selectTab('rewards')} className="ap-press relative w-full overflow-hidden rounded-[28px] p-[18px] text-left shadow-[0_12px_20px_rgba(47,123,242,.4)]">
      <div className="ap-sky absolute inset-0"/><CloudDrift style={{ opacity: 0.8 }}/><VoxelField count={16} seed={9}/>
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between"><Lab className="!text-white/70">Paid Rewards</Lab><span className="ap-mono rounded-full bg-white/20 px-2.5 py-[5px] text-[11px] font-extrabold text-white">{Fmt.money(app.rewards?.stats?.openUsd ?? 0)} OPEN</span></div>
        <Display size={30} className="!text-white">{'Find it. Scan it.\nGet paid.'}</Display>
        {open[0] && <div className="flex items-center gap-2.5 rounded-[20px] bg-white/[0.14] p-2.5">
          <div className="h-[54px] w-[84px] shrink-0 overflow-hidden rounded-[14px]"><SkyPoster reward={open[0]}/></div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1"><p className="w-full truncate text-[14px] font-extrabold text-white">{open[0].title}</p><CountdownPill deadline={open[0].deadline}/></div>
          <span className="ap-display text-[22px] text-white">{Fmt.money(open[0].rewardUsd)}</span>
        </div>}
      </div>
    </button></Enter>

    <Enter delay={0.35}><button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push('/app/burn')} className="ap-press ap-smoke flex w-full items-center gap-3.5 rounded-[24px] p-4 text-left">
      <GlassIcon name="glass_burn" size={54} float/><span className="flex-1"><Lab className="!text-white/55">Buyback & burn</Lab><span className="mt-0.5 block text-[16px] font-extrabold">{Fmt.compact(burned)} $OBJECTPAD burned</span><span className="block text-[12.5px] font-semibold text-white/60">{app.burns?.burns ?? 0} burns · every trade feeds the fire</span></span><ChevronRight size={18} className="text-white/50"/>
    </button></Enter>

    <Enter delay={0.4}><button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push('/app/earn')} className="ap-press ap-raised flex w-full items-center gap-3.5 rounded-[24px] p-4 text-left">
      <GlassIcon name="glass_coins" size={50}/><span className="flex-1"><span className="block text-[16px] font-extrabold">Post & earn</span><span className="block text-[13px] font-semibold text-[#6A6E78]">Get paid for verified X posts about ObjectPad.</span></span><ChevronRight size={18} className="text-[#6A6E78]"/>
    </button></Enter>
  </div></RootScreen>;
}
