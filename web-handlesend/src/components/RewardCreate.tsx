import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, Camera, Check, Clock, Gem, ImagePlus, Infinity as InfinityIcon, Loader2, Megaphone, Minus, Palette, Plus, RefreshCw, ScanLine, Search, Smile, Sparkles, Upload, Wand2, X as XIcon } from 'lucide-react';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { SkyPoster, Voxels } from '@/components/RewardArt';
import { CATEGORY_LABEL, rewardError, useCreateReward, useRecoverReward, useReward, useUploadPhoto, type Reward, type RewardCategory } from '@/lib/rewards';

const money = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;
type CoverMode = 'ai' | 'photo';
type Photo = { hash: string; url: string };

const CATEGORIES: { id: RewardCategory; icon: ReactNode; blurb: string; tint: string }[] = [
  { id: 'find', icon: <Search size={22}/>, blurb: 'Track it down IRL', tint: 'from-[#2F7BF2] to-[#6FB2FF]' },
  { id: 'scan', icon: <ScanLine size={22}/>, blurb: 'Scan it in 3D', tint: 'from-[#1B1D22] to-[#3A3E48]' },
  { id: 'promo', icon: <Megaphone size={22}/>, blurb: 'Promote my coin', tint: 'from-[#F59E0B] to-[#FBBF24]' },
  { id: 'meme', icon: <Smile size={22}/>, blurb: 'Meme made real', tint: 'from-[#10B981] to-[#34D399]' },
  { id: 'art', icon: <Palette size={22}/>, blurb: 'Art & merch', tint: 'from-[#EC4899] to-[#F472B6]' },
  { id: 'other', icon: <Gem size={22}/>, blurb: 'Anything else', tint: 'from-[#6366F1] to-[#818CF8]' },
];
const AMOUNTS = [10, 25, 50, 100, 250, 500, 1000];
const DAYS: { v: number; label: string; sub: string }[] = [{ v: 3, label: '3', sub: 'days' }, { v: 7, label: '7', sub: 'days' }, { v: 14, label: '14', sub: 'days' }, { v: 30, label: '30', sub: 'days' }, { v: 0, label: '∞', sub: 'until won' }];
const IDEAS = ['Rotary phone', 'Pepe plush', 'Singing fish', 'Gold Nokia', 'Doge billboard', 'Vintage Game Boy'];
const STEPS = ['Object', 'Reward', 'Cover', 'Post'] as const;

/** A preview-only Reward built from the form so the live poster renders exactly like the real card. */
function previewReward(object: string, usd: number, category: RewardCategory, image: string, painting: boolean): Reward {
  return { id: `preview-${object}`, kind: 'community', title: `First ${object || 'object'} scan`, object: object || 'your object', tagline: '', rules: [], category, rewardUsd: usd, image, coverState: painting ? 'generating' : image ? 'upload' : 'none', status: 'draft', poster: { handle: '', name: '', avatar: '', wallet: '' }, escrow: null, mine: true, postedAt: '', createdAt: Date.now(), submissions: [], audit: [] };
}

/** Photo drop zone: tap, drag & drop or paste. Shows the uploaded photo with a replace/remove bar. */
export function PhotoDrop({ photo, busy, error, onFile, onClear, label, sub, dark = false }: { photo: Photo | null; busy: boolean; error?: string; onFile: (f: File) => void; onClear: () => void; label: string; sub: string; dark?: boolean }) {
  const [over, setOver] = useState<boolean>(false); const input = useRef<HTMLInputElement>(null);
  return <div>
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={cn('relative overflow-hidden rounded-[22px] border-2 border-dashed transition-all', over ? 'scale-[1.01] border-[#2F7BF2] bg-[#2F7BF2]/10' : dark ? 'border-white/25 bg-white/[0.06]' : 'border-ink/20 bg-white')}>
      {photo ? <div className="relative aspect-[16/10]">
        <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-cover"/>
        <div className="absolute inset-x-2 bottom-2 flex gap-2">
          <button type="button" onClick={() => input.current?.click()} className="press flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink/85 text-[12.5px] font-extrabold text-white backdrop-blur-md"><RefreshCw size={14}/>Replace</button>
          <button type="button" onClick={onClear} aria-label="Remove photo" className="press flex min-h-10 w-11 items-center justify-center rounded-xl bg-white/90 text-ink"><XIcon size={16}/></button>
        </div>
      </div> : <button type="button" onClick={() => input.current?.click()} className="press flex min-h-[150px] w-full flex-col items-center justify-center gap-2 p-5 text-center">
        <span className={cn('flex size-14 items-center justify-center rounded-2xl shadow-lg', dark ? 'bg-white text-ink' : 'bg-ink text-white')}>{busy ? <Loader2 size={22} className="animate-spin"/> : <ImagePlus size={22}/>}</span>
        <span className={cn('text-[15px] font-extrabold', dark ? 'text-white' : 'text-ink')}>{busy ? 'Uploading…' : label}</span>
        <span className={cn('max-w-[260px] text-[12.5px] font-semibold leading-snug', dark ? 'text-white/60' : 'text-ink/55')}>{sub}</span>
      </button>}
      {busy && photo && <div className="absolute inset-0 flex items-center justify-center bg-ink/40"><Loader2 size={26} className="animate-spin text-white"/></div>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}/>
    </div>
    {error && <p className="mt-1.5 px-1 text-[12px] font-bold text-down">{error}</p>}
  </div>;
}

/** After posting: watch the AI paint, regenerate, swap in a photo, then continue to escrow. */
export function CoverStudio({ reward, compact = false }: { reward: Reward; compact?: boolean }) {
  const live = useReward(reward.id); const r = live.data ?? reward; const recover = useRecoverReward(); const upload = useUploadPhoto();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const painting = r.coverState === 'generating';
  const onFile = (f: File) => upload.mutate(f, { onSuccess: p => setPhoto(p) });
  return <div className="space-y-3">
    <div className="relative overflow-hidden rounded-[22px]"><SkyPoster reward={r} big={!compact} className="aspect-[16/9] w-full"/>
      {painting && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent"><span className="scan-sweep absolute inset-y-0 -left-1/3 w-1/3"/></div>}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={painting || recover.isPending} onClick={() => recover.mutate({ id: r.id, mode: 'ai', photo: photo?.hash ?? '' })} className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#2F7BF2] text-[13.5px] font-extrabold text-white shadow-[0_10px_30px_-10px_rgba(47,123,242,.8)] disabled:opacity-50">{painting ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16}/>}{painting ? 'Painting…' : photo ? 'Repaint from photo' : 'Regenerate'}</button>
      <button type="button" disabled={!photo || recover.isPending} onClick={() => photo && recover.mutate({ id: r.id, mode: 'upload', photo: photo.hash })} className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink text-[13.5px] font-extrabold text-white disabled:opacity-35"><Upload size={16}/>Use photo as cover</button>
    </div>
    <PhotoDrop photo={photo} busy={upload.isPending} error={upload.isError ? rewardError(upload.error) : undefined} onFile={onFile} onClear={() => setPhoto(null)} label="Add a photo" sub="Use it as the cover, or let the AI repaint the poster inspired by it."/>
    {recover.isError && <p className="px-1 text-[12.5px] font-bold text-down">{rewardError(recover.error)}</p>}
  </div>;
}

/** Four-step visual bounty builder with a live poster preview, then the escrow step. */
export function RewardCreate({ open, onOpenChange, fund }: { open: boolean; onOpenChange: (v: boolean) => void; fund: (r: Reward, done: (r: Reward) => void) => ReactNode }) {
  const session = useSession(); const create = useCreateReward(); const upload = useUploadPhoto(); const navigate = useNavigate();
  const [step, setStep] = useState<number>(0);
  const [object, setObject] = useState<string>(''); const [brief, setBrief] = useState<string>(''); const [category, setCategory] = useState<RewardCategory>('find');
  const [usd, setUsd] = useState<number>(50); const [days, setDays] = useState<number>(14); const [promo, setPromo] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false);
  const [mode, setMode] = useState<CoverMode>('ai'); const [photo, setPhoto] = useState<Photo | null>(null);
  const [rules, setRules] = useState<string[]>(['Real object, found in person', 'Clear photo proof', 'First approved proof wins']); const [rule, setRule] = useState<string>('');
  const [draft, setDraft] = useState<Reward | null>(null); const [funding, setFunding] = useState<boolean>(false);
  const reset = useCallback(() => { setStep(0); setDraft(null); setFunding(false); create.reset(); }, [create]);
  useEffect(() => { if (!brief && object.trim().length >= 2) return; }, [brief, object]);
  const autoBrief = `Find a real ${object.trim() || 'object'} in the wild, scan it on ObjectPad and launch its coin. First approved proof takes the reward.`;
  const valid = [object.trim().length >= 2, usd >= 5 && usd <= 10_000, !(mode === 'photo' && !photo), true];
  const preview = useMemo(() => previewReward(object.trim(), usd, category, mode === 'photo' ? photo?.url ?? '' : '', false), [object, usd, category, mode, photo]);
  const submit = () => create.mutate({ object: object.trim(), title: `First ${object.trim()} scan`, brief: (brief.trim().length >= 10 ? brief.trim() : autoBrief).slice(0, 280), rules, category, adult, rewardUsd: usd, promoUrl: promo.trim(), days, cover: mode === 'photo' ? photo?.hash ?? '' : '', inspire: mode === 'ai' ? photo?.hash ?? '' : '' }, { onSuccess: r => setDraft(r) });
  const close = (v: boolean) => { onOpenChange(v); if (!v) reset(); };
  const next = () => { if (step < 3) setStep(step + 1); else submit(); };

  return <DialogPrimitive.Root open={open} onOpenChange={close}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/55 backdrop-blur-md"/>
      <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-paper shadow-float sm:bottom-auto sm:top-1/2 sm:max-h-[90dvh] sm:-translate-y-1/2 sm:rounded-[32px]">
        <div className="smoke relative shrink-0 overflow-hidden px-5 pb-4 pt-5 text-white">
          <Voxels seed={7} count={18} className="-right-2 top-0 h-full w-1/3 opacity-60"/>
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">{draft ? (funding ? 'Step 6 · Lock the reward' : 'Step 5 · Your poster') : `Step ${step + 1} of 4 · ${STEPS[step]}`}</p>
              <DialogPrimitive.Title className="display mt-1 truncate text-[26px] leading-none">{draft ? (funding ? 'Lock it in escrow' : 'Looking good.') : ['What’s the hunt?', 'Put money on it', 'Pick a cover', 'Ready to post'][step]}</DialogPrimitive.Title></div>
            <DialogPrimitive.Close className="press flex size-11 shrink-0 items-center justify-center rounded-full bg-white/12 text-white" aria-label="Close"><XIcon size={18}/></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Create a community bounty and fund it through escrow.</DialogPrimitive.Description>
          <div className="relative mt-4 grid grid-cols-6 gap-1.5">{Array.from({ length: 6 }, (_, i) => { const at = draft ? (funding ? 5 : 4) : step; return <span key={i} className="h-1.5 overflow-hidden rounded-full bg-white/15"><span className={cn('block h-full rounded-full bg-white transition-all duration-500', i < at ? 'w-full' : i === at ? 'w-1/2' : 'w-0')}/></span>; })}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!session.authenticated ? <div className="space-y-4 py-6 text-center"><Sparkles className="mx-auto" size={30}/><p className="display text-[26px]">Sign in to post a bounty</p><p className="text-[14px] font-semibold text-ink/60">X, email or wallet. Hunters get paid straight to their wallet.</p><button onClick={() => session.login()} className="btn press min-h-13 w-full">Sign in / Sign up</button></div>
          : draft ? (funding ? <div className="space-y-3"><div className="overflow-hidden rounded-[20px]"><SkyPoster reward={draft} className="aspect-[16/7] w-full"/></div>{fund(draft, r => { close(false); navigate(`/rewards/${r.id}?live=1`); })}
              <button onClick={() => { close(false); navigate(`/rewards/${draft.id}`); }} className="btn-ghost press min-h-11 w-full text-[13px]">Fund later from the bounty page</button></div>
            : <div className="space-y-4"><CoverStudio reward={draft}/><p className="px-1 text-[12.5px] font-semibold text-ink/55">Only you can see this draft. It goes public the moment the reward is locked in escrow.</p></div>)
          : <div key={step} className="pixel-in space-y-5">
            {step === 0 && <>
              <div className="overflow-hidden rounded-[22px] shadow-[0_18px_40px_-24px_rgba(12,13,16,.6)]"><SkyPoster reward={preview} className="aspect-[16/7] w-full"/></div>
              <div><p className="mb-2 px-1 text-[13px] font-extrabold">Name the object</p>
                <input autoFocus value={object} onChange={e => setObject(e.target.value.slice(0, 60))} placeholder="Rotary phone, Pepe plush…" className="w-full rounded-[20px] border-2 border-ink/10 bg-white px-5 py-4 font-display text-[24px] font-black tracking-tight outline-none transition focus:border-ink placeholder:text-ink/25"/>
                <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">{IDEAS.map(i => <button key={i} type="button" onClick={() => setObject(i)} className="press shrink-0 rounded-full bg-ink/[0.07] px-3.5 py-2 text-[12.5px] font-extrabold text-ink/75 hover:bg-ink hover:text-white">{i}</button>)}</div></div>
              <div><p className="mb-2 px-1 text-[13px] font-extrabold">What kind of hunt?</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{CATEGORIES.map(c => { const on = category === c.id; return <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={cn('press relative flex min-h-[92px] flex-col items-start justify-between overflow-hidden rounded-[20px] p-3 text-left transition-all', on ? 'bg-ink text-white shadow-[0_16px_34px_-16px_rgba(12,13,16,.9)] ring-2 ring-ink ring-offset-2 ring-offset-paper' : 'bg-white text-ink shadow-[0_2px_0_rgba(12,13,16,.06),0_10px_24px_-18px_rgba(12,13,16,.5)] hover:-translate-y-0.5')}>
                  <span className={cn('flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white', c.tint)}>{c.icon}</span>
                  <span><span className="block text-[14px] font-extrabold">{CATEGORY_LABEL[c.id]}</span><span className={cn('block text-[11.5px] font-semibold', on ? 'text-white/65' : 'text-ink/50')}>{c.blurb}</span></span>
                  {on && <Check size={16} strokeWidth={3} className="absolute right-3 top-3"/>}
                </button>; })}</div></div>
              <div><p className="mb-2 flex justify-between px-1 text-[13px] font-extrabold">The ask <span className="font-mono text-[11px] text-ink/45">{brief.length}/280 · optional</span></p>
                <textarea value={brief} onChange={e => setBrief(e.target.value.slice(0, 280))} rows={3} placeholder={autoBrief} className="w-full resize-none rounded-[20px] border-2 border-ink/10 bg-white px-4 py-3 text-[14px] font-semibold outline-none transition focus:border-ink placeholder:text-ink/35"/></div>
            </>}

            {step === 1 && <>
              <div className="smoke relative overflow-hidden rounded-[26px] p-5 text-center text-white">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Reward · paid in ETH</p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <button type="button" onClick={() => setUsd(v => Math.max(5, v - (v > 100 ? 50 : 5)))} aria-label="Less" className="press flex size-12 items-center justify-center rounded-2xl bg-white/12"><Minus size={20}/></button>
                  <input value={usd} inputMode="numeric" onChange={e => setUsd(Math.max(0, Math.min(10_000, Number(e.target.value.replace(/\D/g, '')) || 0)))} className="w-[170px] bg-transparent text-center font-display text-[56px] font-black leading-none tracking-tight outline-none tnum" aria-label="Reward in USD"/>
                  <button type="button" onClick={() => setUsd(v => Math.min(10_000, v + (v >= 100 ? 50 : 5)))} aria-label="More" className="press flex size-12 items-center justify-center rounded-2xl bg-white/12"><Plus size={20}/></button>
                </div>
                <p className="mt-1 font-mono text-[11.5px] text-white/50">USD · $5 – $10,000 · locked at the live ETH rate</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">{AMOUNTS.map(v => <button key={v} type="button" onClick={() => setUsd(v)} className={cn('press min-h-10 rounded-xl px-3.5 text-[13.5px] font-extrabold transition', usd === v ? 'bg-white text-ink shadow-[0_8px_24px_-8px_rgba(255,255,255,.6)]' : 'bg-white/10 text-white hover:bg-white/20')}>{money(v)}</button>)}</div>
              </div>
              <div><p className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-extrabold"><Clock size={14}/>Runs for</p>
                <div className="grid grid-cols-5 gap-1.5">{DAYS.map(d => <button key={d.v} type="button" onClick={() => setDays(d.v)} className={cn('press flex min-h-[74px] flex-col items-center justify-center rounded-[18px] transition', days === d.v ? 'bg-ink text-white shadow-[0_14px_30px_-14px_rgba(12,13,16,.9)]' : 'bg-white text-ink shadow-[0_2px_0_rgba(12,13,16,.06)]')}>
                  <span className="font-display text-[26px] font-black leading-none">{d.v === 0 ? <InfinityIcon size={26}/> : d.label}</span><span className={cn('mt-1 text-[11px] font-bold', days === d.v ? 'text-white/60' : 'text-ink/50')}>{d.sub}</span></button>)}</div>
                <p className="mt-2 px-1 text-[12px] font-semibold text-ink/50">A countdown shows on your bounty. Shorter deadlines rank higher in “Best right now”.</p></div>
            </>}

            {step === 2 && <>
              <div className="grid grid-cols-2 gap-2">{([['ai', 'AI sky poster', 'Painted for you in the ObjectPad style', <Wand2 key="a" size={22}/>], ['photo', 'My own photo', 'Upload the exact cover you want', <Camera key="p" size={22}/>]] as [CoverMode, string, string, ReactNode][]).map(([id, t, d, icon]) => { const on = mode === id;
                return <button key={id} type="button" onClick={() => setMode(id)} className={cn('press relative flex min-h-[118px] flex-col justify-between overflow-hidden rounded-[22px] p-4 text-left transition-all', on ? (id === 'ai' ? 'bg-[#2F7BF2] text-white shadow-[0_18px_40px_-16px_rgba(47,123,242,.9)]' : 'bg-ink text-white shadow-[0_18px_40px_-16px_rgba(12,13,16,.9)]') : 'bg-white text-ink shadow-[0_2px_0_rgba(12,13,16,.06),0_10px_24px_-18px_rgba(12,13,16,.5)]')}>
                  {id === 'ai' && on && <Voxels seed={3} count={12} className="-right-2 top-0 h-full w-1/2 opacity-70"/>}
                  <span className={cn('relative flex size-11 items-center justify-center rounded-2xl', on ? 'bg-white/18' : 'bg-ink text-white')}>{icon}</span>
                  <span className="relative"><span className="block text-[15px] font-extrabold">{t}</span><span className={cn('block text-[11.5px] font-semibold leading-snug', on ? 'text-white/75' : 'text-ink/50')}>{d}</span></span>
                  {on && <Check size={18} strokeWidth={3} className="absolute right-3 top-3"/>}
                </button>; })}</div>
              <div className="overflow-hidden rounded-[22px] shadow-[0_18px_40px_-24px_rgba(12,13,16,.6)]"><SkyPoster reward={preview} className="aspect-[16/9] w-full"/></div>
              <PhotoDrop photo={photo} busy={upload.isPending} error={upload.isError ? rewardError(upload.error) : undefined} onFile={f => upload.mutate(f, { onSuccess: p => setPhoto(p) })} onClear={() => setPhoto(null)}
                label={mode === 'ai' ? 'Inspire the AI (optional)' : 'Upload your cover'} sub={mode === 'ai' ? 'Add a photo of the object and the AI paints the poster to match it. You can regenerate after posting.' : 'JPG or PNG. Location data is stripped on upload.'}/>
            </>}

            {step === 3 && <>
              <div className="overflow-hidden rounded-[22px] shadow-[0_18px_40px_-24px_rgba(12,13,16,.6)]"><SkyPoster reward={preview} className="aspect-[16/9] w-full"/></div>
              <div className="grid grid-cols-3 gap-2">{[['Reward', money(usd)], ['Runs', days ? `${days} days` : 'Until won'], ['Cover', mode === 'ai' ? (photo ? 'AI + photo' : 'AI poster') : 'Your photo']].map(([k, v]) => <div key={k} className="rounded-[18px] bg-white p-3 shadow-[0_2px_0_rgba(12,13,16,.06)]"><p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink/45">{k}</p><p className="mt-0.5 truncate text-[15px] font-extrabold">{v}</p></div>)}</div>
              <div><p className="mb-2 px-1 text-[13px] font-extrabold">Rules <span className="font-mono text-[11px] text-ink/45">· max 4</span></p>
                <div className="flex flex-wrap gap-1.5">{rules.map(r => <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[12.5px] font-bold text-white">{r}<button type="button" aria-label={`Remove ${r}`} onClick={() => setRules(rules.filter(x => x !== r))} className="text-white/60 hover:text-white"><XIcon size={13}/></button></span>)}</div>
                {rules.length < 4 && <form onSubmit={e => { e.preventDefault(); const v = rule.trim(); if (v.length >= 3 && !rules.includes(v)) { setRules([...rules, v.slice(0, 80)]); setRule(''); } }} className="mt-2 flex gap-2"><input value={rule} onChange={e => setRule(e.target.value)} placeholder="Add a rule…" className="min-w-0 flex-1 rounded-2xl border-2 border-ink/10 bg-white px-4 py-2.5 text-[13.5px] font-semibold outline-none focus:border-ink"/><button className="press flex min-h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white" aria-label="Add rule"><Plus size={16}/></button></form>}</div>
              <div><p className="mb-2 px-1 text-[13px] font-extrabold">Your link <span className="font-mono text-[11px] text-ink/45">· optional</span></p><input value={promo} onChange={e => setPromo(e.target.value)} placeholder="https://x.com/yourcoin" className="w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-[14px] font-semibold outline-none focus:border-ink"/></div>
              <button type="button" onClick={() => setAdult(!adult)} className={cn('press flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[13px] font-bold transition', adult ? 'bg-ink text-white' : 'bg-white text-ink/70')}><span className={cn('flex size-6 items-center justify-center rounded-lg border-2', adult ? 'border-white bg-white text-ink' : 'border-ink/25')}>{adult && <Check size={14} strokeWidth={3}/>}</span>18+ object · cover is blurred until tapped</button>
              {create.isError && <p className="px-1 text-[12.5px] font-bold text-down">{rewardError(create.error)}</p>}
            </>}
          </div>}
        </div>

        {session.authenticated && <div className="shrink-0 border-t border-ink/[0.07] bg-paper/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          {draft ? (!funding && <button onClick={() => setFunding(true)} className="btn press min-h-14 w-full text-[15px]"><ArrowRight size={18}/>Continue to escrow · {money(draft.rewardUsd)}</button>)
            : <div className="flex gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="press flex min-h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-ink shadow-[0_2px_0_rgba(12,13,16,.08)]" aria-label="Back"><ArrowLeft size={20}/></button>}
              <button onClick={next} disabled={!valid[step] || create.isPending || upload.isPending} className="btn press min-h-14 flex-1 text-[15px] disabled:opacity-35">{create.isPending ? <Loader2 size={18} className="animate-spin"/> : step === 3 ? <Sparkles size={18}/> : <ArrowRight size={18}/>}{step === 3 ? `Post bounty · ${money(usd)}` : 'Continue'}</button>
            </div>}
        </div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
