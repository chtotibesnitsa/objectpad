import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import { AuthBoundary } from './lib/session';
import { PreferencesProvider } from './hooks/use-preferences';
import { Loading } from './components/Feedback';
const Explore = lazy(() => import('./pages/Explore'));
const LaunchStart = lazy(() => import('./pages/LaunchStart'));
const Studio = lazy(() => import('./pages/Studio'));
const MobileCapture = lazy(() => import('./pages/MobileCapture'));
const LaunchReview = lazy(() => import('./pages/LaunchReview'));
const ObjectDetail = lazy(() => import('./pages/ObjectDetail'));
const CoinLink = lazy(() => import('./pages/CoinLink'));
const PreviewCoin = lazy(() => import('./pages/PreviewCoin'));
const Treasury = lazy(() => import('./pages/Information').then(module => ({ default: module.Treasury })));
const Community = lazy(() => import('./pages/Community'));
const Craft = lazy(() => import('./pages/Craft'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Burn = lazy(() => import('./pages/Burn'));
const Earnings = lazy(() => import('./pages/Earnings'));
const Operator = lazy(() => import('./pages/Operator'));
const Docs = lazy(() => import('./pages/Information').then(module => ({ default: module.Docs })));
const Safety = lazy(() => import('./pages/Information').then(module => ({ default: module.Safety })));
const Status = lazy(() => import('./pages/Information').then(module => ({ default: module.Status })));
const Provenance = lazy(() => import('./pages/Information').then(module => ({ default: module.Provenance })));
const Activity = lazy(() => import('./pages/Information').then(module => ({ default: module.Activity })));
const Settings = lazy(() => import('./pages/Account').then(module => ({ default: module.Settings })));
const Portfolio = lazy(() => import('./pages/Account').then(module => ({ default: module.Portfolio })));
const Creator = lazy(() => import('./pages/Account').then(module => ({ default: module.Creator })));
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 }, mutations: { retry: false } } });
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <div role="alert" className="page py-24"><h1 className="display text-4xl">This view could not be opened.</h1><p className="mt-4 text-muted">No operation is assumed to have succeeded. Reload to recover your saved state.</p><button className="mt-6 min-h-11 btn px-6 " onClick={() => location.reload()}>Reload safely</button></div> : this.props.children; } }
function NavigationEffects() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); const titles: Record<string, string> = { '/': 'Tokenize the physical world', '/explore': 'Object coins', '/launch': 'Scan & launch free', '/provenance': 'Provenance', '/status': 'System status', '/safety': 'Safety and rights', '/docs': 'How it works', '/craft': 'Crafting Table', '/inventory': 'Inventory', '/burn': '$OBJECTPAD burn', '/earnings': 'Creator earnings', '/treasury': 'Launch treasury' }; document.title = `ObjectPad · ${titles[pathname] ?? 'The physical-object launchpad'}`; }, [pathname]); return null; }
/** /launch/<session uuid> is the live studio; /launch/<64-hex record id> is the launch status of a sealed record. */
function LaunchRoute() { const { id = '' } = useParams(); return /^[a-f0-9]{64}$/.test(id) ? <LaunchReview/> : <Studio/>; }
function Legacy({ to }: { to: string }) { const { id = '' } = useParams(); return <Navigate to={to.replace(':id', id)} replace/>; }
export default function App() { return <QueryClientProvider client={queryClient}><AuthBoundary><PreferencesProvider><BrowserRouter><Boundary><NavigationEffects/><Suspense fallback={<Loading label="Opening ObjectPad…"/>}><Routes><Route path="capture/claim" element={<MobileCapture/>}/><Route element={<Layout/>}>
  <Route index element={<Home/>}/>
  <Route path="explore" element={<Explore/>}/>
  <Route path="objects/:id" element={<ObjectDetail/>}/>
  <Route path="o/:code" element={<CoinLink/>}/>
  <Route path="coin/:ticker" element={<PreviewCoin/>}/>
  <Route path="treasury" element={<Treasury/>}/>
  <Route path="launch" element={<LaunchStart/>}/>
  <Route path="launch/:id" element={<LaunchRoute/>}/>
  <Route path="capture" element={<Navigate to="/launch" replace/>}/>
  <Route path="capture/handoff/:id" element={<Legacy to="/launch/:id"/>}/>
  <Route path="studio/:id" element={<Legacy to="/launch/:id"/>}/>
  <Route path="studio/:id/:step" element={<Legacy to="/launch/:id"/>}/>
  <Route path="provenance" element={<Provenance/>}/>
  <Route path="creators/:id" element={<Creator/>}/>
  <Route path="portfolio" element={<Portfolio/>}/>
  <Route path="activity" element={<Activity/>}/>
  <Route path="community" element={<Community/>}/>
  <Route path="craft" element={<Craft/>}/>
  <Route path="inventory" element={<Inventory/>}/>
  <Route path="burn" element={<Burn/>}/>
  <Route path="earnings" element={<Earnings/>}/>
  <Route path="docs" element={<Docs/>}/>
  <Route path="safety" element={<Safety/>}/>
  <Route path="status" element={<Status/>}/>
  <Route path="settings" element={<Settings/>}/>
  <Route path="operator" element={<Operator/>}/>
  <Route path="*" element={<div className="page py-24"><h1 className="display text-5xl">Nothing here.</h1><p className="mt-4 text-muted">This page doesn’t exist, or the coin isn’t live yet.</p><Link to="/explore" className="mt-6 inline-flex min-h-11 items-center btn px-6 font-semibold ">Explore coins</Link></div>}/>
</Route></Routes></Suspense></Boundary></BrowserRouter></PreferencesProvider></AuthBoundary></QueryClientProvider>; }
