import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, CheckSquare, Infinity as InfinityIcon, Minus, Plus, Search, Sparkles, Square, Timer, Wand2, X, Megaphone, Smile, Palette, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { rewardError, type Reward, type RewardCategory } from '@/lib/rewards';
import { useApp } from '../store';
import { Feedback } from '../feedback';
import { Fmt } from '../format';
import { CircleIconButton, Display, ErrorBanner, Lab, PadButton, PadField, Pill, Rolling, SkyPoster, StatTile, VoxelField } from '../ui';
import { PhotoDrop, useUpload } from './Rewards';

const CATS: [RewardCategory, string, string, typeof Search, string[]][] = [
  ['find', 'Find it', 'Track down a rare object', Search, ['#2F7BF2', '#6FB2FF']], ['scan', 'Scan it', 'First real 3D scan wins', ScanLine, ['#0C0D10', '#3A3F4A']],
  ['promo', 'Promote', 'Show it off in the wild', Megaphone, ['#F59E0B', '#F5C542']], ['meme', 'Meme IRL', 'A meme, found for real', Smile, ['#12A150', '#4ADE80']],
  ['art', 'Art', 'Make something with it', Palette, ['#E5484D', '#FF8A8E']], ['other', 'Other', 'Anything else', Sparkles, ['#6A6E78', '#9AA3B2']],
];

/** Four visual steps (object → reward → cover → post) with a live poster, then the cover studio and escrow on the bounty page. */
export default function RewardCreateView({ onDone, onClose }: { onDone: (id: string) => void; onClose: () => void }) {
  const app = useApp(); const up = useUpload();
  const [step, setStep] = useState<number>(0); const [object, setObject] = useState<string>(''); const [brief, setBrief] = useState<string>(''); const [category, setCategory] = useState<RewardCategory>('find');
  const [usd, setUsd] = useState<number>(50); const [days, setDays] = useState<number>(14); const [aiCover, setAiCover] = useState<boolean>(true); const [photo, setPhoto] = useState<{ hash: string; url: string } | null>(null);
  const [promo, setPromo] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false); const [busy, setBusy] = useState<boolean>(false); const [error, setError] = useState<string | null>(null);
  const auto = `Be the first to find a real ${object.trim() || 'object'}, photograph it and scan it on ObjectPad.`;
  const preview = useMemo(() => ({ id: `preview-${object}`, image: !aiCover && photo ? photo.url : '', coverState: 'none' as const, object: object.trim() || 'object', rewardUsd: usd }), [object, aiCover, photo, usd]);
  const valid = step === 0 ? object.trim().length >= 2 : step === 2 ? aiCover || Boolean(photo) : true;
  const post = async () => {
    setBusy(true); setError(null);
    try {
      const o = object.trim(); const b = brief.trim();
      const r = await api<Reward>('/rewards', { token: await app.accountToken(), method: 'POST', timeout: 30_000, body: { object: o, title: `First ${o} scan`, brief: (b.length >= 10 ? b : auto).slice(0, 280), category, rewardUsd: usd, days, promoUrl: promo.trim(), adult, rules: ['Real object, found in person', 'Clear photo proof', 'First approved proof wins'], cover: aiCover ? '' : photo?.hash ?? '', inspire: aiCover ? photo?.hash ?? '' : '' } });
      Feedback.success('seal'); app.refetchRewards(); onDone(r.id);
    } catch (e) { setError(rewardError(e)); Feedback.error(); }
    setBusy(false);
  };
  const go = (n: number) => { Feedback.selection(); setStep(n); };
  const poster = <div className="aspect-[2/1] overflow-hidden rounded-[24px] shadow-[0_10px_16px_rgba(47,123,242,.3)]"><SkyPoster reward={preview}/></div>;
  return <div className="flex h-full flex-col bg-[#ECEEF1]">
    <div className="ap-night relative overflow-hidden p-[18px] pt-[max(22px,env(safe-area-inset-top))]"><div className="absolute inset-0 opacity-60"><VoxelField count={14} seed={7}/></div>
      <div className="relative flex items-center"><div className="flex-1"><Lab className="!text-white/55">Step {step + 1} of 4</Lab><p key={step} className="ap-display ap-fade mt-1 text-[26px] text-white">{['What’s the hunt?', 'Put money on it', 'Pick a cover', 'Ready to post'][step]}</p></div><CircleIconButton icon={X} dark label="Close" onClick={onClose}/></div>
      <div className="relative mt-3 flex gap-1.5">{[0, 1, 2, 3, 4].map(i => <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: i <= step ? '#fff' : 'rgba(255,255,255,.15)' }}/>)}</div>
    </div>
    <div className="ap-scroll min-h-0 flex-1 overflow-y-auto p-4"><div key={step} className="ap-push flex flex-col gap-3.5">
      {step === 0 && <>{poster}
        <p className="text-[14px] font-extrabold">Name the object</p>
        <input value={object} onChange={e => setObject(e.target.value.slice(0, 60))} placeholder="Rotary phone, Pepe plush…" className="ap-field ap-display !text-[26px]"/>
        <div className="ap-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4">{['Rotary phone', 'Pepe plush', 'Singing fish', 'Gold Nokia', 'Vintage Game Boy'].map(i => <Pill key={i} title={i} on={object === i} onClick={() => setObject(i)}/>)}</div>
        <p className="mt-1 text-[14px] font-extrabold">What kind of hunt?</p>
        <div className="grid grid-cols-2 gap-2.5">{CATS.map(([id, t, s, I, g]) => { const on = category === id; return <button key={id} type="button" onClick={() => { Feedback.selection(); setCategory(id); }} className="ap-press flex flex-col gap-2.5 rounded-[22px] p-[13px] text-left transition-all duration-300" style={{ background: on ? '#0C0D10' : '#fff', color: on ? '#fff' : '#0C0D10', transform: on ? 'scale(1.02)' : undefined, boxShadow: on ? '0 8px 14px rgba(12,13,16,.3)' : '0 2px 4px rgba(12,13,16,.05)' }}>
          <span className="flex items-center justify-between"><span className="flex size-[42px] items-center justify-center rounded-[13px] text-white" style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}><I size={18} strokeWidth={2.6}/></span>{on && <CheckCircle2 size={18}/>}</span>
          <span><span className="block text-[15px] font-extrabold">{t}</span><span className="block text-[11.5px] font-semibold opacity-60">{s}</span></span>
        </button>; })}</div>
        <PadField label="The ask (optional)" placeholder={auto} multiline value={brief} onChange={setBrief}/>
      </>}
      {step === 1 && <>
        <div className="ap-smoke flex flex-col items-center gap-3 rounded-[28px] p-[18px]">
          <Lab className="!text-white/55">Reward · paid in ETH</Lab>
          <div className="flex items-center gap-3.5">{[[Minus, () => setUsd(u => Math.max(5, u - (u > 100 ? 50 : 5)))], [null, null], [Plus, () => setUsd(u => Math.min(10_000, u + (u >= 100 ? 50 : 5)))]].map(([I, f], i) => I ? <button key={i} type="button" onPointerDown={() => Feedback.selection()} onClick={f as () => void} className="ap-press flex size-12 items-center justify-center rounded-2xl bg-white/[0.12] text-white">{(() => { const Icon = I as typeof Minus; return <Icon size={18} strokeWidth={3}/>; })()}</button> : <Rolling key={i} text={Fmt.money(usd)} className="ap-display min-w-[150px] text-center text-white" style={{ fontSize: 50 }}/>)}</div>
          <p className="ap-mono text-[11px] font-bold text-white/50">$5 – $10,000 · locked at the live ETH rate</p>
          <div className="ap-scroll -mx-[18px] flex gap-1.5 overflow-x-auto px-[18px]">{[10, 25, 50, 100, 250, 500, 1000].map(v => <button key={v} type="button" onClick={() => { Feedback.selection(); setUsd(v); }} className="ap-press h-10 shrink-0 rounded-xl px-3.5 text-[14px] font-extrabold" style={{ background: usd === v ? '#fff' : 'rgba(255,255,255,.1)', color: usd === v ? '#0C0D10' : '#fff' }}>{Fmt.money(v)}</button>)}</div>
        </div>
        <p className="flex items-center gap-1.5 text-[14px] font-extrabold"><Timer size={15}/>Runs for</p>
        <div className="flex gap-2">{[3, 7, 14, 30, 0].map(d => { const on = days === d; return <button key={d} type="button" onClick={() => { Feedback.selection(); setDays(d); }} className="ap-press flex min-h-[76px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px]" style={{ background: on ? '#0C0D10' : '#fff', color: on ? '#fff' : '#0C0D10', boxShadow: on ? '0 6px 12px rgba(12,13,16,.3)' : '0 1px 3px rgba(12,13,16,.04)' }}>{d === 0 ? <InfinityIcon size={22} strokeWidth={2.6}/> : <span className="ap-display text-[24px]">{d}</span>}<span className="text-[11px] font-bold opacity-60">{d === 0 ? 'until won' : 'days'}</span></button>; })}</div>
        <p className="text-[12.5px] font-semibold text-[#6A6E78]">A live countdown shows on your bounty. Shorter deadlines rank higher in “Best right now”.</p>
      </>}
      {step === 2 && <>
        <div className="flex gap-2.5">{([[true, 'AI sky poster', 'Painted for you in the ObjectPad style', Wand2, '#2F7BF2'], [false, 'My own photo', 'Upload the exact cover you want', Camera, '#0C0D10']] as const).map(([v, t, s, I, a]) => { const on = aiCover === v; return <button key={t} type="button" onClick={() => { Feedback.selection(); setAiCover(v); }} className="ap-press flex min-h-[130px] flex-1 flex-col justify-between gap-3 rounded-[24px] p-3.5 text-left transition-all" style={{ background: on ? a : '#fff', color: on ? '#fff' : '#0C0D10', boxShadow: on ? `0 8px 16px ${a}73` : '0 2px 4px rgba(12,13,16,.05)' }}>
          <span className="flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-[14px] text-white" style={{ background: on ? 'rgba(255,255,255,.2)' : '#0C0D10' }}><I size={18} strokeWidth={2.6}/></span>{on && <CheckCircle2 size={18}/>}</span>
          <span><span className="block text-[15px] font-extrabold">{t}</span><span className="block text-[11.5px] font-semibold opacity-70">{s}</span></span>
        </button>; })}</div>
        {poster}
        <PhotoDrop photo={photo} busy={up.busy} title={aiCover ? 'Inspire the AI (optional)' : 'Upload your cover'} subtitle={aiCover ? 'Add a photo of the object and the AI paints the poster to match it. You can regenerate after posting.' : 'JPG or PNG. Location data is stripped on upload.'} onFile={f => void up.upload(f).then(p => p && setPhoto(p))} onClear={() => setPhoto(null)}/>
      </>}
      {step === 3 && <>{poster}
        <div className="flex gap-2"><StatTile label="Reward" value={Fmt.money(usd)}/><StatTile label="Runs" value={days === 0 ? 'Until won' : `${days} days`}/><StatTile label="Cover" value={aiCover ? (photo ? 'AI+photo' : 'AI') : 'Photo'}/></div>
        <PadField label="Your link (optional)" placeholder="https://x.com/yourcoin" mono inputMode="url" value={promo} onChange={setPromo}/>
        <button type="button" onClick={() => { Feedback.selection(); setAdult(a => !a); }} className="ap-press flex items-center gap-3 rounded-[18px] p-3.5 text-left" style={{ background: adult ? '#0C0D10' : '#fff', color: adult ? '#fff' : '#0C0D10' }}>{adult ? <CheckSquare size={20}/> : <Square size={20}/>}<span className="text-[13.5px] font-bold">18+ object · cover blurred until tapped</span></button>
        <p className="text-[12px] font-semibold text-[#6A6E78]">Hunters submit photo proofs. You pick the winner and the escrow pays them in one tap. Bounties must follow the safety rules; ObjectPad can remove abusive ones (funded ones are refunded).</p>
      </>}
      {(error ?? up.error) && <ErrorBanner message={(error ?? up.error)!}/>}
    </div></div>
    <div className="ap-glass flex gap-2.5 p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      {step > 0 && <CircleIconButton icon={ArrowLeft} size={56} label="Back" onClick={() => go(step - 1)}/>}
      <PadButton title={step === 3 ? `Post bounty · ${Fmt.money(usd)}` : 'Continue'} icon={step === 3 ? Sparkles : ArrowRight} kind={step === 3 ? 'sky' : 'ink'} busy={busy && step === 3} enabled={valid && !busy} onClick={() => (step < 3 ? go(step + 1) : void post())}/>
    </div>
  </div>;
}
