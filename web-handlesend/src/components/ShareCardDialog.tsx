import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Download, ExternalLink, ImageDown, LoaderCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { renderShareCard, type ShareCardInput } from '@/lib/shareCard';
import { copyText } from '@/lib/format';

/**
 * The FOMO share card: renders "REAL OBJECT → 3D SCAN → $COIN" client-side, lets the creator save it,
 * or post it straight to X (the image downloads for the X composer since X's intent can't attach files directly).
 */
export function ShareCardDialog({ open, onOpenChange, input, url, postText }: { open: boolean; onOpenChange: (open: boolean) => void; input: ShareCardInput; url: string; postText: string }) {
  const canvasRef = useRef<HTMLDivElement>(null); const [copied, setCopied] = useState<boolean>(false);
  const render = useMutation({ mutationFn: () => renderShareCard(input) });
  const { mutate: run } = render;
  useEffect(() => { if (!open) return; run(); }, [open, run]);
  useEffect(() => {
    const canvas = render.data; const host = canvasRef.current; if (!canvas || !host) return;
    host.innerHTML = ''; canvas.style.width = '100%'; canvas.style.borderRadius = '20px'; host.appendChild(canvas);
  }, [render.data]);
  const download = () => { const canvas = render.data; if (!canvas) return; const a = document.createElement('a'); a.download = `${input.symbol.toLowerCase()}-objectpad.png`; a.href = canvas.toDataURL('image/png'); a.click(); };
  const postOnX = () => { download(); window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${postText}\n\n${url}`)}`, '_blank', 'noreferrer'); };
  return <Dialog open={open} onOpenChange={onOpenChange} title="Share your launch" description="A branded card for X, made from your real object. Downloads automatically so you can attach it to your post.">
    <div className="overflow-hidden rounded-[20px] bg-ink/5">
      {render.isPending ? <div className="flex aspect-[1200/630] items-center justify-center text-sm font-semibold text-ink/60"><LoaderCircle size={18} className="mr-2 animate-spin"/>Building your card…</div>
        : render.isError ? <div className="flex aspect-[1200/630] items-center justify-center px-6 text-center text-sm font-semibold text-down">Couldn’t render the card on this device.</div>
        : <div ref={canvasRef}/>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button onClick={download} disabled={!render.data} className="btn-ghost press min-h-12 text-[13px] disabled:opacity-40"><Download size={14}/>Save image</button>
      <button onClick={postOnX} disabled={!render.data} className="btn press min-h-12 text-[13px] disabled:opacity-40"><ImageDown size={14}/>Post to X</button>
    </div>
    <button onClick={() => void copyText(url).then(ok => ok && (setCopied(true), setTimeout(() => setCopied(false), 1600)))} className="sunk press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-bold text-ink/70">{copied ? <><Check size={14}/>Link copied</> : <><ExternalLink size={14}/>Copy coin link</>}</button>
    <p className="mt-2 text-center text-[11px] font-semibold text-ink/50">X posts can’t attach images automatically — the card saves to your device, so just paste it into the post that opens.</p>
  </Dialog>;
}
