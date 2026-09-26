import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Download, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { renderRewardCard } from '@/lib/rewardCard';
import { rewardUrl, type Reward, type RewardProof } from '@/lib/rewards';
import { copyText } from '@/lib/format';

function XGlyph() { return <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }

/** Post text for a bounty; winner variant once it's paid. Only real facts from the bounty. */
export function rewardPostText(r: Reward, winner?: RewardProof | null): string {
  const usd = `$${r.rewardUsd.toLocaleString('en-US')}`;
  if (r.status === 'paid') return `PAID: ${r.title}. ${usd} sent${winner?.handle ? ` to @${winner.handle}` : ''} on-chain via @ObjectPadFun Paid Rewards.\n\nFind it. Scan it. Get paid.`;
  return `${usd} bounty on @ObjectPadFun: ${r.title}.\n\n${r.tagline}\n\nFirst valid proof gets paid${r.kind === 'community' ? ' from escrow' : ''}.`;
}

/** Share card dialog: bounty card while open, "winner paid" proof card once settled. */
export function RewardShare({ reward, winner, open, onOpenChange }: { reward: Reward; winner?: RewardProof | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null); const [copied, setCopied] = useState<boolean>(false);
  const render = useMutation({ mutationFn: () => renderRewardCard(reward, winner) }); const { mutate } = render;
  useEffect(() => { if (open) mutate(); }, [open, mutate]);
  useEffect(() => { const c = render.data; const h = host.current; if (!c || !h) return; h.innerHTML = ''; c.style.width = '100%'; c.style.display = 'block'; h.appendChild(c); }, [render.data]);
  const url = rewardUrl(reward.id);
  const save = () => { const c = render.data; if (!c) return; const a = document.createElement('a'); a.download = `objectpad-reward-${reward.id.slice(0, 12)}.png`; a.href = c.toDataURL('image/png'); a.click(); };
  const post = () => { save(); window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${rewardPostText(reward, winner)}\n\n${url}`)}`, '_blank', 'noreferrer'); };
  return <Dialog open={open} onOpenChange={onOpenChange} title={reward.status === 'paid' ? 'Share the win' : 'Share this bounty'} description="A card made from this bounty's real data. It saves to your device so you can attach it to your X post.">
    <div className="overflow-hidden rounded-[20px] bg-ink/5">
      {render.isPending || !render.data ? <div className="flex aspect-[16/9] items-center justify-center text-sm font-semibold text-ink/60">{render.isError ? 'Couldn’t draw the card on this device.' : <><LoaderCircle size={18} className="mr-2 animate-spin"/>Rendering card…</>}</div> : <div ref={host}/>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button onClick={save} disabled={!render.data} className="btn-ghost press min-h-12 text-[13px] disabled:opacity-40"><Download size={14}/>Save image</button>
      <button onClick={post} disabled={!render.data} className="btn press min-h-12 text-[13px] disabled:opacity-40"><XGlyph/>Post to X</button>
    </div>
    <button onClick={() => void copyText(url).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); } })} className="sunk press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-bold text-ink/70">{copied ? <><Check size={14}/>Link copied</> : <><Copy size={14}/>Copy bounty link</>}</button>
  </Dialog>;
}
