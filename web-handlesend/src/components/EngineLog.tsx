import { memo, useEffect, useRef, useState } from 'react';
import type { CaptureSession } from '@/shared/domain';
import { VIEWS } from '@/shared/domain';
import { cn } from '@/lib/utils';

/** One plain-language update in the scan feed. Every line comes from a real change in the scan; nothing is invented. */
export interface LogLine { id: number; at: number; kind: 'phone' | 'photo' | 'ai' | 'build' | 'chain' | 'error'; text: string; }

let seq = 0;
const line = (kind: LogLine['kind'], text: string): LogLine => ({ id: ++seq, at: Date.now(), kind, text });
const label = (view: string): string => VIEWS.find(v => v.id === view)?.label.toLowerCase() ?? view;

/** Turns session changes into short, human updates: phone connected, each photo, AI naming, 3D progress, launch. */
export function useEngineLog(session: CaptureSession | undefined) {
  const [lines, setLines] = useState<LogLine[]>([]); const prev = useRef<CaptureSession | null>(null); const lastBucket = useRef<number>(-1);
  useEffect(() => {
    if (!session) return; const p = prev.current; const out: LogLine[] = [];
    if (!p) out.push(line('phone', session.deviceConnected ? 'Your phone is connected to this scan.' : 'Your private scan is ready. Scan the code with your phone.'));
    if (p && !p.deviceConnected && session.deviceConnected) out.push(line('phone', 'Your phone opened your private link. Camera is starting.'));
    const seen = new Set((p?.views ?? []).map(v => `${v.view}:${v.hash}`));
    for (const v of session.views) if (!seen.has(`${v.view}:${v.hash}`)) { const n = session.views.length; out.push(line('photo', `Got the ${label(v.view)} photo. ${n < VIEWS.length ? `${VIEWS.length - n} more to go.` : 'All angles are in!'}`)); }
    if (p && p.state !== 'screening' && session.state === 'screening') out.push(line('ai', 'AI is looking at your photos to name your object.'));
    if (session.suggestion && !p?.suggestion) out.push(line('ai', `AI thinks this is a ${session.suggestion.object}. Suggested name: ${session.suggestion.name} ($${session.suggestion.ticker}).`), line('ai', `Checked against ${session.suggestion.compared.toLocaleString()} objects on ObjectPad. It’s one of one.`));
    if (p && p.state !== 'reconstructing' && session.state === 'reconstructing') out.push(line('build', 'Turning your photos into a 3D model…'));
    const progress = session.job?.progress; if (progress !== undefined) { const bucket = Math.floor(progress / 25); if (bucket > lastBucket.current && bucket > 0 && bucket < 4) out.push(line('build', ['', 'Shape is forming.', 'Adding colours and textures.', 'Final touches on your model.'][bucket])); lastBucket.current = Math.max(lastBucket.current, bucket); }
    if (session.model && !p?.model) out.push(line('build', 'Your 3D model is ready. Spin it around!'));
    if (session.onchain && !p?.onchain) out.push(line('chain', `Your object’s ID card is sealed: ${session.onchain.objectTag}.`));
    if (session.launch && !p?.launch) out.push(line('chain', 'Launching your coin. The treasury is paying.'));
    if (session.launch?.hash && !p?.launch?.hash) out.push(line('chain', 'Launch sent to Robinhood Chain. Waiting for confirmation…'));
    if (session.launch?.recordState === 'confirmed' && p?.launch?.recordState !== 'confirmed') out.push(line('chain', 'Your coin is live! 🎉'));
    if (session.failureCode && p?.failureCode !== session.failureCode) out.push(line('error', 'Something needs a retry. See the options above.'));
    prev.current = session; if (out.length) setLines(list => [...list, ...out].slice(-80));
  }, [session]);
  return { lines };
}

const DOT: Record<LogLine['kind'], string> = { phone: 'bg-white', photo: 'bg-[#79C0FF]', ai: 'bg-[#D2A8FF]', build: 'bg-[#FFD479]', chain: 'bg-up', error: 'bg-down' };

/** Live feed of scan updates, newest at the bottom, mirrored on every device watching this scan. */
export const EngineLog = memo(function EngineLog({ lines, className }: { lines: LogLine[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [lines.length]);
  return <section className={cn('overflow-hidden rounded-[28px] bg-[#0F1115] shadow-[0_0_0_1px_rgba(12,13,16,.4),0_30px_60px_-30px_rgba(12,13,16,.7)]', className)}>
    <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5"><p className="text-[15px] font-extrabold text-white">Live updates</p><span className="ml-auto flex items-center gap-1.5 text-[13px] font-bold text-white/75"><span className="pulse-dot size-2 rounded-full bg-up"/>Same on your phone and here</span></div>
    <div ref={box} className="max-h-[240px] min-h-[160px] overflow-y-auto px-5 py-3 no-scrollbar">
      {lines.map(l => <p key={l.id} className="tape-in flex items-start gap-3 py-1.5 text-[15px] font-bold leading-6 text-white"><span className={cn('mt-2 size-2 shrink-0 rounded-full', DOT[l.kind])}/><span className="flex-1">{l.text}</span><span className="shrink-0 font-mono text-[12px] font-bold text-white/45">{new Date(l.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></p>)}
      <p className="py-1 text-white/70"><span className="blink">▍</span></p>
    </div>
  </section>;
});

const GLYPHS = '01{}[]<>/\\=+*#%@Ξ$';
/** One-shot reveal over a freshly finished model: a wall of code that dissolves from the bottom up. */
export const AsciiReveal = memo(function AsciiReveal({ onDone }: { onDone: () => void }) {
  const [text] = useState<string>(() => Array.from({ length: 40 }, () => Array.from({ length: 120 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('')).join('\n'));
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return <div className="ascii-reveal pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit] bg-[#F4F5F7]" aria-hidden="true"><pre className="ascii-rain p-3 text-[12px] font-bold text-ink/70">{text}</pre></div>;
});
