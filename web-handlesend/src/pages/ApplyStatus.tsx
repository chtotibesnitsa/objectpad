import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CircleAlert, LoaderCircle, Mail } from 'lucide-react';
import { APPLY_KEY, applyError, fetchStatus, requestStatusLink, withdraw } from '@/lib/apply';
import { usePageMeta } from './Apply';

const input = 'w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-[15px] font-semibold outline-none transition focus:border-ink placeholder:text-ink/30';

/** Reads the status token from the URL fragment (never sent to servers or analytics) and strips it from the address bar. */
function useFragmentToken(): string | null {
  const [token] = useState<string | null>(() => { const m = window.location.hash.match(/t=([a-f0-9]{64})/); if (m) { try { sessionStorage.setItem('op-apply-status', m[1]); } catch { /* ignore */ } history.replaceState(null, '', window.location.pathname); return m[1]; } try { return sessionStorage.getItem('op-apply-status'); } catch { return null; } });
  return token;
}

/** /apply/status — applicant-safe status via a signed, expiring, single-purpose link. */
export default function ApplyStatus() {
  usePageMeta('Application status — ObjectPad', 'Check or withdraw your ObjectPad application.', '/apply/status', false);
  const token = useFragmentToken(); const qc = useQueryClient(); const heading = useRef<HTMLHeadingElement>(null);
  const q = useQuery({ queryKey: [...APPLY_KEY, 'status', token], enabled: Boolean(token), retry: false, queryFn: () => fetchStatus(token!) });
  const [confirm, setConfirm] = useState<boolean>(false);
  const w = useMutation({ mutationFn: () => withdraw(token!), onSuccess: data => { qc.setQueryData([...APPLY_KEY, 'status', token], data); setConfirm(false); heading.current?.focus(); } });
  useEffect(() => { if (q.data) heading.current?.focus(); }, [q.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="page max-w-3xl py-10 sm:py-14">
    <p className="lab">Application status</p>
    {!token ? <><h1 className="display mt-3 text-[clamp(36px,6vw,58px)] leading-[0.92]">Check your application.</h1><p className="mt-4 text-[15px] font-semibold text-ink/60">Open the private link from your receipt email, or request a fresh one below.</p><LinkRequest /></>
      : q.isPending ? <div className="mt-10 flex items-center gap-3 text-ink/60" role="status"><LoaderCircle className="animate-spin" size={20} />Checking…</div>
      : q.isError ? <><h1 className="display mt-3 text-[clamp(34px,6vw,54px)] leading-[0.92]">This link doesn’t work.</h1><p role="alert" className="mt-4 flex items-start gap-2 text-[15px] font-semibold text-ink/65"><CircleAlert size={18} className="mt-0.5 shrink-0 text-down" />{applyError(q.error)}</p><LinkRequest /></>
      : <>
        <h1 ref={heading} tabIndex={-1} className="display mt-3 text-[clamp(38px,6.5vw,64px)] leading-[0.92] outline-none">{q.data.status}</h1>
        <p className="mt-3 text-[16px] font-semibold leading-relaxed text-ink/65" aria-live="polite">{q.data.body}</p>
        <dl className="mt-7 grid gap-2 sm:grid-cols-3">
          <div className="raised rounded-2xl p-4"><dt className="stat-label">Reference</dt><dd className="mt-1 font-mono text-[16px] font-extrabold">{q.data.reference}</dd></div>
          <div className="raised rounded-2xl p-4"><dt className="stat-label">Role</dt><dd className="mt-1 text-[14.5px] font-extrabold"><Link to={`/apply/${q.data.roleSlug}`} className="underline-offset-2 hover:underline">{q.data.role}</Link></dd></div>
          <div className="raised rounded-2xl p-4"><dt className="stat-label">Submitted</dt><dd className="mt-1 text-[14.5px] font-extrabold">{q.data.submittedAt ? new Date(q.data.submittedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}</dd></div>
        </dl>
        <h2 className="mt-9 text-[17px] font-extrabold">Timeline</h2>
        <ol className="mt-3 space-y-2">{q.data.timeline.map((t, i) => <li key={`${t.label}-${t.at}`} className="flex items-center gap-3"><span className={`flex size-8 items-center justify-center rounded-full ${i === q.data.timeline.length - 1 ? 'bg-ink text-white' : 'sunk'}`}><Check size={14} /></span><span className="text-[14.5px] font-extrabold">{t.label}</span><span className="ml-auto font-mono text-[12px] font-bold text-ink/45">{new Date(t.at).toLocaleString()}</span></li>)}</ol>
        {q.data.canWithdraw && <div className="mt-10 rounded-2xl border border-ink/10 p-5">
          <h2 className="text-[16px] font-extrabold">Withdraw application</h2><p className="mt-1 text-[14px] font-semibold text-ink/60">Stops the review. Files are deleted within 30 days. This can’t be undone.</p>
          {!confirm ? <button onClick={() => setConfirm(true)} className="btn-ghost press mt-4 min-h-12 px-5 text-[14.5px]">Withdraw…</button>
            : <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Confirm withdrawal"><button onClick={() => w.mutate()} disabled={w.isPending} className="press inline-flex min-h-12 items-center gap-2 rounded-full bg-down px-5 text-[14.5px] font-extrabold text-white disabled:opacity-60">{w.isPending && <LoaderCircle size={16} className="animate-spin" />}Yes, withdraw</button><button onClick={() => setConfirm(false)} className="btn-ghost press min-h-12 px-5 text-[14.5px]">Keep my application</button></div>}
          {w.isError && <p role="alert" className="mt-3 text-[13.5px] font-bold text-down">{applyError(w.error)}</p>}
        </div>}
        <p className="mt-8 text-[13px] font-semibold text-ink/50">This page is private to whoever holds your link. {q.data.privacyContact ? <>Delete-my-data requests: <a href={`mailto:${q.data.privacyContact}`} className="font-extrabold underline">{q.data.privacyContact}</a>.</> : null} <Link to="/apply" className="font-extrabold underline">Other open roles</Link></p>
      </>}
  </div>;
}

function LinkRequest() {
  const [email, setEmail] = useState<string>(''); const [ref, setRef] = useState<string>('');
  const m = useMutation({ mutationFn: () => requestStatusLink(email.trim(), ref.trim()) });
  return <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="raised mt-8 rounded-[26px] p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-[17px] font-extrabold"><Mail size={17} />Email me a fresh status link</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[13.5px] font-extrabold">Email<input className={`${input} mt-1.5`} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="text-[13.5px] font-extrabold">Reference<input className={`${input} mt-1.5 font-mono uppercase`} placeholder="OP-XXXX-XXXX" required value={ref} onChange={e => setRef(e.target.value)} /></label>
    </div>
    <button disabled={m.isPending} className="btn press mt-4 inline-flex min-h-12 items-center gap-2 px-6 text-[14.5px] disabled:opacity-60">{m.isPending && <LoaderCircle size={16} className="animate-spin" />}Send link<ArrowRight size={15} /></button>
    {m.isSuccess && <p role="status" className="mt-3 text-[14px] font-bold text-up">If that email and reference match an application, a new link is on its way. Older links stop working.</p>}
    {m.isError && <p role="alert" className="mt-3 text-[14px] font-bold text-down">{applyError(m.error)}</p>}
  </form>;
}
