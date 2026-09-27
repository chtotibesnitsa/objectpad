import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, X } from 'lucide-react';
import { isStandalone, isMobilePhone, registerAppWorker } from '@/lib/install';
import { AppProvider, useApp } from './store';
import { Cover, Splash, TabBar, Toast } from './chrome';
import { InstallGuide, ShareArrow } from './InstallGuide';
import HomeView from './screens/Home';
import MarketView, { CoinDetailView } from './screens/Market';
import RewardsView, { RewardDetailView } from './screens/Rewards';
import RewardCreateView from './screens/RewardCreate';
import WalletView, { LaunchesView } from './screens/Wallet';
import StudioView from './screens/Studio';
import ScanFlow from './screens/Scan';
import V2Sheet from './screens/V2';
import VaultsView, { VaultDetailView } from './screens/Vaults';
import { AccountSheet, BurnView, EarnView, SignInSheet } from './screens/Account';
import { Feedback } from './feedback';
import './app.css';

/** Slim "Add to Home Screen" chip shown while the app runs in a browser tab. */
function InstallChip() {
  const app = useApp(); const [hidden, setHidden] = useState<boolean>(() => { try { return sessionStorage.getItem('objectpad.app.chip') === 'off'; } catch { return false; } });
  if (hidden || isStandalone() || !isMobilePhone()) return null;
  return <div className="ap-fixed ap-fade fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[55] mx-auto flex max-w-[560px] justify-center px-6">
    <div className="flex items-center gap-1 rounded-full bg-ink py-1 pl-1 pr-1 text-white shadow-[0_10px_20px_rgba(12,13,16,.35)]">
      <button type="button" onClick={() => { Feedback.tap(); app.setInstall(true); }} className="ap-press flex items-center gap-2 rounded-full py-1 pl-1 pr-3"><img src="/app/icon-192.png" alt="" className="size-7 rounded-lg"/><span className="text-[13px] font-extrabold">Add ObjectPad to Home Screen</span></button>
      <button type="button" aria-label="Hide" onClick={() => { setHidden(true); try { sessionStorage.setItem('objectpad.app.chip', 'off'); } catch { /* ignore */ } }} className="flex size-8 items-center justify-center rounded-full bg-white/10"><X size={14}/></button>
    </div>
  </div>;
}

function Screens() {
  const app = useApp(); const location = useLocation(); const [params, setParams] = useSearchParams();
  const [splash, setSplash] = useState<boolean>(() => { try { return sessionStorage.getItem('objectpad.app.splash') !== 'seen'; } catch { return true; } });
  const endSplash = useCallback(() => { setSplash(false); try { sessionStorage.setItem('objectpad.app.splash', 'seen'); } catch { /* ignore */ } }, []);
  useEffect(() => { registerAppWorker(); }, []);
  useEffect(() => {
    if (params.get('install') === '1' && !isStandalone()) { app.setInstall(true); }
    if (params.get('scan') === '1') app.startScan();
    if (params.has('install') || params.has('scan') || params.has('source')) { params.delete('install'); params.delete('scan'); params.delete('source'); setParams(params, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'ObjectPad'; const meta = document.querySelector('meta[name="theme-color"]'); meta?.setAttribute('content', '#ECEEF1'); document.documentElement.setAttribute('data-app', '1'); document.body.style.background = '#ECEEF1'; return () => { document.documentElement.removeAttribute('data-app'); document.body.style.background = ''; }; }, []);
  return <div className="ap-root">
    <Routes location={location}>
      <Route index element={<HomeView/>}/>
      <Route path="market" element={<MarketView/>}/>
      <Route path="coin/:id" element={<CoinDetailView/>}/>
      <Route path="rewards" element={<RewardsView/>}/>
      <Route path="rewards/:id" element={<RewardDetailView/>}/>
      <Route path="wallet" element={<WalletView/>}/>
      <Route path="launches" element={<LaunchesView/>}/>
      <Route path="studio/:id" element={<StudioView/>}/>
      <Route path="burn" element={<BurnView/>}/>
      <Route path="earn" element={<EarnView/>}/>
      <Route path="vaults" element={<VaultsView/>}/>
      <Route path="vaults/:slug" element={<VaultDetailView/>}/>
      <Route path="*" element={<HomeView/>}/>
    </Routes>
    <TabBar/>
    <InstallChip/>
    <Toast/>
    <Cover open={app.scanning} dark>{app.scanning && <ScanFlow resume={app.resumeScan} onClose={() => app.setScanning(false)} onDone={id => { app.setScanning(false); app.push(`/app/studio/${id}`, 'home'); }}/>}</Cover>
    <Cover open={app.creatingReward}>{app.creatingReward && <RewardCreateView onClose={() => app.setCreatingReward(false)} onDone={id => { app.setCreatingReward(false); app.push(`/app/rewards/${id}`, 'rewards'); }}/>}</Cover>
    <SignInSheet/><AccountSheet/><V2Sheet/>
    <InstallGuide open={app.install} onClose={() => app.setInstall(false)}/><ShareArrow show={app.install}/>
    {splash && <Splash onDone={endSplash}/>}
  </div>;
}

/** Desktop: the app runs inside a phone frame, next to a QR code for opening it on a real phone. */
function DesktopFrame({ children }: { children: React.ReactNode }) {
  const [wide, setWide] = useState<boolean>(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => { const q = window.matchMedia('(min-width: 900px)'); const f = () => setWide(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []);
  if (!wide) return <>{children}</>;
  return <div className="ap-desktop">
    <div className="ap-device"><div className="ap-screen">{children}</div></div>
    <div className="max-w-[360px] font-sans text-[#0C0D10]">
      <img src="/app/icon-192.png" alt="" className="size-[84px] rounded-[20px] shadow-[0_14px_30px_rgba(12,13,16,.35)]"/>
      <p className="mt-5 font-mono text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">ObjectPad for iPhone · web app</p>
      <h1 className="mt-2 font-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em]">Put ObjectPad on your phone.</h1>
      <p className="mt-3 text-[15px] font-semibold text-ink/65">Scan this with your iPhone camera, then tap Share › Add to Home Screen. It’s the full iOS app, free, with no App Store and no QR code next time.</p>
      <div className="mt-5 inline-flex rounded-[24px] bg-white p-4 shadow-[0_20px_40px_-20px_rgba(12,13,16,.4)]"><QRCodeSVG value="https://objectpad.fun/app/?install=1" size={176} level="M" marginSize={0} fgColor="#0C0D10" title="Open ObjectPad on your phone"/></div>
      <p className="mt-3 flex items-center gap-2 font-mono text-[12px] font-bold text-ink/60"><Smartphone size={14}/>objectpad.fun/app</p>
    </div>
  </div>;
}

/** The ObjectPad home-screen app: a 1:1 web port of the native iOS app, served at /app. */
export default function AppShell() { return <DesktopFrame><AppProvider><Screens/></AppProvider></DesktopFrame>; }
