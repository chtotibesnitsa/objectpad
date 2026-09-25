import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { openScan, resumeDeviceScan } from '@/lib/handoff';
import { isPhone, useCreator } from '@/lib/creator';
import { useTreasury } from '@/lib/treasury';
import { MEMES, type MemeExhibit } from '@/lib/memes';
import { PointCloud } from '@/components/PointCloud';
import { GlassIcon } from '@/components/GlassIcon';

const MorphViewer = lazy(() => import('@/components/MorphViewer'));
const SHOWCASE = ['pepe', 'duck', 'bull', 'fine', 'sneaker', 'wojak', 'console', 'mug'].map(id => MEMES.find(m => m.id === id)!).filter(Boolean);

/**
 * Scan & launch entry. No account and no choices: this browser's private scan opens at once. Phones go straight to the
 * camera; desktops go to the live studio with a QR code for the phone. Sign-in is only offered after the coin is live.
 */
export default function LaunchStart() {
  const creator = useCreator(); const navigate = useNavigate(); const treasury = useTreasury(); const phone = useMemo(() => isPhone(), []);
  const [error, setError] = useState<string | null>(null); const started = useRef<boolean>(false); const [shown, setShown] = useState<MemeExhibit>(SHOWCASE[0]); const onExhibit = useCallback((e: MemeExhibit) => setShown(e), []);
  const start = useCallback(async () => {
    setError(null);
    try {
      // A phone linked to a computer's scan carries on with that scan instead of starting an unlinked one.
      if (phone) { const linked = await resumeDeviceScan(); if (linked) { navigate(`/capture/claim#session=${linked}`, { replace: true }); return; } }
      const scan = await openScan(creator.token);
      if (phone && scan.url) { navigate(`/capture/claim${new URL(scan.url).hash}`, { replace: true }); return; }
      navigate(`/launch/${scan.session.id}`, { replace: true });
    } catch (e) { started.current = false; setError(e instanceof Error ? e.message : 'The scanner could not open. Retry in a moment.'); }
  }, [creator, phone, navigate]);
  useEffect(() => { if (started.current) return; started.current = true; void start(); }, [start]);
  return <div className="page py-6 sm:py-10">
    <div className="grid items-center gap-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
      <div className="raised relative overflow-hidden rounded-[36px] p-6 sm:p-10">
        <div className="grid-paper pointer-events-none absolute inset-0 opacity-60" aria-hidden="true"/>
        <div className="relative">
          <GlassIcon name="qr" size={96} float/>
          <p className="lab mt-6">Scan & launch · no account</p>
          <h1 className="display mt-3 text-[46px] leading-[0.94] sm:text-[62px]">{error ? 'One more try.' : phone ? 'Opening your camera…' : 'Making your private code…'}</h1>
          <p className="mt-4 text-[18px] font-extrabold text-ink/65">{phone ? 'Walk around your object. The phone shoots six angles by itself.' : 'Scan it with your phone. Everything updates here live.'}</p>
          {error ? <div className="mt-6"><p className="sunk rounded-2xl p-4 text-sm font-semibold text-down">{error}</p><button onClick={() => { started.current = true; void start(); }} className="btn press mt-4 min-h-14 px-6 text-[15px]"><RefreshCw size={16}/>Try again</button></div>
            : <div className="sunk mt-6 flex items-center gap-3 rounded-2xl px-4 py-3.5 font-mono text-[12px] font-bold text-ink/60"><LoaderCircle size={16} className="animate-spin"/>Opening scan · single-use link · private to this browser</div>}
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px] font-bold uppercase text-ink/65"><span className="chip">$0 to you</span><span className="chip">Treasury {treasury.label}</span><span className="chip">{treasury.open ? `${treasury.launchesLeft} free today` : 'Launches queue free'}</span></div>
          <p className="mt-6 text-[11px] font-medium leading-5 text-ink/60">By scanning you confirm you may photograph this object. <Link to="/safety" className="underline underline-offset-2">Rules</Link></p>
        </div>
      </div>
      <div className="steel relative h-[420px] overflow-hidden rounded-[36px] sm:h-[560px]">
        <div className="raised crop absolute inset-3 overflow-hidden rounded-[28px]"><i/><i/><i/><i/>
          <div className="scan-stage absolute inset-0" aria-hidden="true"/><div className="scan-grid absolute inset-0" aria-hidden="true"/>
          <Suspense fallback={<PointCloud src={SHOWCASE[0].points} mode="solid" size={2.4} className="absolute inset-0"/>}><MorphViewer exhibits={SHOWCASE} onExhibit={onExhibit} fallback={<PointCloud src={shown.points} mode="solid" size={2.4} className="absolute inset-0"/>}/></Suspense>
          <div className="pointer-events-none absolute left-6 top-6"><p className="lab">Scan → 3D → coin</p><p key={shown.id} className="slide-in display mt-2 text-[30px]">{shown.name}</p><p className="font-mono text-[11px] font-bold text-ink/65">{shown.triangles.toLocaleString()} tris · {shown.vertices.toLocaleString()} verts</p></div>
        </div>
      </div>
    </div>
  </div>;
}
