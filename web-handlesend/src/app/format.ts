/** Number, money, address and time formatting shared by every screen (the iOS app's `Fmt`). */
export const Fmt = {
  usd(v: number | null | undefined, digits = 2): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (a >= 10_000) return `$${(v / 1_000).toFixed(1)}K`;
    if (a > 0 && a < 0.01) return `$${v.toFixed(6)}`;
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: a >= 1000 ? 0 : digits, maximumFractionDigits: a >= 1000 ? 0 : digits });
  },
  money(v: number): string { return `$${Math.round(v).toLocaleString('en-US')}`; },
  eth(v: number | null | undefined, digits = 4): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—'; if (v === 0) return '0 ETH';
    if (v < 10 ** -digits) return `<${10 ** -digits} ETH`; return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ETH`;
  },
  /** ETH value in USD when the live rate is known, else ETH. */
  value(ethValue: number, ethUsd: number | null | undefined): string { return ethUsd ? Fmt.usd(ethValue * ethUsd) : Fmt.eth(ethValue); },
  price(ethValue: number, ethUsd: number | null | undefined): string {
    if (!(ethValue > 0)) return '—';
    if (ethUsd) { const u = ethValue * ethUsd; return u >= 0.01 ? Fmt.usd(u, 4) : `$${u.toExponential(2)}`; }
    return `${ethValue.toPrecision(3)} ETH`;
  },
  compact(v: number): string { return Number.isFinite(v) ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v) : '—'; },
  pct(v: number): string { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`; },
  short(s: string | null | undefined, lead = 6, tail = 4): string { if (!s) return ''; return s.length > lead + tail + 1 ? `${s.slice(0, lead)}…${s.slice(-tail)}` : s; },
  ago(ms: number): string {
    if (!(ms > 0)) return ''; const s = Math.max(0, Date.now() / 1000 - ms / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86_400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86_400)}d ago`;
  },
  /** Wei (bigint) to a trimmed decimal string. */
  units(wei: bigint, digits = 5, decimals = 18): string {
    const neg = wei < 0n; const v = neg ? -wei : wei; const base = 10n ** BigInt(decimals); const whole = v / base; const frac = (v % base).toString().padStart(decimals, '0').slice(0, digits).replace(/0+$/, '');
    return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
  },
  toNum(wei: bigint, decimals = 18): number { return Number(wei) / 10 ** decimals; },
};

export type Tier = 'none' | 'calm' | 'soon' | 'urgent' | 'ended';
/** Deadline countdown with an urgency tier (urgent < 24h, soon < 3d). */
export function countdownOf(deadline: number | null | undefined, now: number): { label: string; tier: Tier } {
  if (!deadline || deadline <= 0) return { label: 'Until won', tier: 'none' };
  const ms = deadline - now; if (ms <= 0) return { label: 'Ended', tier: 'ended' };
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return { label: d >= 1 ? `${d}d ${p(h)}h ${p(m)}m` : `${p(h)}:${p(m)}:${p(s)}`, tier: ms < 86_400_000 ? 'urgent' : ms < 3 * 86_400_000 ? 'soon' : 'calm' };
}
