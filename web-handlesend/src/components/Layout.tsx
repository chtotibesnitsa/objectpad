import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Activity, Compass, Home, LogOut, ScanLine, Volume2, VolumeX, X } from 'lucide-react';
import { PixelIcon, type PixelName } from './PixelIcon';
import { Brand } from './Brand';
import { LiveTicker, ObjectPadCa } from './LiveTicker';
import { BurnToasts } from './BurnToasts';
import { InstallBanner } from './InstallBanner';
import { registerAppWorker } from '@/lib/install';
import { AccountButton } from './AccountButton';
import { CryptoBackdrop, AsciiObject } from './AsciiField';
import { GlassIcon, type GlassName } from './GlassIcon';
import { useSession } from '@/lib/session';
import { usePreferences } from '@/hooks/use-preferences';
import { useTreasury } from '@/lib/treasury';
import { useReadiness } from '@/lib/market';
import { pendingScan } from '@/lib/handoff';
import { OBJECTPAD_X_URL } from '@/lib/brand';
import { shortAddress } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS: { to: string; label: string; icon: PixelName; match: (p: string, s: string) => boolean }[] = [
  { to: '/launch', label: 'Create', icon: 'create', match: (p: string) => p.startsWith('/launch') },
  { to: '/explore', label: 'Market', icon: 'market', match: (p: string) => p === '/explore' || p.startsWith('/coin/') || p.startsWith('/objects/') },
  { to: '/earn', label: 'Earn', icon: 'earn', match: (p: string) => p.startsWith('/earn') || p.startsWith('/rewards') },
  { to: '/burn', label: 'Burn', icon: 'burn', match: (p: string) => p === '/burn' },
  { to: '/treasury', label: 'Treasury', icon: 'treasury', match: (p: string) => p === '/treasury' },
  { to: '/docs', label: 'How it works', icon: 'docs', match: (p: string) => p === '/docs' },
];
const DRAWER: { code: string; title: string; items: { to: string; label: string; icon: GlassName; note: string }[] }[] = [
  { code: '01', title: 'Make', items: [{ to: '/v2', label: 'What’s new in V2', icon: 'chart', note: 'Stock pairing · release log' }, { to: '/launch', label: 'Scan & launch', icon: 'qr', note: 'Phone camera → coin, paired with any stock' }, { to: '/download', label: 'Mobile apps', icon: 'rocket', note: 'Android live · iOS in App Store review' }, { to: '/inventory', label: 'Saved scans', icon: 'mesh', note: 'Resume any scan' }, { to: '/rewards', label: 'Paid Rewards', icon: 'diamond', note: 'Find & scan objects · post your own bounty' }, { to: '/earn', label: 'Post & earn', icon: 'coins', note: 'Get paid for verified X posts' }, { to: '/wallet', label: 'My wallet', icon: 'wallet', note: 'Balance · deposit · withdraw' }, { to: '/earnings', label: 'Creator earnings', icon: 'coins', note: '0.5% of every trade' }] },
  { code: '02', title: 'Market', items: [{ to: '/explore', label: 'Object coins', icon: 'chart', note: 'Every scanned coin' }, { to: '/burn', label: '$OBJECTPAD burn', icon: 'burn', note: 'Buyback & burn log' }, { to: '/treasury', label: 'Launch treasury', icon: 'vault', note: 'Pays every launch' }] },
  { code: '03', title: 'Protocol', items: [{ to: '/docs', label: 'How it works', icon: 'chain', note: '4 steps · receipt · fees' }, { to: '/provenance', label: 'Provenance', icon: 'fingerprint', note: 'Trace any object' }, { to: '/craft', label: 'Crafting Table', icon: 'diamond', note: 'Launching soon' }, { to: '/safety', label: 'Safety & rights', icon: 'shield', note: 'What we accept' }] },
];

/** Desktop tabs, centred: a raised glass lens slides under the active tab. */
function TabStrip() {
  const { pathname, search } = useLocation(); const root = useRef<HTMLElement>(null); const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const index = TABS.findIndex(tab => tab.match(pathname, search));
  useLayoutEffect(() => { const measure = () => { const el = index >= 0 ? root.current?.querySelectorAll<HTMLElement>('a')[index] : null; setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null); }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [index]);
  return <nav ref={root} aria-label="Main navigation" className="sunk relative mx-2 hidden flex-1 items-center justify-between gap-0.5 rounded-[18px] p-1 lg:flex xl:mx-6">
    <span aria-hidden="true" className={cn('raised absolute bottom-1 top-1 rounded-[14px] transition-all duration-500 ease-[cubic-bezier(.2,.9,.25,1.15)]', pill ? 'opacity-100' : 'opacity-0')} style={pill ? { left: pill.left, width: pill.width } : undefined}/>
    {TABS.map((tab, i) => <NavLink key={tab.to} to={tab.to} className={cn('relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[14px] px-2 text-[13.5px] font-bold tracking-[-0.015em] transition-colors duration-300 xl:gap-2 xl:px-3 xl:text-[14.5px]', i === index ? 'text-ink' : 'text-ink/65 hover:text-ink')}><PixelIcon name={tab.icon} size={14}/><span className="whitespace-nowrap">{tab.label}</span></NavLink>)}
  </nav>;
}

/** The real X (Twitter) wordmark, not lucide's generic close glyph. */
function XLogo({ size = 15 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }

/** Link to ObjectPad's official X account — social proof that this is a real, active project. */
function XLink({ className = '' }: { className?: string }) { return <a href={OBJECTPAD_X_URL} target="_blank" rel="noreferrer" aria-label="ObjectPad on X" className={`press flex items-center justify-center rounded-full bg-ink text-white transition-transform hover:scale-105 ${className}`}><XLogo size={15}/></a>; }

/** Live treasury balance: the wallet that pays for every free launch. */
function TreasuryChip() {
  const treasury = useTreasury();
  return <Link to="/treasury" className="press raised hidden min-h-12 items-center gap-2 rounded-[16px] pl-1.5 pr-3.5 xl:flex" title="Launch treasury">
    <GlassIcon name="vault" size={36}/>
    <span className="leading-none"><span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink/65"><span className={cn('size-1.5 rounded-full', treasury.open ? 'pulse-dot bg-up' : 'bg-ink/40')}/>Treasury</span><span className="mt-1 block text-[14px] font-extrabold tnum">{treasury.label}</span></span>
  </Link>;
}

/** Phone header chip: live treasury balance, one tap to the treasury page. */
function TreasuryMini() {
  const treasury = useTreasury();
  return <Link to="/treasury" className="press sunk flex min-h-10 items-center gap-1.5 rounded-[14px] px-3 font-mono text-[12px] font-extrabold tnum lg:hidden" title="Launch treasury"><GlassIcon name="vault" size={22}/><span className={cn('size-1.5 rounded-full', treasury.open ? 'pulse-dot bg-up' : 'bg-ink/40')}/>{treasury.label}</Link>;
}

/** Lab console drawer from the left: every destination, live system readouts and the account. */
function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession(); const { sound, toggleSound } = usePreferences(); const t = useTreasury(); const status = useReadiness(); const resume = pendingScan();
  useEffect(() => { if (!open) return; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [open, onClose]);
  const checks = status.data?.checks ?? [];
  return <div className={cn('fixed inset-0 z-[70] transition-[visibility] duration-500', open ? 'visible' : 'invisible')} role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!open}>
    <button className={cn('absolute inset-0 bg-ink/20 backdrop-blur-[3px] transition-opacity duration-500', open ? 'opacity-100' : 'opacity-0')} aria-label="Close menu" onClick={onClose} tabIndex={open ? 0 : -1}/>
    <aside className={cn('glass-nav absolute inset-y-3 left-3 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[30px] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.25,1.05)]', open ? 'translate-x-0' : '-translate-x-[110%]')}>
      <AsciiObject src="/models/points/pepe.json" cols={44} rows={30} className="absolute -right-16 bottom-10 text-[11px] text-ink/[0.07]"/>
      <div className="relative flex items-center justify-between px-5 pt-5"><Brand/><button onClick={onClose} className="press raised flex size-11 items-center justify-center rounded-2xl" aria-label="Close menu" tabIndex={open ? 0 : -1}><X size={18} strokeWidth={2.5}/></button></div>
      <div className="relative mx-4 mt-4 grid grid-cols-2 gap-2">
        <div className="sunk rounded-2xl px-3 py-2.5"><p className="stat-label !text-[11px]">Treasury</p><p className="mt-1 text-[15px] font-extrabold tnum">{t.label}</p></div>
        <div className="sunk rounded-2xl px-3 py-2.5"><p className="stat-label !text-[11px]">Free today</p><p className="mt-1 text-[15px] font-extrabold tnum">{t.loading ? '…' : t.open ? `${t.launchesLeft} launches` : 'Topping up'}</p></div>
        <div className="sunk col-span-2 flex items-center gap-2 rounded-2xl px-3 py-2 font-mono text-[11.5px] font-semibold text-ink/60">{checks.length ? checks.map(c => <span key={c.id} title={c.label} className={cn('size-2 rounded-full', c.ready ? 'bg-up' : 'bg-ink/25')}/>) : <span className="size-2 rounded-full bg-ink/25"/>}<span className="ml-1">{checks.filter(c => c.ready).length}/{checks.length || 7} systems live</span><span className="ml-auto">chain 4663</span></div>
      </div>
      {resume && <Link to={`/launch/${resume}`} onClick={onClose} tabIndex={open ? 0 : -1} className="press raised relative mx-4 mt-3 flex items-center gap-3 rounded-2xl p-2 pr-4"><GlassIcon name="mesh" size={40}/><span className="flex-1"><span className="block text-[14px] font-extrabold">Resume your scan</span><span className="block font-mono text-[11.5px] text-ink/65">saved in this browser</span></span><ScanLine size={16}/></Link>}
      <nav className="relative mt-3 flex-1 space-y-4 overflow-y-auto px-4 pb-4 no-scrollbar">{DRAWER.map(group => <div key={group.code}>
        <p className="lab px-1 py-1.5">{group.code} · {group.title}</p>
        <div className="mt-1 space-y-1">{group.items.map(item => <NavLink key={item.to} to={item.to} onClick={onClose} tabIndex={open ? 0 : -1} className={({ isActive }) => cn('group flex min-h-14 items-center gap-3 rounded-2xl px-2 transition-colors', isActive ? 'raised' : 'hover:bg-white/70')}>
          <GlassIcon name={item.icon} size={38} className="transition-transform group-hover:scale-110"/>
          <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-extrabold tracking-[-0.01em]">{item.label}</span><span className="block font-mono text-[11.5px] text-ink/60">{item.note}</span></span>
        </NavLink>)}</div>
      </div>)}</nav>
      <div className="relative border-t border-ink/[0.08] p-4">
        {session.configured && (session.authenticated ? <div className="flex items-center gap-3"><span className="size-2 rounded-full bg-up"/><span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">{session.wallet ? shortAddress(session.wallet, 6, 4) : 'Signed in'}</span><button onClick={() => { session.logout(); onClose(); }} className="press btn-ghost min-h-10 px-3 text-xs" tabIndex={open ? 0 : -1}><LogOut size={14}/>Sign out</button></div>
          : <button onClick={() => { session.login(); onClose(); }} className="btn press min-h-11 w-full text-[13px]" tabIndex={open ? 0 : -1}>Sign in / Sign up · X, email or wallet</button>)}
        <button onClick={toggleSound} className="mt-3 flex min-h-9 items-center gap-2 font-mono text-[11px] font-semibold text-ink/65" aria-pressed={sound} tabIndex={open ? 0 : -1}>{sound ? <Volume2 size={14}/> : <VolumeX size={14}/>}Sound {sound ? 'on' : 'off'}</button>
      </div>
    </aside>
  </div>;
}

/** Four-bar menu glyph that reads as a console toggle. */
function MenuGlyph() { return <span className="flex w-[18px] flex-col gap-[3.5px]" aria-hidden="true"><span className="h-[2.5px] w-full rounded-full bg-ink"/><span className="h-[2.5px] w-2/3 rounded-full bg-ink"/><span className="h-[2.5px] w-full rounded-full bg-ink"/></span>; }

/** Phone tab bar: solid glass, fixed to the bottom, with the scan action raised in the centre. */
function BottomBar({ onMore }: { onMore: () => void }) {
  const { pathname, search } = useLocation();
  const items = [
    { to: '/', label: 'Home', icon: Home, on: pathname === '/' },
    { to: '/explore', label: 'Coins', icon: Compass, on: (pathname === '/explore' && !search.includes('tab=market')) || pathname.startsWith('/coin/') },
    { to: '/launch', label: 'Scan', icon: ScanLine, on: pathname.startsWith('/launch') || pathname.startsWith('/capture'), center: true },
    { to: '/explore?tab=market', label: 'Market', icon: Activity, on: pathname === '/explore' && search.includes('tab=market') },
  ];
  if (pathname.startsWith('/capture/claim') || /^\/launch\/[a-f0-9-]{36}/.test(pathname)) return null;
  return <nav aria-label="Tab bar" className="mobile-tabbar fixed inset-x-0 bottom-0 z-50 lg:hidden">
    <div className="grid grid-cols-5 items-end px-2 pt-1.5">
      {items.map(item => item.center ? <Link key={item.to} to={item.to} className="press -mt-6 flex flex-col items-center gap-0.5" aria-current={item.on ? 'page' : undefined}><span className="tab-scan flex size-[56px] items-center justify-center rounded-[20px]"><ScanLine size={24} strokeWidth={2.4} className="text-white"/></span><span className="text-[11px] font-extrabold">{item.label}</span></Link>
        : <Link key={item.to} to={item.to} className={cn('relative flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors', item.on ? 'text-ink' : 'text-ink/55')} aria-current={item.on ? 'page' : undefined}>{item.on && <span className="absolute top-0 h-[3px] w-6 rounded-full bg-ink"/>}<item.icon size={21} strokeWidth={item.on ? 2.6 : 2}/>{item.label}</Link>)}
      <button onClick={onMore} className="flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-bold text-ink/55"><MenuGlyph/>Menu</button>
    </div>
  </nav>;
}

export default function Layout() {
  const [drawer, setDrawer] = useState<boolean>(false); const location = useLocation(); const { sound, toggleSound } = usePreferences();
  const scanning = location.pathname.startsWith('/capture/claim');
  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => { registerAppWorker(); }, []);
  return <>
    <InstallBanner/>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-6 focus:py-3">Skip to content</a>
    <CryptoBackdrop/>
    {!scanning && <div className="hidden lg:block"><LiveTicker/></div>}
    {!scanning && <header className="phone-bar sticky top-0 z-40 lg:hidden">
      <div className="flex h-[54px] items-center justify-between gap-3 px-4"><Brand/><div className="flex items-center gap-1.5"><XLink className="size-9"/><TreasuryMini/><AccountButton compact/></div></div>
      <div className="border-t border-ink/[0.06]"><LiveTicker/></div>
    </header>}
    {!scanning && <header className="sticky top-0 z-40 hidden lg:block">
      <div className="page pt-3"><div className="glass-nav flex h-[70px] items-center justify-between gap-2 rounded-[24px] px-2">
        <div className="flex shrink-0 items-center gap-2.5">
          <button onClick={() => setDrawer(true)} className="press raised flex size-[52px] items-center justify-center rounded-[17px]" aria-label="Open menu" aria-expanded={drawer}><MenuGlyph/></button>
          <Brand/>
        </div>
        <TabStrip/>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <XLink className="size-[52px]"/>
          <TreasuryChip/>
          <AccountButton/>
          <Link to="/launch" className="btn press flex min-h-[52px] pl-1.5 pr-5 text-[14.5px]"><span className="orb size-10"><GlassIcon name="qr" size={30} className="!filter-none"/></span>Scan & launch</Link>
        </div>
      </div></div>
    </header>}
    <main id="main" key={location.pathname} className="page-enter min-h-[70dvh]"><Outlet/></main>
    {!scanning && <footer className="mt-8 px-4 pb-[calc(104px+env(safe-area-inset-bottom))] lg:hidden">
      <div className="raised rounded-[24px] p-5">
        <div className="flex items-center justify-between gap-3"><Brand/><div className="flex items-center gap-2"><XLink className="size-10"/><button onClick={toggleSound} className="flex min-h-11 items-center gap-2 text-[13px] font-bold text-ink/65" aria-pressed={sound}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}Sound</button></div></div>
        <div className="mt-4 rounded-2xl bg-ink/[0.04] px-3.5 py-3 font-mono text-[12px] uppercase"><ObjectPadCa className="flex-wrap"/><p className="mt-1.5 font-bold text-ink/55">Chain 4663 · Robinhood Chain</p></div>
        <p className="mt-4 text-[12px] font-medium leading-5 text-ink/60">ObjectPad is not affiliated with, endorsed by or officially connected with Robinhood Markets, Inc. A scan record does not prove ownership, authenticity or value. Coins carry no redemption right.</p>
      </div>
    </footer>}
    {!scanning && <footer className="mt-16 hidden pb-8 lg:block"><div className="page">
      <div className="steel relative overflow-hidden rounded-[30px] p-6 sm:p-8">
        <AsciiObject src="/models/points/bull.json" cols={60} rows={22} className="absolute -right-6 -top-4 hidden text-[11.5px] text-ink/[0.08] md:block"/>
        <div className="relative grid gap-8 md:grid-cols-[1.1fr_1.6fr]">
          <div><Brand/><p className="mt-4 max-w-xs text-[15px] font-bold leading-6 text-ink/75">The launchpad for real-world objects, now backed by real markets. Launched free on Robinhood Chain.</p><div className="mt-5 flex flex-wrap items-center gap-2"><Link to="/launch" className="btn press min-h-12 pl-1.5 pr-5 text-sm"><span className="orb size-9"><GlassIcon name="qr" size={26} className="!filter-none"/></span>Scan & launch free</Link><a href={OBJECTPAD_X_URL} target="_blank" rel="noreferrer" className="btn-ghost press min-h-12 px-4 text-sm"><XLogo size={15}/>@ObjectPadFun</a></div></div>
          <div className="grid grid-cols-2 gap-6 text-sm font-bold sm:grid-cols-3">
            <div className="flex flex-col items-start gap-2.5"><span className="lab mb-1">Discover</span><Link to="/explore">Object coins</Link><Link to="/explore?tab=market">Live market</Link><Link to="/burn">$OBJECTPAD burn</Link><Link to="/treasury">Treasury</Link></div>
            <div className="flex flex-col items-start gap-2.5"><span className="lab mb-1">Create</span><Link to="/launch">Scan & launch</Link><Link to="/inventory">Saved scans</Link><Link to="/earnings">Creator earnings</Link><Link to="/craft">Crafting Table</Link></div>
            <div className="flex flex-col items-start gap-2.5"><span className="lab mb-1">Protocol</span><Link to="/v2">V2 release log</Link><Link to="/docs">How it works</Link><Link to="/provenance">Provenance</Link><Link to="/safety">Safety & rights</Link><Link to="/status">System status</Link></div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 font-mono text-[12px] uppercase shadow-[0_0_0_1px_rgba(12,13,16,.08)]"><ObjectPadCa/><span className="ml-auto font-bold text-ink/60">Chain 4663 · Robinhood Chain</span></div>
        <div className="relative mt-6 flex flex-col justify-between gap-4 border-t border-ink/[0.1] pt-5 sm:flex-row sm:items-center"><p className="max-w-3xl text-[11px] font-medium leading-5 text-ink/65">ObjectPad is not affiliated with, endorsed by or officially connected with Robinhood Markets, Inc. A scan record does not prove legal ownership, authenticity or value. Coins carry no redemption right. Lab specimen coins run simulated markets and cannot be traded.</p><button onClick={toggleSound} className="flex min-h-10 shrink-0 items-center gap-2 text-xs font-semibold text-ink/65" aria-pressed={sound}>{sound ? <Volume2 size={15}/> : <VolumeX size={15}/>}Sound {sound ? 'on' : 'off'}</button></div>
      </div>
    </div></footer>}
    {!scanning && <BottomBar onMore={() => setDrawer(true)}/>}
    <Drawer open={drawer} onClose={() => setDrawer(false)}/>
    {!scanning && <BurnToasts/>}
  </>;
}
