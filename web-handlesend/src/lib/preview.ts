import { demoHash, demoTag, exhibitById, exhibitSpecs, type MemeExhibit } from './memes';

/**
 * Specimen coins: fully rendered coin pages for lab specimens (real 3D scans of meme objects) that show how a launched
 * object coin works (chart, holders, trades, fee treasury, launch receipt). Their markets are simulated
 * deterministically per ticker, never mixed into live totals, and trading on them is disabled; the coin page says so.
 */
export interface PreviewTrade { id: string; side: 'buy' | 'sell'; eth: number; tokens: number; price: number; trader: string; hash: string; at: number; }
export interface PreviewHolder { address: string; share: number; since: number; label?: string; }
export interface PreviewCoin {
  ticker: string; name: string; exhibit: MemeExhibit; tag: string; objectId: string; token: string; curve: string; creator: string;
  launchedAt: number; priceEth: number; marketCapEth: number; change24h: number; volume24hEth: number; volumeEth: number;
  holders: PreviewHolder[]; holderCount: number; trades: PreviewTrade[]; progress: number;
  fees: { burnEth: number; creatorEth: number; holdersEth: number }; launchTx: string; specs: string; story: string;
}

const SEEDS: { id: string; ticker: string; name: string; cap: number; growth: number; hours: number; story: string }[] = [
  { id: 'pepe', ticker: 'PEPE', name: 'Smug Frog', cap: 31.6, growth: 28, hours: 74, story: 'The frog from my desk. Been there since 2016. Feels good to finally put him on-chain.' },
  { id: 'bull', ticker: 'LASER', name: 'Laser Bull', cap: 17.2, growth: 19, hours: 61, story: 'Gold bull, laser eyes, bought it the day we broke the high. It never faces down.' },
  { id: 'fine', ticker: 'FINE', name: 'This Is Fine', cap: 11.4, growth: 15, hours: 55, story: 'Every red day I look at this dog and drink my coffee. Everything is fine.' },
  { id: 'wojak', ticker: 'WOJAK', name: 'Wojak Bust', cap: 7.9, growth: 11, hours: 46, story: 'He bought the top so you didn’t have to. Resin, one of one, slightly sad.' },
  { id: 'duck', ticker: 'QUACK', name: 'Rubber Duck', cap: 5.3, growth: 9, hours: 38, story: 'My debugging duck. Survived three startups and one bath.' },
  { id: 'mug', ticker: 'GM', name: 'GM Mug', cap: 3.1, growth: 6, hours: 30, story: 'Every morning, same mug, same word. gm.' },
  { id: 'rock', ticker: 'ROCK', name: 'Pet Rock', cap: 2.2, growth: 5, hours: 24, story: 'Found on a beach in 2019. Never sold anything. Wearing grandma’s scarf.' },
  { id: 'sneaker', ticker: 'KICKS', name: 'Retro Kicks', cap: 1.4, growth: 3.4, hours: 16, story: 'My grail high-tops. Worn twice. Scanned once.' },
];

function rng(seed: string) { let s = 0; for (const ch of seed) s = (Math.imul(s, 31) + ch.charCodeAt(0)) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const HOUR = 3_600_000;

function build(seed: (typeof SEEDS)[number], now: number): PreviewCoin {
  const exhibit = exhibitById(seed.id)!; const rand = rng(seed.ticker); const launchedAt = now - seed.hours * HOUR;
  const count = 420 + Math.floor(rand() * 220); const end = seed.cap / 1e9; const start = end / seed.growth;
  const walk: number[] = []; let v = 0; for (let i = 0; i < count; i++) { v += (rand() - 0.46) * 0.16; walk.push(v); }
  const drift = walk.map((w, i) => w - walk[count - 1] * (i / (count - 1))); const span = Math.log(end / start);
  const trades: PreviewTrade[] = walk.map((_, i) => {
    const price = start * Math.exp(span * (i / (count - 1)) + drift[i] * 0.18 * Math.sin((i / count) * Math.PI) + (rand() - 0.5) * 0.09);
    const side: 'buy' | 'sell' = rand() < 0.66 ? 'buy' : 'sell'; const eth = 0.004 + rand() ** 3 * 0.9;
    return { id: `${seed.ticker}-${i}`, side, eth, tokens: eth / price, price, trader: `0x${demoHash(`${seed.ticker}-t-${Math.floor(rand() * 40)}`, 40)}`, hash: `0x${demoHash(`${seed.ticker}-h-${i}`, 64)}`, at: launchedAt + (i / (count - 1)) * (now - launchedAt - 60_000) };
  });
  trades[trades.length - 1].price = end;
  const dayAgo = trades.find(t => t.at >= now - 24 * HOUR) ?? trades[0]; const volumeEth = trades.reduce((s, t) => s + t.eth, 0);
  const volume24hEth = trades.filter(t => t.at >= now - 24 * HOUR).reduce((s, t) => s + t.eth, 0);
  const progress = Math.min(0.97, seed.cap / 24); const curveShare = (1 - progress) * 0.86;
  const shares = Array.from({ length: 14 }, (_, i) => (0.55 ** i) * (0.7 + rand() * 0.6)); const total = shares.reduce((a, b) => a + b, 0);
  const holders: PreviewHolder[] = [{ address: `0x${demoHash(`${seed.ticker}-curve`, 40)}`, share: curveShare, since: launchedAt, label: 'Bonding curve' }, ...shares.map((s, i) => ({ address: `0x${demoHash(`${seed.ticker}-holder-${i}`, 40)}`, share: (s / total) * (1 - curveShare), since: launchedAt + rand() ** 2 * (now - launchedAt) * 0.9, label: i === 0 ? 'Creator' : undefined }))];
  const objectId = demoHash(`${exhibit.id}-object`, 64);
  return {
    ticker: seed.ticker, name: seed.name, exhibit, tag: demoTag(exhibit), objectId, token: `0x${demoHash(`${seed.ticker}-token`, 40)}`, curve: `0x${demoHash(`${seed.ticker}-curve`, 40)}`, creator: holders[1].address,
    launchedAt, priceEth: end, marketCapEth: seed.cap, change24h: ((end - dayAgo.price) / dayAgo.price) * 100, volume24hEth, volumeEth,
    holders, holderCount: 40 + Math.floor(seed.cap * 23 + rand() * 30), trades, progress,
    fees: { burnEth: volumeEth * 0.005, creatorEth: volumeEth * 0.005, holdersEth: volumeEth * 0.005 },
    launchTx: `0x${demoHash(`${seed.ticker}-launch`, 64)}`, specs: exhibitSpecs(exhibit), story: seed.story,
  };
}

let cache: { at: number; coins: PreviewCoin[] } | null = null;
/** All preview listings, rebuilt at most once a minute so their clocks stay current. */
export function previewCoins(): PreviewCoin[] {
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  if (!cache || cache.at !== now) cache = { at: now, coins: SEEDS.map(seed => build(seed, now)) };
  return cache.coins;
}
export const previewCoin = (ticker: string): PreviewCoin | undefined => previewCoins().find(c => c.ticker.toLowerCase() === ticker.toLowerCase());
