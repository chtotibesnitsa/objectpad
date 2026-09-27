import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, BadgeCheck, Fingerprint, KeyRound, ShieldCheck, Wallet } from 'lucide-react';
import type { ObjectRecord } from '@/shared/domain';
import { shortAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Anti-impersonation, Uniqueness v2 and proof-of-custody panel of a coin. The creator's X account is shown only when it was
 * proven by X OAuth; a coin whose X link points at someone else is flagged in red.
 */
export function CreatorProof({ object }: { object: ObjectRecord }) {
  const ci = object.creatorIdentity; const uq = object.uniquenessV2; const cu = object.custody;
  const status = ci?.linkStatus ?? 'none';
  return <section className="grid gap-3 lg:grid-cols-3">
    <div className={cn('rounded-[24px] p-5', status === 'mismatch' || status === 'unverified' ? 'bg-[#FFF1EF] shadow-[inset_0_0_0_1.5px_rgba(224,69,58,.35)]' : 'raised')}>
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-extrabold"><BadgeCheck size={16} className={ci?.x ? 'text-[#2F7BF2]' : 'text-ink/40'}/>Verified creator</h2><span className="font-mono text-[11px] font-bold text-ink/55">X OAuth + wallet</span></div>
      {ci?.x ? <div className="mt-3 flex items-center gap-3">{ci.x.avatar ? <img src={ci.x.avatar} alt="" className="size-11 rounded-full"/> : <span className="size-11 rounded-full bg-ink/10"/>}<div className="min-w-0"><a href={`https://x.com/${ci.x.handle}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[17px] font-extrabold">@{ci.x.handle}<BadgeCheck size={15} className="text-[#2F7BF2]"/></a><p className="font-mono text-[11px] text-ink/55">X user id {ci.x.id}</p></div></div>
        : <p className="mt-3 text-[14px] font-bold text-ink/65">{ci?.guest ? 'Launched as a guest. No X account is bound to this coin.' : 'The creator has not verified an X account.'}</p>}
      <a href={`https://robinhoodchain.blockscout.com/address/${ci?.wallet ?? object.creatorWallet}`} target="_blank" rel="noreferrer" className="mt-3 flex min-h-10 items-center justify-between rounded-xl bg-ink/[0.05] px-3 font-mono text-[12px] font-bold"><span className="flex items-center gap-1.5"><Wallet size={13}/>Dev wallet</span><span className="flex items-center gap-1">{shortAddress(ci?.wallet ?? object.creatorWallet)}<ArrowUpRight size={12}/></span></a>
      {status === 'mismatch' && <p className="mt-3 flex gap-2 text-[12.5px] font-extrabold text-down"><AlertTriangle size={15} className="shrink-0"/>This coin links @{ci?.linkHandle}, but it was created by @{ci?.x?.handle}. Treat the link as impersonation.</p>}
      {status === 'unverified' && <p className="mt-3 flex gap-2 text-[12.5px] font-extrabold text-down"><AlertTriangle size={15} className="shrink-0"/>The X link @{ci?.linkHandle} is not proven to belong to the creator.</p>}
      {status === 'verified' && <p className="mt-3 text-[12px] font-bold text-up">The coin’s X link is the creator’s own account.</p>}
    </div>
    <Link to={`/verify/${object.objectId}`} className="smoke lift block rounded-[24px] p-5 text-white">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-extrabold"><Fingerprint size={16}/>Uniqueness v2</h2><span className="font-mono text-[11px] font-bold text-white/60">geometry · surface · pHash</span></div>
      <div className="mt-2 flex items-end gap-2"><p className="display text-[52px] leading-none">{uq?.score != null ? uq.score.toFixed(1) : '…'}</p><p className="mb-1.5 text-[12px] font-bold text-white/65">/100<br/>{uq ? `vs ${uq.compared} objects` : 'fingerprinting now'}</p></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#3BE08A] transition-all duration-1000" style={{ width: `${uq?.score ?? 0}%` }}/></div>
      <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-extrabold">Verify the signed Merkle proof<ArrowUpRight size={13}/></p>
    </Link>
    <div className="raised rounded-[24px] p-5">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-extrabold"><KeyRound size={16}/>Proof of custody</h2><span className={cn('rounded-full px-2 py-0.5 font-mono text-[11px] font-extrabold', cu?.status === 'active' ? 'bg-up/12 text-up' : cu?.status === 'lapsed' ? 'bg-down/12 text-down' : 'bg-ink/[0.07] text-ink/60')}>{cu?.status === 'active' ? 'STILL EXISTS ✓' : cu?.status === 'lapsed' ? 'LAPSED' : 'NO CHECK-IN YET'}</span></div>
      <p className="mt-3 text-[28px] font-extrabold tnum">{cu?.matched90d ?? 0}<span className="ml-1 text-[14px] text-ink/55">check-ins · 90d</span></p>
      <p className="mt-1 text-[13px] font-semibold text-ink/60">{cu?.last ? `Last re-photographed ${timeAgo(cu.last)}. The AI matched it to the original scan.` : 'The creator hasn’t re-photographed the object yet.'}</p>
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] font-bold text-ink/55"><ShieldCheck size={13}/>A check-in every 30 days keeps the status active.</p>
    </div>
  </section>;
}
