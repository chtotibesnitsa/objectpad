import { memo, type ReactNode } from 'react';
import { Check, Minus, TriangleAlert } from 'lucide-react';
import { useSession } from '@/lib/session';
import { OperatorNotice } from '@/components/Feedback';
import { allocate, pct, type FeatureState, type FeeSplit } from '@/shared/people';
import { cn } from '@/lib/utils';

const STATE: Record<FeatureState, { label: string; cls: string; dot: string }> = {
  live: { label: 'Live', cls: 'bg-up/10 text-up', dot: 'bg-up' },
  pilot: { label: 'Pilot', cls: 'bg-[#F5C400]/20 text-[#7A5E00]', dot: 'bg-[#E0B000]' },
  planned: { label: 'Planned', cls: 'bg-ink/[0.06] text-ink/55', dot: 'bg-ink/30' },
};
/** Planned / Pilot / Live, straight from the server status registry. */
export const StateChip = memo(function StateChip({ state, className }: { state: FeatureState; className?: string }) {
  const s = STATE[state];
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase tracking-wider', s.cls, className)}><span className={cn('size-1.5 rounded-full', s.dot, state === 'live' && 'pulse-dot')}/>{s.label}</span>;
});

export function Blocker({ children }: { children: ReactNode }) {
  return <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold leading-5 text-ink/55"><TriangleAlert size={13} className="mt-[3px] shrink-0 text-[#B08900]"/>{children}</p>;
}

/** Shows children only to signed-in accounts. Viewing People pages never needs this. */
export function SignInGate({ children, title = 'Sign in to continue', body = 'Drafts, consents and proofs are private to your account.' }: { children: ReactNode; title?: string; body?: string }) {
  const session = useSession();
  if (!session.configured) return <OperatorNotice/>;
  if (!session.ready) return <div className="sunk h-28 animate-pulse rounded-[26px]"/>;
  if (!session.authenticated) return <div className="raised rounded-[28px] p-6 sm:p-8"><h2 className="display text-[28px]">{title}</h2><p className="mt-2 max-w-lg text-[14.5px] font-semibold text-ink/60">{body}</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => session.login(['twitter'])} className="btn press min-h-12 px-6 text-[14px]">Sign in with X</button><button onClick={() => session.login()} className="btn-ghost press min-h-12 px-6 text-[14px]">Other sign-in options</button></div></div>;
  return <>{children}</>;
}

const PARTS: { key: keyof FeeSplit; label: string; color: string }[] = [
  { key: 'subjectBps', label: 'The person', color: '#0C0D10' },
  { key: 'launcherBps', label: 'Collaborator who prepared it', color: '#2F7BF2' },
  { key: 'platformBps', label: 'ObjectPad', color: '#E0B000' },
];
const ONE_ETH = 10n ** 18n;
const ethText = (wei: bigint): string => { const whole = wei / ONE_ETH; const frac = (wei % ONE_ETH).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, ''); return `${whole}${frac ? `.${frac}` : ''} ETH`; };

/** A split of the collected creator-fee pool, with its denominator always stated. */
export const SplitBar = memo(function SplitBar({ split, example = true }: { split: FeeSplit; example?: boolean }) {
  const a = allocate(ONE_ETH, split);
  const amounts: Record<keyof FeeSplit, bigint> = { subjectBps: a.subject, launcherBps: a.launcher, platformBps: a.platform };
  return <div>
    <div className="flex h-3 overflow-hidden rounded-full bg-ink/[0.06]">{PARTS.map(p => split[p.key] > 0 && <span key={p.key} className="bar-grow h-full" style={{ width: `${split[p.key] / 100}%`, background: p.color }}/>)}</div>
    <ul className="mt-3 space-y-1.5">{PARTS.map(p => <li key={p.key} className={cn('flex items-center gap-2 text-[13.5px] font-bold', split[p.key] === 0 && 'text-ink/35')}><span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }}/><span className="display w-14 text-[18px] tnum">{pct(split[p.key])}</span><span className="min-w-0 flex-1 text-ink/65">{p.label}</span>{example && <span className="font-mono text-[11.5px] text-ink/45 tnum">{ethText(amounts[p.key])}</span>}</li>)}</ul>
    <p className="mt-3 font-mono text-[10.5px] font-bold uppercase leading-4 tracking-wider text-ink/45">Of creator fees actually collected{example ? ' · example per 1 ETH collected' : ''}. Not trading volume, not all transaction fees.</p>
  </div>;
});

export function CheckLine({ label, passed, at }: { label: string; passed: boolean; at?: number | null }) {
  return <li className="flex items-center gap-2.5 py-1.5 text-[13.5px] font-bold">
    <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', passed ? 'bg-up text-white' : 'bg-ink/[0.07] text-ink/35')}>{passed ? <Check size={12} strokeWidth={3.5}/> : <Minus size={12} strokeWidth={3}/>}</span>
    <span className={cn('min-w-0 flex-1', !passed && 'text-ink/50')}>{label}</span>
    {passed && at ? <span className="font-mono text-[10.5px] text-ink/40">{new Date(at).toLocaleDateString()}</span> : null}
  </li>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">{label}</span>{children}{hint && <span className="mt-1.5 block text-[12px] font-semibold text-ink/45">{hint}</span>}</label>;
}
export const inputCls = 'w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-[15px] font-semibold outline-none transition focus:border-ink placeholder:text-ink/30';

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return <p role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-2xl px-4 py-3 text-[13.5px] font-bold leading-5', tone === 'error' ? 'bg-down/10 text-down' : tone === 'ok' ? 'bg-up/10 text-up' : 'bg-ink/[0.04] text-ink/65')}>{children}</p>;
}
