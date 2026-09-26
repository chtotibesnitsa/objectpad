import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRightLeft, BadgeCheck, ChartLine, ChevronDown, FileSearch, Lock, Pencil, RefreshCw, Rocket, ScanLine, Share, Wallet } from 'lucide-react';
import type { WebGLRenderer } from 'three';
import { API_BASE, describeError, RequestError } from '@/lib/api';
import { useSessionCaller } from '@/lib/creator';
import { usePrivateArtifacts } from '@/components/PrivateModel';
import { snapshotModel, squareIcon } from '@/lib/snapshot';
import type { CaptureSession, LaunchDraft } from '@/shared/domain';
import { isEthPair } from '@/shared/pairs';
import { cn } from '@/lib/utils';
import { useApp } from '../store';
import { Feedback } from '../feedback';
import { PushScreen } from '../chrome';
import { PairPickerCard } from '../pairs';
import { CloudDrift, ConfettiBurst, Display, EmptyState, Enter, ErrorBanner, img, Lab, PadButton, PadField, PulseDot, RemoteImage, Rolling, Spinner, VoxelField } from '../ui';

const ModelView = lazy(() => import('../ModelView'));
const isCapturing = (s: CaptureSession) => ['awaiting_mobile', 'capturing'].includes(s.state) || (s.state === 'review' && s.views.length < 6);
const isBuilding = (s: CaptureSession) => ['screening', 'reconstructing', 'validating'].includes(s.state) || (s.state === 'review' && s.views.length >= 6 && !s.failureCode);
const isModelReady = (s: CaptureSession) => ['model_review', 'approved'].includes(s.state) && Boolean(s.model);
const isTerminal = (s: CaptureSession) => ['blocked', 'cancelled', 'expired'].includes(s.state);
const isLaunched = (s: CaptureSession) => s.launch?.recordState === 'confirmed';
const txUrl = (h: string) => `https://robinhoodchain.blockscout.com/tx/${h}`;

/** Animated build orb: a rotating ring that fills with real job progress. */
function BuildingOrb({ progress, label }: { progress: number; label: string }) {
  const r = 85; const C = 2 * Math.PI * r; const p = Math.max(0.04, Math.min(1, progress));
  return <div className="relative flex size-full items-center justify-center"><VoxelField count={20} seed={11}/>
    <svg viewBox="0 0 220 220" className="absolute size-[220px]"><circle cx="110" cy="110" r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="10"/><circle cx="110" cy="110" r={r} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 110 110)" style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.34,1.2,.64,1)' }}/><g className="ap-spin-orb" style={{ transformOrigin: '110px 110px' }}><circle cx="110" cy="110" r="98" fill="none" stroke="#6FB2FF" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 98 * 0.18} 999`}/></g></svg>
    <div className="relative flex flex-col items-center gap-1"><Rolling text={`${Math.floor(progress * 100)}%`} className="ap-display text-white" style={{ fontSize: 40 }}/><span className="ap-mono text-[10.5px] font-extrabold text-white/85">{label}</span></div>
  </div>;
}

export default function StudioView() {
  const { id = '' } = useParams(); const app = useApp();
  const [sessionId, setSessionId] = useState<string>(id); const { call } = useSessionCaller(sessionId);
  const [session, setSession] = useState<CaptureSession | null>(null); const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState<string>(''); const [symbol, setSymbol] = useState<string>(''); const [story, setStory] = useState<string>(''); const [xUrl, setXUrl] = useState<string>(''); const [feeWallet, setFeeWallet] = useState<string>(''); const [pairToken, setPairToken] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null); const [actionError, setActionError] = useState<string | null>(null); const [advanced, setAdvanced] = useState<boolean>(false); const [modelUrl, setModelUrl] = useState<string | null>(null);
  const dirty = useRef<boolean>(false); const announced = useRef<string>(''); const autoRebuilds = useRef<number>(0); const busyRef = useRef<string | null>(null); const snapKey = useRef<string>(''); const iconInput = useRef<HTMLInputElement>(null);
  const artifacts = usePrivateArtifacts(session ?? ({ id: sessionId } as CaptureSession));
  useEffect(() => { if (!artifacts.data) return; const u = URL.createObjectURL(artifacts.data.model); setModelUrl(u); return () => URL.revokeObjectURL(u); }, [artifacts.data]);
  const edit = (f: (v: string) => void) => (v: string) => { dirty.current = true; f(v); };

  const run = useCallback((label: string, block: () => Promise<void>) => {
    if (busyRef.current) return; busyRef.current = label; setBusy(label); setActionError(null);
    void block().catch(e => { setActionError(e instanceof Error ? e.message : 'Something went wrong.'); Feedback.error(); }).finally(() => { busyRef.current = null; setBusy(null); });
  }, []);
  const apply = useCallback((s: CaptureSession) => {
    if (s.successor) { setSessionId(s.successor); return; }
    setSession(s);
    if (!dirty.current) { setName(s.launchDraft?.publicName ?? s.suggestion?.name ?? ''); setSymbol(s.launchDraft?.symbol ?? s.suggestion?.ticker ?? ''); setStory(s.launchDraft?.story ?? s.suggestion?.story ?? ''); setXUrl(s.launchDraft?.xUrl ?? ''); setFeeWallet(s.launchDraft?.feeWallet ?? app.activeWallet ?? ''); setPairToken(s.launchDraft?.pairToken ?? ''); }
    if (announced.current !== s.state) { if (s.state === 'model_review') Feedback.success('model'); if (['blocked', 'failed'].includes(s.state)) Feedback.play('rejected'); announced.current = s.state; }
    if (isLaunched(s) && announced.current !== 'confirmed') { announced.current = 'confirmed'; Feedback.success('launch'); app.setLastScan(null); }
  }, [app]);
  // Polling loop with the iOS cadence; auto-starts the build after six photos and rebuilds provider failures up to 3 times.
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let s: CaptureSession | null = null;
      try { s = await call<CaptureSession>(`/sessions/${sessionId}`); apply(s); }
      catch (e) { if (!cancelled) setLoadError(e instanceof RequestError && e.status === 404 ? 'This scan belongs to another device or account. Open it where you started, or sign in with the account that owns it.' : e instanceof Error ? e.message : 'Scan unavailable.'); }
      if (cancelled) return;
      if (s && !s.successor) {
        if (s.state === 'review' && s.views.length >= 6 && !busyRef.current && (!s.failureCode || (s.failureCode === 'MEDIA_VALIDATION_UNAVAILABLE' && autoRebuilds.current === 0))) { if (s.failureCode) autoRebuilds.current++; run('Checking your photos…', async () => apply(await call<CaptureSession>(`/sessions/${sessionId}/reconstruct`, { method: 'POST', body: {}, timeout: 150_000 }))); }
        if (s.state === 'failed' && !busyRef.current && autoRebuilds.current < 3) { autoRebuilds.current++; run('Rebuilding…', async () => { await new Promise(r => setTimeout(r, 1500)); apply(await call<CaptureSession>(`/sessions/${sessionId}/regenerate`, { method: 'POST', body: {}, timeout: 90_000 })); }); }
        if (app.signedIn && s.guest && !s.launch) void app.adopt(s.id);
        if (isLaunched(s) || isTerminal(s)) return;
      }
      const wait = s && ['screening', 'reconstructing', 'validating'].includes(s.state) ? 2000 : s?.launch ? 2500 : 3500;
      timer = setTimeout(() => void tick(), wait);
    };
    void tick(); return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Front snapshot of the finished model becomes the coin icon (once per model), like the website. */
  const snapshot = useCallback(async () => {
    const s = session; const m = s?.model; const data = artifacts.data; if (!s || !m || !data || !isModelReady(s) || s.launch?.hash) return;
    if (s.icon && !(s.icon.source === 'snapshot' && s.icon.modelHash !== m.optimizedHash)) return;
    const key = m.optimizedHash + (s.icon?.hash ?? ''); if (snapKey.current === key) return; snapKey.current = key;
    try { const png = await snapshotModel(data.model); apply(await call<CaptureSession>(`/sessions/${s.id}/icon`, { method: 'PUT', binary: png, timeout: 40_000, headers: { 'X-Icon-Source': 'snapshot', 'X-Icon-Model': m.optimizedHash } })); } catch { /* the creator can add their own */ }
  }, [session, artifacts.data, call, apply]);
  useEffect(() => { void snapshot(); }, [artifacts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const onLoaded = useCallback((_gl: WebGLRenderer) => { void snapshot(); }, [snapshot]);
  const customIcon = async (file: File) => { try { apply(await call<CaptureSession>(`/sessions/${sessionId}/icon`, { method: 'PUT', binary: await squareIcon(file), timeout: 40_000, headers: { 'X-Icon-Source': 'custom' } })); Feedback.success(); } catch (e) { setActionError(e instanceof Error ? e.message : 'The image couldn’t be used.'); } };

  const validation = (() => {
    const n = name.trim(), st = story.trim();
    if (n.length < 2 || n.length > 32) return 'Name: 2–32 characters.'; if (symbol.length < 2) return 'Ticker: 2–10 letters or digits.'; if (st.length < 10 || st.length > 280) return 'Story: 10–280 characters.';
    if (xUrl && !/^https:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(xUrl)) return 'Use https://x.com/handle or leave it empty.'; if (feeWallet && !/^0x[a-fA-F0-9]{40}$/.test(feeWallet.trim())) return 'Paste a full 0x… wallet or leave it empty.'; return null;
  })();
  const launch = () => run('Launching…', async () => {
    const fee = feeWallet.trim() || app.activeWallet || app.ensureLocalWallet();
    const draft: LaunchDraft = { publicName: name.trim(), symbol, story: story.trim(), xUrl: xUrl.trim(), feeWallet: fee, ...(isEthPair(pairToken) ? {} : { pairToken }) };
    const r = await call<{ state: string; hash?: string; session: CaptureSession }>(`/sessions/${sessionId}/launch`, { method: 'POST', body: draft, timeout: 90_000 });
    if (r.hash || r.state !== 'queued') Feedback.success('seal'); dirty.current = false; apply(r.session);
  });
  const rescan = () => run('Rescanning…', async () => { const n = await call<{ session: CaptureSession }>(`/sessions/${sessionId}/rescan`, { method: 'POST', body: {} }); app.setLastScan(n.session.id); app.startScan(n.session.id); });
  const startOver = () => run('Resetting…', async () => { await call(`/sessions/${sessionId}/cancel`, { method: 'POST', body: {} }).catch(() => undefined); Feedback.play('retry'); app.back(); app.startScan(); });

  const s = session;
  const stageTitle = !s ? '' : isLaunched(s) ? 'Live on Robinhood Chain' : s.launch ? 'Launching…' : isModelReady(s) ? '3D model ready' : isCapturing(s) ? `${s.views.length}/6 angles` : ({ screening: 'AI safety check', reconstructing: 'Rebuilding in 3D', validating: 'Validating model', failed: 'Rebuilding' } as Record<string, string>)[s.state] ?? s.state.replace(/_/g, ' ');
  const stageLabel = !s ? '' : (s.job?.queue ?? 0) > 0 ? `${s.job!.queue} ahead in the queue` : s.state === 'screening' ? 'Checking every photo' : s.state === 'reconstructing' ? 'Building your object' : 'Preparing';
  const iconSrc = s?.icon ? `${API_BASE}/artifacts/${s.icon.hash}` : s?.model?.thumbnailUrl;
  const coin = s?.launch?.token ? app.coin(s.launch.token) : undefined;
  const share = async () => { const url = s?.coinUrl ?? 'https://www.objectpad.fun'; const text = `I just turned a real object into a coin on @ObjectPadFun: $${symbol}`; try { if (navigator.share) await navigator.share({ url, text }); else { await navigator.clipboard.writeText(`${text} ${url}`); app.show('Link copied'); } } catch { /* cancelled */ } };

  return <PushScreen title="Studio"><div className="flex flex-col gap-4 px-4 pb-28">
    {s ? <>
      <Enter><div className="ap-sky relative h-[330px] overflow-hidden rounded-[32px] shadow-[0_12px_20px_rgba(47,123,242,.3)]">
        <CloudDrift style={{ opacity: 0.7 }}/>
        {(isModelReady(s) || isLaunched(s)) && modelUrl ? <Suspense fallback={<div className="flex size-full items-center justify-center"><Spinner className="text-white"/></div>}><ModelView src={modelUrl} onLoaded={onLoaded}/></Suspense>
          : s.model?.thumbnailUrl ? <div className="flex size-full items-center justify-center"><div className="ap-bob size-[200px]"><RemoteImage src={s.model.thumbnailUrl} fit="contain"/></div></div>
          : <BuildingOrb progress={s.job?.progress ?? (isCapturing(s) ? s.views.length / 6 : 0.1)} label={stageLabel}/>}
        <span className="ap-glass-dark absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-full px-[11px] py-[7px] text-white">{!isLaunched(s) && !isModelReady(s) && <PulseDot color="#fff" size={6}/>}<span className="ap-mono text-[10.5px] font-extrabold uppercase">{stageTitle}</span></span>
      </div></Enter>

      {isLaunched(s) ? <Enter delay={0.05}><div className="ap-raised flex flex-col items-center gap-3.5 rounded-[28px] p-5 text-center">
        <div className="relative"><img src={img('rocket_launch_voxel')} alt="" className="ap-bob h-[150px] object-contain"/><ConfettiBurst/></div>
        <Display size={34}>${symbol} is live.</Display><p className="text-[14.5px] font-semibold text-[#6A6E78]">You earn 0.5% of every trade, forever. Claim anytime from Wallet.</p>
        {(coin || s.objectId) && <PadButton title="Open coin" icon={ChartLine} onClick={() => app.push(`/app/coin/${coin?.id ?? s.objectId}`)}/>}
        <div className="flex w-full gap-2.5">{s.launch?.hash && <a href={txUrl(s.launch.hash)} target="_blank" rel="noreferrer" className="ap-press ap-sunk flex min-h-[50px] flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-extrabold"><FileSearch size={16}/>Receipt</a>}<button type="button" onClick={share} className="ap-press ap-sunk flex min-h-[50px] flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-extrabold"><Share size={16}/>Share</button></div>
        <PadButton title="Claim my rewards" icon={Wallet} kind="ghost" onClick={() => app.selectTab('wallet')}/>
      </div></Enter>
      : isTerminal(s) || (s.state === 'failed' && autoRebuilds.current >= 3) ? <Enter delay={0.05}><div className="ap-raised flex flex-col gap-3 rounded-[26px] p-[18px]">
        <Display size={26}>{s.state === 'blocked' ? 'This scan can’t launch' : 'The rebuild didn’t work'}</Display><p className="text-[14px] font-semibold text-[#6A6E78]">{describeError(s.failureCode ?? 'PROVIDER_FAILED')}</p>
        {actionError && <ErrorBanner message={actionError}/>}<PadButton title="Rescan the object" icon={ScanLine} busy={busy !== null} onClick={rescan}/><PadButton title="Start a new scan" kind="ghost" onClick={() => app.startScan()}/>
      </div></Enter>
      : isCapturing(s) ? <Enter delay={0.05}><div className="ap-raised flex flex-col gap-3 rounded-[26px] p-[18px]">
        <Display size={28}>{6 - s.views.length} angles to go</Display><p className="text-[14px] font-semibold text-[#6A6E78]">Your accepted photos are saved on ObjectPad. Finish the remaining angles to start the 3D build.</p>
        <PadButton title="Continue scanning" icon={ScanLine} onClick={() => app.startScan(s.id)}/>
      </div></Enter>
      : <Enter delay={0.1}><div className="ap-raised flex flex-col gap-3.5 rounded-[28px] p-[18px]">
        <div className="flex items-center"><div className="flex flex-1 flex-col gap-1"><Lab>{isModelReady(s) ? 'Step 3 · Name it' : 'While it builds · name it'}</Lab><Display size={30}>Your coin</Display></div>
          <button type="button" disabled={Boolean(s.launch?.hash)} onClick={() => iconInput.current?.click()} className="ap-press relative"><span className="block size-16 overflow-hidden rounded-[19px] bg-white shadow-[inset_0_0_0_1px_rgba(12,13,16,.08)]"><RemoteImage src={iconSrc} fallback={symbol}/></span><span className="absolute -bottom-1 -right-1 flex size-[22px] items-center justify-center rounded-full bg-ink text-white ring-2 ring-white">{s.launch?.hash ? <Lock size={10}/> : <Pencil size={10}/>}</span></button>
          <input ref={iconInput} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void customIcon(f); e.target.value = ''; }}/>
        </div>
        {s.suggestion && s.suggestion.compared > 0 && <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#12A150]"><BadgeCheck size={15} fill="#12A150" stroke="#fff"/>Unique · compared with {s.suggestion.compared} objects</p>}
        <PadField label="Name" placeholder="Golden Mug" value={name} onChange={edit(setName)}/>
        <PadField label="Ticker" placeholder="MUG" mono value={symbol} onChange={edit(v => setSymbol(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)))}/>
        <PadField label="Story" placeholder="Where it came from, why it matters…" multiline value={story} onChange={edit(setStory)}/>
        <PairPickerCard selection={pairToken} onChange={v => { dirty.current = true; setPairToken(v); }} suggestion={s.suggestion?.pair} disabled={Boolean(s.launch)}/>
        <button type="button" onClick={() => setAdvanced(a => !a)} className="flex items-center justify-between text-[14px] font-extrabold">Links & rewards wallet<ChevronDown size={16} className={cn('transition-transform', advanced && 'rotate-180')}/></button>
        {advanced && <div className="ap-fade flex flex-col gap-3"><PadField label="X link (optional)" placeholder="https://x.com/yourcoin" mono inputMode="url" value={xUrl} onChange={edit(setXUrl)}/><PadField label="Creator rewards wallet" placeholder="0x… (defaults to this phone’s wallet)" mono value={feeWallet} onChange={edit(setFeeWallet)}/></div>}
        {validation && <p className="text-[12.5px] font-bold text-[#E5484D]">{validation}</p>}
        {actionError && <ErrorBanner message={actionError}/>}
        {s.launch && !isLaunched(s) ? <>
          <div className="ap-sunk flex items-center gap-2.5 rounded-[18px] p-3.5"><Spinner size={18}/><p className="text-[13.5px] font-bold">{s.launch.state === 'queued' ? 'Queued. It launches automatically as soon as the treasury has room.' : 'Sending to Robinhood Chain…'}</p></div>
          {!s.launch.hash && s.launch.state !== 'queued' && <PadButton title="Send launch again" icon={RefreshCw} kind="ghost" onClick={() => run('Launching…', async () => apply((await call<{ session: CaptureSession }>(`/sessions/${sessionId}/launch`, { method: 'POST', body: {}, timeout: 90_000 })).session))}/>}
        </> : <>
          <PadButton title={busy ?? (isModelReady(s) ? `Launch free · $${symbol || 'COIN'}` : 'Launch when the model is ready')} icon={Rocket} kind="sky" busy={busy !== null} enabled={!validation && (isModelReady(s) || isBuilding(s))} onClick={launch}/>
          <p className="text-center text-[11.5px] font-bold text-[#6A6E78]">{app.treasuryOpen ? `The ObjectPad treasury pays the gas · ${app.launchesLeft} free launches left today` : 'Free launches are queued · it launches automatically'}</p>
        </>}
        <div className="flex justify-between text-[13px] font-bold text-[#6A6E78]"><button type="button" onClick={rescan} className="flex items-center gap-1"><ArrowRightLeft size={13}/>Rescan object</button><button type="button" onClick={startOver} className="text-[#E5484D]">Start over</button></div>
      </div></Enter>}
    </> : loadError ? <EmptyState icon={Lock} title="Scan unavailable" body={loadError}/> : <div className="flex justify-center pt-32"><Spinner size={30}/></div>}
  </div></PushScreen>;
}
