import { useMemo } from 'react';
import { Clock, ScanLine } from 'lucide-react';
import { useApp } from '../store';
import { Fmt } from '../format';
import { Sheet, SheetHeader } from '../chrome';
import { MergeAnimation } from '../pairs';
import { CoinAvatar, Display, Lab, PadButton, PAD } from '../ui';

export const APP_NOTES: [string, string, string][] = [
  ['New', 'ObjectPad for iPhone, as a web app', 'Add ObjectPad to your iPhone home screen straight from objectpad.fun: the full iOS app, with every screen, animation, sound and wallet feature, free and without the App Store. Use it while the native app is in App Store review.'],
  ['New', 'Stock pairing at launch', 'Pair your coin with any tokenized stock, ETF, commodity or asset Pons V2 approves: NVDA, TSLA, AAPL, SPCX, GME, SPY, GLD, USDG, cbBTC and more. ETH is still the default.'],
  ['New', 'AI pair suggestion', 'After your scan, the AI suggests the stock whose story fits your object. One tap to use it, or keep ETH.'],
  ['New', 'Pay with ETH for paired coins', 'Buying a stock-paired coin routes your ETH through Uniswap V3 on Robinhood Chain into the pair asset, then into the curve.'],
  ['New', 'Pairs across the market', 'Every coin shows what it’s paired with, with the company logo and the asset’s live move.'],
  ['Improved', 'Launch from your phone, no QR code', 'Desktop QR pages and the downloads page now link the iPhone web app and the Android app, so you can scan and launch right on your phone.'],
  ['Shipped', 'ObjectPad for iPhone', 'Native iOS app in TestFlight and submitted for App Store review.'],
];
const STATUS: [string, string, string][] = [['Web app', PAD.up, 'V2 live'], ['iPhone web app', PAD.up, 'Add to Home Screen'], ['Android', PAD.up, 'V2 pairing'], ['iOS App Store', PAD.gold, 'In review'], ['Launch engine', PAD.up, 'ETH & stock pairs']];
const ROADMAP: [string, string][] = [['iOS on the App Store', 'Public release once Apple review clears.'], ['One-signature paired buys', 'Swap, approve and buy in a single confirmation.'], ['Pair performance leaderboard', 'Which stocks carry the strongest object coins.'], ['Crafting Table', 'Combine object coins into new, rarer objects.']];

/** ObjectPad V2 release notes and developer log, opened from the gold V2 pill. */
export default function V2Sheet() {
  const app = useApp(); const close = () => app.setV2(false);
  const movers = useMemo(() => (app.pairs?.assets ?? []).filter(a => ['stock', 'etf', 'commodity'].includes(a.kind) && a.priceUsd !== null).slice(0, 9), [app.pairs]);
  const card = (title: string, children: React.ReactNode) => <div className="ap-raised flex flex-col gap-3 rounded-[24px] p-4"><p className="text-[17px] font-extrabold">{title}</p>{children}</div>;
  return <Sheet open={app.v2} onClose={close}><SheetHeader title="What's new" onDone={close}/><div className="flex flex-col gap-[18px] px-[18px] pt-3">
    <div className="flex flex-col gap-2"><Lab>Release · 26 Sep 2026 · V2.0</Lab><p className="flex items-baseline gap-2"><Display size={38}>ObjectPad</Display><span className="ap-display ap-gold-text text-[38px]">V2</span></p><p className="text-[15.5px] font-semibold text-ink/75">Real objects, now backed by real markets. Pair any scanned object with a tokenized stock and launch it on Robinhood Chain.</p></div>
    {app.v2 && <video src="/trailers/objectpad-v2-launch.mp4" poster="/v2/trailer-poster.webp" autoPlay muted playsInline controls className="aspect-video w-full rounded-[24px] bg-black object-cover"/>}
    <div className="flex flex-col gap-2.5"><Lab>How pairing works</Lab><div className="h-[210px] rounded-[26px] bg-[#ECEEF1] p-2.5"><MergeAnimation/></div></div>
    <PadButton title="Launch a paired coin" icon={ScanLine} onClick={() => { close(); app.startScan(); }}/>
    {card('Release notes', APP_NOTES.map(([tag, t, b]) => <div key={t} className="flex items-start gap-2.5"><span className={`ap-mono flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[9.5px] font-black uppercase ${tag === 'New' ? 'ap-gold' : tag === 'Improved' ? 'bg-ink/[0.07] text-ink/70' : 'bg-[#12A150]/[0.12] text-[#12A150]'}`}>{tag}</span><div><p className="text-[15px] font-extrabold">{t}</p><p className="text-[13px] font-semibold text-[#6A6E78]">{b}</p></div></div>))}
    {card('Platform status', STATUS.map(([n, c, s]) => <div key={n} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: c }}/><span className="flex-1 text-[14.5px] font-extrabold">{n}</span><span className="ap-mono text-[11px] font-bold text-[#6A6E78]">{s}</span></div>))}
    {card('Next few days', ROADMAP.map(([t, b]) => <div key={t} className="flex items-start gap-2.5"><Clock size={16} className="mt-0.5"/><div><p className="text-[14.5px] font-extrabold">{t}</p><p className="text-[12.5px] font-semibold text-[#6A6E78]">{b}</p></div></div>))}
    <div className="flex flex-col gap-2.5"><Lab>Pair assets · priced on-chain</Lab>
      <div className="grid grid-cols-3 gap-2">{movers.map(a => <div key={a.address} className="flex flex-col gap-1 rounded-2xl bg-white p-2.5"><span className="flex items-center gap-1"><CoinAvatar url={a.logo} symbol={a.symbol} size={20}/><span className="truncate text-[13px] font-extrabold">{a.symbol}</span></span><span className="ap-mono text-[11.5px] font-extrabold">{Fmt.usd(a.priceUsd)}</span>{a.change24h !== null && <span className="ap-mono text-[10.5px] font-extrabold" style={{ color: a.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(a.change24h)}</span>}</div>)}</div>
      {!movers.length && <p className="text-[13px] font-semibold text-[#6A6E78]">Reading pair prices from Robinhood Chain…</p>}
    </div>
    <div className="flex flex-col gap-2.5"><Lab>From the build</Lab><div className="ap-scroll -mx-[18px] flex gap-2.5 overflow-x-auto px-[18px]">{['duck_stock_chart_collision', 'duck_stock_coin_fusion', 'duck_coin_chart_pedestal'].map(n => <img key={n} src={`/v2/${n}.webp`} alt="" className="h-[174px] w-[260px] shrink-0 rounded-[20px] object-cover"/>)}</div></div>
    <p className="text-[11px] font-semibold text-[#6A6E78]">Tokenized stocks on Robinhood Chain are issued by third parties. Pairing a coin with an asset gives holders no claim on that asset or company. Not affiliated with Robinhood Markets, Inc., Pons, or any listed company. Not financial advice.</p>
  </div></Sheet>;
}
