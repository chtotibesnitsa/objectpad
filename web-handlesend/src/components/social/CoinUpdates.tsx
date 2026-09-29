import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Lock, Mic, Radio, Send, Square, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useSocial, type SocialUser } from '@/lib/social';
import { timeAgo } from '@/lib/format';
import { UserLink } from './UserChip';
import { cn } from '@/lib/utils';

interface CoinUpdate { id: string; kind: 'text' | 'voice'; text: string; audio: string | null; seconds: number | null; createdAt: number; hidden: boolean; user: SocialUser | null; }

const MAX_SECONDS = 90;

/**
 * Live news from the coin's creator: text updates and voice messages, newest first.
 * Only the creator (or an admin) can post; only admins can hide. The server enforces both.
 */
export function CoinUpdates({ recordId, isCreator }: { recordId: string; isCreator: boolean }) {
  const session = useSession(); const social = useSocial(); const qc = useQueryClient();
  const admin = social.me?.operator === true; const canPost = isCreator || admin;
  const key = ['objectpad', 'coin-updates', recordId, admin];
  const feed = useQuery({ queryKey: key, queryFn: async () => (await api<{ items: CoinUpdate[] }>(`/social/coin/${recordId}/updates`, { token: session.authenticated ? await session.token() : null })).items, refetchInterval: 10_000 });
  const [text, setText] = useState<string>(''); const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const post = useMutation({ mutationFn: async (t: string) => api(`/social/coin/${recordId}/updates`, { token: await session.token(), method: 'POST', body: { text: t } }), onSuccess: () => { setText(''); setError(null); refresh(); }, onError: () => setError('Couldn’t post that update. Check it is 2–600 characters and try again.') });
  const moderate = useMutation({ mutationFn: async (v: { id: string; action: 'hide' | 'restore' }) => api(`/social/ops/update/${v.id}/${v.action}`, { token: await session.token(), method: 'POST', body: {} }), onSuccess: refresh });

  const [recording, setRecording] = useState<boolean>(false); const [secs, setSecs] = useState<number>(0);
  const rec = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const timer = useRef<number>(0); const started = useRef<number>(0);
  const upload = useCallback(async (blob: Blob, seconds: number) => {
    try { await api(`/social/coin/${recordId}/voice`, { token: await session.token(), method: 'PUT', binary: blob, headers: { 'x-seconds': String(seconds), 'content-type': blob.type || 'audio/webm' }, timeout: 60_000 }); setError(null); refresh(); }
    catch { setError('Voice message couldn’t upload. Keep it under 90 seconds and try again.'); }
  }, [recordId, session]); // eslint-disable-line react-hooks/exhaustive-deps
  const startRec = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); chunks.current = []; started.current = Date.now();
      mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); window.clearInterval(timer.current); setRecording(false); const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000)); void upload(new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }), seconds); };
      rec.current = mr; mr.start(); setRecording(true); setSecs(0);
      timer.current = window.setInterval(() => { const s = Math.round((Date.now() - started.current) / 1000); setSecs(s); if (s >= MAX_SECONDS) mr.stop(); }, 500);
    } catch { setError('Microphone access is blocked. Allow it in your browser settings to record.'); }
  };

  const items = feed.data ?? [];
  return <section className="raised rounded-[26px] p-5 sm:p-6" aria-label="Updates from the creator">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Creator updates</h2><span className="flex items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase text-ink/50"><span className="size-1.5 animate-pulse rounded-full bg-[#12A150]"/>Live feed</span></div>

    <div className="sunk relative mt-4 flex items-center gap-3 overflow-hidden rounded-2xl p-4" role="note">
      <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(12,13,16,.035)_10px_20px)]"/>
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink/10 text-ink/50"><Lock size={18}/></span>
      <div className="relative min-w-0"><p className="flex items-center gap-1.5 text-[14px] font-extrabold text-ink/70"><Radio size={14}/>Livestream · coming next</p><p className="text-[12.5px] font-semibold text-ink/50">Creators will be able to go live from their coin page. Not available yet.</p></div>
    </div>

    {canPost && <div className="mt-4">
      <div className="sunk flex items-end gap-1 rounded-[18px] p-1.5">
        <textarea value={text} onChange={e => setText(e.target.value.slice(0, 600))} rows={2} placeholder="Post an update to holders…" className="min-h-11 flex-1 resize-none bg-transparent px-3 py-2 text-[14px] font-medium outline-none placeholder:text-ink/35" aria-label="Update text"/>
        <button type="button" onClick={() => recording ? rec.current?.stop() : void startRec()} className={cn('press flex size-11 shrink-0 items-center justify-center rounded-xl', recording ? 'bg-[#E5484D] text-white' : 'text-ink/60 hover:bg-white')} aria-label={recording ? 'Stop and send voice message' : 'Record voice message'}>{recording ? <Square size={16}/> : <Mic size={18}/>}</button>
        <button type="button" disabled={text.trim().length < 2 || post.isPending} onClick={() => post.mutate(text)} className="press flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white disabled:opacity-30" aria-label="Post update"><Send size={16}/></button>
      </div>
      {recording && <p className="mt-2 font-mono text-[12px] font-extrabold text-[#E5484D]">Recording {secs}s / {MAX_SECONDS}s · tap the square to send</p>}
    </div>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-[#E5484D]/10 px-3 py-2 text-[13px] font-bold text-[#C52F35]">{error}</p>}

    <ul className="mt-4 grid gap-2.5">
      {feed.isPending && <li className="h-16 animate-pulse rounded-2xl bg-ink/[0.05]"/>}
      {!feed.isPending && !items.length && <li className="rounded-2xl bg-ink/[0.03] p-4 text-[13.5px] font-semibold text-ink/55">{canPost ? 'Nothing posted yet. Your first update or voice message will show here.' : 'The creator hasn’t posted yet.'}</li>}
      {items.map(u => <li key={u.id} className={cn('rounded-2xl bg-white/70 p-4 shadow-[0_0_0_1px_rgba(12,13,16,.06)]', u.hidden && 'opacity-60 shadow-[0_0_0_1.5px_rgba(229,72,77,.5)]')}>
        <div className="flex items-center gap-2 text-[12.5px]"><UserLink user={u.user} className="text-[13px]"/><span className="font-mono font-bold text-ink/40">{timeAgo(u.createdAt)}</span>{u.kind === 'voice' && <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase text-white">Voice {u.seconds}s</span>}{u.hidden && <span className="font-mono text-[10px] font-extrabold uppercase text-[#C52F35]">Hidden</span>}
          {admin && <button type="button" onClick={() => moderate.mutate({ id: u.id, action: u.hidden ? 'restore' : 'hide' })} className="press ml-auto flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[11px] font-extrabold text-[#C52F35] hover:bg-[#E5484D]/10">{u.hidden ? <><Undo2 size={12}/>Restore</> : <><EyeOff size={12}/>Delete</>}</button>}</div>
        {u.audio && <audio controls preload="none" src={u.audio} className="mt-2 h-10 w-full"/>}
        {u.text && <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] font-medium leading-6 text-ink/80">{u.text}</p>}
      </li>)}
    </ul>
  </section>;
}
