import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Banknote, Camera, CircleHelp, Clock, Copy, Crown, ImagePlus, Link2, Lock, LockKeyhole, Plus, RefreshCw, Send, Share, Sparkles, Timer, Trash2, Wallet, Wand2, X, CheckCircle2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { prepPhoto, rewardError, sortRewards, CATEGORY_LABEL, type Reward, type RewardProof, type RewardSort } from '@/lib/rewards';
import { waitForReceipt } from '@/lib/chain';
import type { Address, Hex } from 'viem';
import { useApp } from '../store';
import { Feedback } from '../feedback';
import { Fmt } from '../format';
import { PushScreen, RootScreen } from '../chrome';
import { ConfettiBurst, CountdownPill, Display, EmptyState, Enter, ErrorBanner, GlassIcon, InkSegmented, Lab, PadButton, PadField, PAD, Pill, PulseDot, RemoteImage, RewardStatusPill, Shimmer, SkyPoster, Spinner, StatTile, VoxelField, CloudDrift } from '../ui';

const txUrl = (h: string) => `https://robinhoodchain.blockscout.com/tx/${h}`;
const addressUrl = (a: string) => `https://robinhoodchain.blockscout.com/address/${a}`;
const SORTS: [RewardSort, string, typeof Sparkles][] = [['best', 'Best right now', Sparkles], ['ending', 'Ending soon', Timer], ['biggest', 'Biggest', Banknote], ['newest', 'Newest', Clock]];
const who = (p: RewardProof) => p.handle ? `@${p.handle}` : p.wallet;
const posterName = (r: Reward) => r.poster ? (r.poster.handle ? `@${r.poster.handle}` : r.poster.name || 'Anonymous') : 'ObjectPad';
type Photo = { hash: string; url: string };

export function RewardCard({ reward }: { reward: Reward }) {
  const platform = reward.kind === 'platform';
  return <div className="ap-raised overflow-hidden rounded-[26px] text-left">
    <div className="relative aspect-video overflow-hidden rounded-t-[26px]"><SkyPoster reward={reward} reveal={!reward.adult}/>
      <span className="absolute left-2.5 top-2.5"><RewardStatusPill reward={reward}/></span>
      <span className="ap-display absolute right-2.5 top-2.5 rounded-[14px] bg-ink/85 px-3 py-1.5 text-[22px] text-white">{Fmt.money(reward.rewardUsd)}</span>
      {reward.status === 'open' && <span className="absolute bottom-2.5 left-2.5"><CountdownPill deadline={reward.deadline}/></span>}
      {!platform && reward.status === 'open' && <span className="ap-mono absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[10px] font-extrabold"><Lock size={10}/>ESCROWED</span>}
    </div>
    <div className="flex flex-col gap-1.5 p-4">
      <Lab>{CATEGORY_LABEL[reward.category] ?? 'Other'} · {platform ? 'ObjectPad' : 'Community'}</Lab>
      <p className="ap-display text-[22px]">{reward.title}</p>
      {reward.tagline && <p className="line-clamp-2 text-[13.5px] font-semibold text-[#6A6E78]">{reward.tagline}</p>}
      <div className="mt-1 flex items-center gap-2"><span className="flex-1 truncate text-[13px] font-bold text-ink/70">{posterName(reward)}</span><span className="ap-mono text-[11px] font-bold text-[#6A6E78]">{reward.submissions.length} proofs</span><ArrowRight size={12} strokeWidth={3} className="text-[#6A6E78]"/></div>
    </div>
  </div>;
}

export default function RewardsView() {
  const app = useApp(); const [source, setSource] = useState<'all' | 'objectpad' | 'community'>('all'); const [status, setStatus] = useState<string>('open'); const [sort, setSort] = useState<RewardSort>('best');
  const all = useMemo(() => app.rewards?.bounties ?? [], [app.rewards]);
  const list = useMemo(() => sortRewards(all.filter(b => status === 'open' ? b.status === 'open' : status === 'paid' ? b.status === 'paid' : status === 'mine' ? b.mine || b.submissions.some(s => s.mine) : b.status !== 'cancelled').filter(b => source === 'all' || (source === 'objectpad') === (b.kind === 'platform')), sort, Date.now()), [all, status, source, sort]);
  const openCount = (src: string) => all.filter(b => b.status === 'open' && (src === 'all' || (src === 'objectpad') === (b.kind === 'platform'))).length;
  const post = () => (app.signedIn ? app.setCreatingReward(true) : app.setSignIn(true));
  return <RootScreen><div className="flex flex-col gap-3.5">
    <Enter className="relative mt-1.5 overflow-hidden rounded-[32px] p-5 shadow-[0_12px_22px_rgba(47,123,242,.35)]">
      <div className="ap-sky absolute inset-0"/><CloudDrift/><div className="absolute inset-0" style={{ maskImage: 'linear-gradient(90deg,transparent,#000)', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000)' }}><VoxelField count={22} seed={4}/></div><div className="absolute inset-0 bg-gradient-to-b from-transparent to-ink/35"/>
      <div className="relative flex flex-col gap-3.5">
        <div className="flex items-center"><Lab className="flex-1 !text-white/75">ObjectPad · Paid Rewards</Lab><span className="flex items-center gap-1.5 text-white"><PulseDot color="#fff" size={6}/><span className="ap-mono text-[10px] font-extrabold">LIVE</span></span></div>
        <Display size={40} className="!text-white">{'Scan it first.\nGet paid.'}</Display>
        <p className="text-[14.5px] font-semibold text-white/85">Cash bounties for finding, scanning and tokenizing real objects. Rewards only go up.</p>
        <div className="flex gap-2"><StatTile label="Open" value={Fmt.money(app.rewards?.stats?.openUsd ?? 0)} dark/><StatTile label="Paid" value={Fmt.money(app.rewards?.stats?.paidUsd ?? 0)} dark/><StatTile label="Escrow" value={`${(app.rewards?.stats?.escrowEth ?? 0).toFixed(3)} Ξ`} dark/></div>
        <PadButton title="Post a bounty" icon={Plus} kind="pearl" onClick={post}/>
      </div>
    </Enter>
    <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-[9px] bg-[#ECEEF1]/[0.94] px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur-md">
      <InkSegmented options={[['all', `Everyone · ${openCount('all')}`], ['objectpad', `ObjectPad · ${openCount('objectpad')}`], ['community', `Users · ${openCount('community')}`]]} value={source} onChange={setSource}/>
      <div className="ap-scroll -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">{[['open', 'Open now'], ['all', 'All'], ['paid', 'Paid out'], ['mine', 'Mine']].map(([k, l]) => <Pill key={k} title={l} on={status === k} onClick={() => setStatus(k)}/>)}<span className="mx-0.5 h-[22px] w-px shrink-0 bg-ink/15"/>{SORTS.map(([k, l, I]) => <Pill key={k} title={l} icon={I} on={sort === k} accent={PAD.sky} onClick={() => setSort(k)}/>)}</div>
    </div>
    {!app.rewards ? [0, 1, 2].map(i => <Shimmer key={i} className="h-[300px] rounded-[28px]"/>) : !list.length && <div className="flex flex-col items-center gap-2 py-8 text-center"><GlassIcon name="glass_diamond" size={70} float/><p className="text-[14.5px] font-bold text-[#6A6E78]">{status === 'mine' ? (app.signedIn ? 'Nothing yet. Post a bounty or send a proof.' : 'Sign in to see your bounties and proofs.') : 'No bounties match.'}</p></div>}
    {list.map((r, i) => <Enter key={r.id} delay={Math.min(i, 6) * 0.05}><button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(`/app/rewards/${r.id}`)} className="ap-press block w-full"><RewardCard reward={r}/></button></Enter>)}
    <button type="button" onPointerDown={() => Feedback.tap()} onClick={post} className="ap-press flex flex-col items-center gap-2.5 rounded-[28px] border-2 border-dashed border-ink/15 p-6 text-center">
      <span className="flex size-[60px] items-center justify-center rounded-[20px] bg-ink text-white"><Plus size={26} strokeWidth={2.6}/></span><Display size={22}>Your bounty here</Display><p className="text-[13px] font-semibold text-[#6A6E78]">Name an object, lock the reward in escrow, watch hunters go find it.</p>
    </button>
  </div></RootScreen>;
}

/** Big tappable photo drop: pick a photo, see it full-width, replace or remove. */
export function PhotoDrop({ photo, busy, title, subtitle, onFile, onClear }: { photo: Photo | null; busy: boolean; title: string; subtitle: string; onFile: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="relative overflow-hidden rounded-[24px] bg-white" style={{ boxShadow: photo ? 'inset 0 0 0 2px rgba(12,13,16,.18)' : undefined, border: photo ? undefined : '2px dashed rgba(12,13,16,.18)' }}>
    <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}/>
    {photo ? <div className="relative aspect-[16/10]"><RemoteImage src={photo.url}/><div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between"><button type="button" onClick={() => input.current?.click()} className="ap-press flex items-center gap-1.5 rounded-full bg-ink/85 px-3.5 py-[9px] text-[13px] font-extrabold text-white"><RefreshCw size={13}/>Replace</button><button type="button" onClick={onClear} aria-label="Remove" className="ap-press flex size-9 items-center justify-center rounded-full bg-white"><X size={14} strokeWidth={3}/></button></div>{busy && <div className="absolute inset-0 flex items-center justify-center bg-black/35"><Spinner className="text-white"/></div>}</div>
      : <button type="button" onPointerDown={() => Feedback.tap()} onClick={() => input.current?.click()} className="ap-press flex min-h-[160px] w-full flex-col items-center justify-center gap-2 p-[22px] text-center">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-ink text-white">{busy ? <Spinner className="text-white"/> : <ImagePlus size={22} strokeWidth={2.4}/>}</span><span className="text-[15px] font-extrabold">{busy ? 'Uploading…' : title}</span><span className="text-[12.5px] font-semibold text-[#6A6E78]">{subtitle}</span>
      </button>}
  </div>;
}
export function useUpload() {
  const app = useApp(); const [busy, setBusy] = useState<boolean>(false); const [error, setError] = useState<string | null>(null);
  const upload = async (f: File): Promise<Photo | null> => { setBusy(true); setError(null); try { const t = await app.accountToken(); if (!t) throw new Error('Sign in first.'); return await api<Photo>('/rewards/photos', { token: t, method: 'PUT', binary: await prepPhoto(f), timeout: 60_000 }); } catch (e) { setError(rewardError(e)); return null; } finally { setBusy(false); } };
  return { busy, error, upload };
}

export function RewardDetailView() {
  const { id = '' } = useParams(); const app = useApp(); const [reward, setReward] = useState<Reward | null>(null); const [error, setError] = useState<string | null>(null); const [reveal, setReveal] = useState<boolean>(false);
  const load = async () => { try { const t = await app.accountToken(); const r = await api<Reward>(`/rewards/${id}`, { token: t }); setReward(r); setError(null); } catch (e) { if (!reward) setError(rewardError(e)); } };
  useEffect(() => { let alive = true; let timer: ReturnType<typeof setTimeout>; const loop = async () => { await load(); if (alive) timer = setTimeout(() => void loop(), reward?.coverState === 'generating' || reward?.status === 'paying' ? 4000 : 15000); }; void loop(); return () => { alive = false; clearTimeout(timer); }; }, [id, app.signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = reward;
  const share = async () => { if (!r) return; const url = `https://objectpad.fun/rewards/${r.id}`; const text = r.status === 'paid' ? `Winner paid: ${r.title} · ${Fmt.money(r.rewardUsd)} on @ObjectPadFun` : `${r.title} · ${Fmt.money(r.rewardUsd)} bounty on @ObjectPadFun. First real scan wins.`; try { if (navigator.share) await navigator.share({ url, text }); else { await navigator.clipboard.writeText(`${text} ${url}`); app.show('Link copied'); } } catch { /* cancelled */ } };
  const platform = r?.kind === 'platform'; const win = r?.submissions.find(s => s.state === 'paid' || s.state === 'winner');
  return <PushScreen trailing={r && <button type="button" aria-label="Share" onClick={share} className="ap-press flex size-10 items-center justify-center"><Share size={19}/></button>}><div className="flex flex-col gap-4 px-4 pb-28">
    {r ? <>
      <Enter><button type="button" onClick={() => r.adult && setReveal(true)} className="relative block aspect-[16/10] w-full overflow-hidden rounded-[30px] shadow-[0_10px_18px_rgba(47,123,242,.3)]">
        <SkyPoster reward={r} big reveal={!r.adult || reveal}/><span className="absolute left-3 top-3"><RewardStatusPill reward={r}/></span><span className="ap-display absolute right-3 top-3 rounded-2xl bg-ink/85 px-3.5 py-[7px] text-[28px] text-white">{Fmt.money(r.rewardUsd)}</span>
        {r.status === 'open' && <span className="absolute bottom-3 left-3"><CountdownPill deadline={r.deadline} big/></span>}{r.status === 'paid' && <ConfettiBurst/>}
      </button></Enter>
      <Enter delay={0.05} className="flex flex-col gap-2.5">
        <Lab>{CATEGORY_LABEL[r.category] ?? 'Other'} · {platform ? 'ObjectPad bounty' : 'Community bounty'} · posted {r.postedAt}</Lab><Display size={32}>{r.title}</Display>
        {r.tagline && <p className="text-[16px] font-semibold text-ink/75">{r.tagline}</p>}
        <div className="ap-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4">{r.rules.map(rule => <span key={rule} className="ap-sunk flex shrink-0 items-center gap-1 rounded-[14px] px-[11px] py-[7px] text-[12.5px] font-bold"><Check size={12} strokeWidth={3}/>{rule}</span>)}</div>
        {r.promoUrl && <a href={r.promoUrl} target="_blank" rel="noreferrer" className="ap-mono flex items-center gap-1 text-[12px] font-bold"><Link2 size={13}/>{(() => { try { return new URL(r.promoUrl).host; } catch { return r.promoUrl; } })()}</a>}
      </Enter>
      {(win || r.winner) && <Enter delay={0.08}><div className="ap-raised flex flex-col gap-2 rounded-[24px] p-4 ring-2 ring-[#12A150]">
        <p className="ap-mono flex items-center gap-1.5 text-[11px] font-extrabold text-[#12A150]"><Crown size={13} fill="#12A150"/>{r.status === 'paid' ? 'Winner paid · confirmed' : 'Payout sending…'}</p>
        <p className="text-[17px] font-extrabold">{win ? who(win) : r.winner?.handle ? `@${r.winner.handle}` : 'Winner'}</p>
        {(win?.payoutTx ?? r.payoutTx) && <a href={txUrl((win?.payoutTx ?? r.payoutTx)!)} target="_blank" rel="noreferrer" className="text-[13.5px] font-extrabold text-[#12A150]">View payout ↗</a>}
      </div></Enter>}
      {r.mine && !platform && (r.status === 'draft' || r.status === 'open') && <Enter delay={0.1}><CoverStudio reward={r} onUpdate={setReward}/></Enter>}
      {r.mine && r.status === 'draft' && <Enter delay={0.12}><FundCard reward={r} onFunded={u => { setReward(u); Feedback.success('seal'); }}/></Enter>}
      {r.status === 'open' && !r.mine && <Enter delay={0.12}><ProofForm reward={r} onSent={() => void load()}/></Enter>}
      <Enter delay={0.15} className="flex flex-col gap-2.5">
        <div className="flex items-end justify-between"><Display size={26}>Proofs</Display><span className="ap-mono text-[12px] font-bold text-[#6A6E78]">{r.submissions.length} total</span></div>
        {!r.submissions.length && <div className="ap-sunk flex flex-col items-center gap-2 rounded-[24px] p-6"><Camera size={30} className="text-[#6A6E78]"/><p className="text-[14px] font-bold">{r.status === 'paid' ? 'Settled by the ObjectPad team.' : 'No proofs yet. The first real one takes it.'}</p></div>}
        {r.submissions.map(p => <ProofCard key={p.id} proof={p} reward={r} onUpdate={setReward}/>)}
      </Enter>
      {!platform && r.status !== 'draft' && r.escrow && <Enter delay={0.18}><div className="ap-raised flex flex-col gap-2 rounded-[24px] p-4">
        <p className="flex items-center gap-1.5 text-[15px] font-extrabold"><LockKeyhole size={16}/>Escrow</p>
        {([['Locked', `${(r.rewardEth ?? 0).toFixed(6)} ETH`, null], ['Wallet', Fmt.short(r.escrow), addressUrl(r.escrow)], r.fundTx ? ['Deposit', Fmt.short(r.fundTx, 8, 6), txUrl(r.fundTx)] : null, r.refundTx ? ['Refund', Fmt.short(r.refundTx, 8, 6), txUrl(r.refundTx)] : null].filter(Boolean) as [string, string, string | null][]).map(([k, v, u]) => <div key={k} className="flex"><span className="flex-1 text-[13px] font-semibold text-[#6A6E78]">{k}</span>{u ? <a href={u} target="_blank" rel="noreferrer" className="ap-mono text-[12px] font-bold">{v}</a> : <span className="ap-mono text-[12px] font-bold">{v}</span>}</div>)}
      </div></Enter>}
      {r.mine && !platform && (r.status === 'open' || r.status === 'draft') && <CancelCard reward={r} onUpdate={setReward}/>}
      {r.audit.length > 0 && <Enter delay={0.2}><div className="ap-smoke flex flex-col gap-2.5 rounded-[24px] p-4">
        <Lab className="!text-white/55">Public audit log</Lab>
        {r.audit.map((a, i) => <div key={i} className="border-l border-white/15 pl-2.5"><p className="ap-mono text-[10px] font-bold uppercase text-white/45">{a.event.replace(/_/g, ' ')} · {Fmt.ago(a.at)}</p><p className="text-[13px] font-semibold text-white/[0.88]">{a.detail}</p>{a.tx && <a href={txUrl(a.tx)} target="_blank" rel="noreferrer" className="ap-mono text-[11px] font-bold text-white/65">{Fmt.short(a.tx, 8, 6)}</a>}</div>)}
      </div></Enter>}
    </> : error ? <EmptyState icon={CircleHelp} title="Bounty not found" body={error}/> : <div className="flex justify-center pt-32"><Spinner/></div>}
  </div></PushScreen>;
}

function CoverStudio({ reward, onUpdate }: { reward: Reward; onUpdate: (r: Reward) => void }) {
  const app = useApp(); const up = useUpload(); const [photo, setPhoto] = useState<Photo | null>(null); const [busy, setBusy] = useState<boolean>(false); const [error, setError] = useState<string | null>(null); const painting = reward.coverState === 'generating';
  const act = async (mode: 'ai' | 'upload') => { setBusy(true); setError(null); try { onUpdate(await api<Reward>(`/rewards/${reward.id}/cover`, { token: await app.accountToken(), method: 'POST', body: { mode, photo: photo?.hash ?? '' }, timeout: 30_000 })); Feedback.success(); } catch (e) { setError(rewardError(e)); Feedback.error(); } setBusy(false); };
  return <div className="ap-raised flex flex-col gap-3 rounded-[26px] p-4">
    <p className="flex items-center gap-1.5 text-[16px] font-extrabold"><Wand2 size={17}/>Cover studio</p>
    <div className="flex gap-2"><PadButton title={painting ? 'Painting…' : photo ? 'Repaint from photo' : 'Regenerate'} icon={Sparkles} kind="sky" busy={painting} enabled={!busy} height={50} onClick={() => void act('ai')}/><PadButton title="Use as cover" icon={ImagePlus} enabled={Boolean(photo) && !busy} height={50} onClick={() => void act('upload')}/></div>
    <PhotoDrop photo={photo} busy={up.busy} title="Add a photo" subtitle="Use it as the cover, or let the AI repaint the poster inspired by it." onFile={f => void up.upload(f).then(p => p && setPhoto(p))} onClear={() => setPhoto(null)}/>
    {(error ?? up.error) && <ErrorBanner message={(error ?? up.error)!}/>}
  </div>;
}

function FundCard({ reward, onFunded }: { reward: Reward; onFunded: (r: Reward) => void }) {
  const app = useApp(); const [hash, setHash] = useState<string>(''); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const isHash = /^0x[a-fA-F0-9]{64}$/.test(hash.trim());
  const verify = async (h: string) => { setBusy('Verifying…'); try { onFunded(await api<Reward>(`/rewards/${reward.id}/fund`, { token: await app.accountToken(), method: 'POST', body: { hash: h }, timeout: 45_000 })); } catch (e) { setError(rewardError(e)); Feedback.error(); } setBusy(null); };
  const pay = async () => { setError(null); try { const s = app.signer(); setBusy('Sending…'); const h = await s.send({ to: reward.escrow as Address, value: BigInt(reward.rewardWei ?? '0') }); setHash(h); setBusy('Confirming…'); await waitForReceipt(h as Hex); await verify(h); } catch (e) { setError(e instanceof Error ? e.message.split('\n')[0] : 'Couldn’t send.'); Feedback.error(); setBusy(null); } };
  return <div className="ap-smoke flex flex-col gap-3 rounded-[26px] p-[18px]">
    <Lab className="!text-white/55">Lock in escrow</Lab><p className="ap-display text-[32px] text-white">{(reward.rewardEth ?? 0).toFixed(6)} ETH</p><p className="ap-mono text-[11.5px] font-bold text-white/55">= {Fmt.money(reward.rewardUsd)} · Robinhood Chain (4663)</p>
    {reward.escrow && <button type="button" onClick={() => { void navigator.clipboard.writeText(reward.escrow!); app.show('Escrow address copied'); }} className="ap-press flex items-center gap-2 rounded-[14px] bg-white/10 p-3 text-left"><span className="ap-mono min-w-0 flex-1 truncate text-[11.5px] font-bold">{reward.escrow}</span><Copy size={14}/></button>}
    <PadButton title={busy ?? 'Fund from my wallet'} icon={Wallet} kind="pearl" busy={busy !== null} onClick={() => void pay()}/>
    <p className="text-[12.5px] font-bold text-white/60">Or send from any wallet and paste the tx hash</p>
    <div className="flex gap-2"><input value={hash} onChange={e => setHash(e.target.value)} placeholder="0x…" autoCapitalize="none" className="ap-mono min-w-0 flex-1 rounded-[14px] border-0 bg-white/10 p-3 text-[12.5px] font-semibold text-white outline-none placeholder:text-white/40"/><button type="button" disabled={!isHash} onClick={() => void verify(hash.trim())} className="ap-press h-11 rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-ink disabled:opacity-40">Verify</button></div>
    {error && <p className="text-[12.5px] font-bold text-[#FF8A8E]">{error}</p>}
    <p className="text-[11.5px] font-semibold text-white/50">Goes live the moment the deposit is confirmed. Cancel before anyone submits proof for a full refund (minus network fee).</p>
  </div>;
}

function ProofForm({ reward, onSent }: { reward: Reward; onSent: () => void }) {
  const app = useApp(); const up = useUpload(); const [photo, setPhoto] = useState<Photo | null>(null); const [coin, setCoin] = useState<string>(''); const [note, setNote] = useState<string>(''); const [busy, setBusy] = useState<boolean>(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState<boolean>(false);
  const submit = async () => { setBusy(true); setError(null); try { await api(`/rewards/${reward.id}/submissions`, { token: await app.accountToken(), method: 'POST', body: { photo: photo?.hash ?? '', coin: coin.trim(), note: note.trim() } }); setSent(true); Feedback.success('seal'); onSent(); } catch (e) { setError(rewardError(e)); Feedback.error(); } setBusy(false); };
  return <div className="ap-raised flex flex-col gap-3 rounded-[26px] p-4">
    <p className="flex items-center gap-1.5 text-[16px] font-extrabold" style={{ color: sent ? PAD.up : PAD.ink }}>{sent ? <CheckCircle2 size={17}/> : <Camera size={17}/>}{sent ? 'Proof sent' : 'Send your proof'}</p>
    {sent ? <p className="text-[13.5px] font-semibold text-[#6A6E78]">The poster reviews proofs in order. You’re paid straight to your wallet if you win.</p>
      : !app.signedIn ? <><p className="text-[13.5px] font-semibold text-[#6A6E78]">Sign in so the reward can be paid to your wallet.</p><PadButton title="Sign in to hunt" onClick={() => app.setSignIn(true)}/></>
      : <><PhotoDrop photo={photo} busy={up.busy} title="Photo of the real object" subtitle="Location data is stripped on upload." onFile={f => void up.upload(f).then(p => p && setPhoto(p))} onClear={() => setPhoto(null)}/>
        <PadField label="Your ObjectPad coin (optional)" placeholder="0x… or objectpad.fun link" mono value={coin} onChange={setCoin}/><PadField label="Note (optional)" placeholder="Where you found it…" value={note} onChange={setNote}/>
        {(error ?? up.error) && <ErrorBanner message={(error ?? up.error)!}/>}<PadButton title="Submit proof" icon={Send} busy={busy} enabled={Boolean(photo) || coin.length > 0} onClick={() => void submit()}/></>}
  </div>;
}

function ProofCard({ proof, reward, onUpdate }: { proof: RewardProof; reward: Reward; onUpdate: (r: Reward) => void }) {
  const app = useApp(); const [rejecting, setRejecting] = useState<boolean>(false); const [reason, setReason] = useState<string>(''); const [busy, setBusy] = useState<boolean>(false); const [error, setError] = useState<string | null>(null);
  const act = async (path: string, body: object) => { setBusy(true); setError(null); try { onUpdate(await api<Reward>(path, { token: await app.accountToken(), method: 'POST', body, timeout: 60_000 })); Feedback.success('coins'); } catch (e) { setError(rewardError(e)); Feedback.error(); } setBusy(false); };
  const [label, color] = proof.state === 'paid' ? ['PAID', PAD.up] : proof.state === 'winner' ? ['WINNER', PAD.up] : proof.state === 'rejected' ? ['NOT ACCEPTED', PAD.down] : ['IN REVIEW', PAD.muted];
  return <div className="ap-raised overflow-hidden rounded-[24px]">
    {proof.photo && <div className="aspect-[4/3]"><RemoteImage src={proof.photo}/></div>}
    <div className="flex flex-col gap-1.5 p-3.5">
      <div className="flex items-center"><p className="flex-1 truncate text-[14.5px] font-extrabold">{who(proof)}</p><span className="ap-mono text-[10px] font-extrabold" style={{ color }}>{label}</span></div>
      {proof.coinSymbol && <p className="ap-mono text-[11.5px] font-bold">Coin ${proof.coinSymbol} · {proof.coinName}</p>}
      {proof.note && <p className="text-[13px] font-semibold text-[#6A6E78]">{proof.note}</p>}
      {proof.reviewNote && <p className="text-[13px] font-bold text-[#E5484D]">“{proof.reviewNote}”</p>}
      <p className="ap-mono text-[10.5px] font-semibold text-[#6A6E78]">{Fmt.ago(proof.createdAt)}</p>
      {reward.mine && reward.kind !== 'platform' && reward.status === 'open' && proof.state === 'submitted' && (rejecting ? <><PadField label="Public reason" placeholder="Not the right object…" value={reason} onChange={setReason}/><div className="flex gap-2"><PadButton title="Cancel" kind="ghost" height={44} onClick={() => setRejecting(false)}/><PadButton title="Reject" kind="down" busy={busy} enabled={reason.length >= 3} height={44} onClick={() => void act(`/rewards/submissions/${proof.id}/review`, { state: 'rejected', note: reason, tx: '' })}/></div></>
        : <div className="flex gap-2"><PadButton title="Pay winner" icon={Crown} kind="up" busy={busy} height={46} onClick={() => void act(`/rewards/submissions/${proof.id}/payout`, {})}/><PadButton title="Reject" kind="ghost" height={46} onClick={() => setRejecting(true)}/></div>)}
      {error && <p className="text-[12px] font-bold text-[#E5484D]">{error}</p>}
    </div>
  </div>;
}

function CancelCard({ reward, onUpdate }: { reward: Reward; onUpdate: (r: Reward) => void }) {
  const app = useApp(); const [confirm, setConfirm] = useState<boolean>(false); const [busy, setBusy] = useState<boolean>(false); const pending = reward.submissions.filter(s => s.state === 'submitted').length;
  return <div className="ap-sunk flex flex-col gap-2.5 rounded-[22px] p-3.5">
    {confirm ? <><p className="text-center text-[13.5px] font-bold">{reward.status === 'draft' ? 'Delete this draft?' : pending > 0 ? 'Pick a winner or reject the waiting proofs first.' : `Refund ${(reward.rewardEth ?? 0).toFixed(5)} ETH to the funding wallet and close the bounty?`}</p>
      <div className="flex gap-2"><PadButton title="Keep it" kind="ghost" height={46} onClick={() => setConfirm(false)}/><PadButton title="Confirm" kind="down" busy={busy} enabled={!(pending > 0 && reward.status === 'open')} height={46} onClick={() => void (async () => { setBusy(true); try { onUpdate(await api<Reward>(`/rewards/${reward.id}/cancel`, { token: await app.accountToken(), method: 'POST', body: { reason: '' }, timeout: 60_000 })); Feedback.success(); } catch { Feedback.error(); } setBusy(false); setConfirm(false); })()}/></div></>
      : <button type="button" onClick={() => setConfirm(true)} className="ap-press flex min-h-11 items-center justify-center gap-1.5 text-[14px] font-extrabold text-[#E5484D]"><Trash2 size={15}/>{reward.status === 'draft' ? 'Delete draft' : 'Cancel & refund'}</button>}
  </div>;
}
