/** Display helpers. Every figure they format comes from the ObjectPad API or Robinhood Chain; nothing is estimated here. */
export const TOTAL_SUPPLY = 1_000_000_000;

export function usd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `$${(value / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${value.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
  return tinyUsd(value);
}

/** Tiny token prices with a subscript zero count, trading-terminal style: $0.0₅412. */
export function tinyUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  const zeros = Math.floor(-Math.log10(value));
  const digits = Math.round(value * 10 ** (zeros + 3)).toString().slice(0, 3);
  const subscript = String(zeros - 1).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
  return `$0.0${subscript}${digits}`;
}

export function eth(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '0 ETH';
  if (value < 10 ** -digits) return `<${10 ** -digits} ETH`;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })} ETH`;
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
}

export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function shortAddress(value: string | null | undefined, lead = 6, tail = 4): string {
  if (!value) return '—';
  return value.length > lead + tail + 1 ? `${value.slice(0, lead)}…${value.slice(-tail)}` : value;
}

export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60); if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export async function copyText(value: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
}
