import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const KEY = 'objectpad.devwallet.v1';
const EXTRA = 'objectpad.devwallets.extra.v1';

/** A creator wallet generated in this browser for account-free launches. Its key never leaves the device. */
export interface DevWallet { address: string; privateKey: `0x${string}`; createdAt: number; label?: string; }

const valid = (w: DevWallet | null | undefined): w is DevWallet => Boolean(w && /^0x[a-fA-F0-9]{64}$/.test(w.privateKey));

/** Returns this device's primary dev wallet, if one exists. */
export function devWallet(): DevWallet | null {
  try { const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DevWallet | null; return valid(saved) ? saved : null; } catch { return null; }
}

/**
 * Creates (once) the on-site dev wallet that receives a guest's creator rewards. Generated locally with a secure
 * random key and stored only in this browser; the server only ever sees the public address.
 */
export function ensureDevWallet(): DevWallet {
  const existing = devWallet(); if (existing) return existing;
  const privateKey = generatePrivateKey(); const wallet: DevWallet = { address: privateKeyToAccount(privateKey).address, privateKey, createdAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(wallet)); } catch { /* private mode: wallet lives for this page only */ }
  return wallet;
}

/** Every on-site wallet this browser holds: the primary one first, then any extra wallets the creator added. */
export function devWallets(): DevWallet[] {
  let extra: DevWallet[] = []; try { extra = (JSON.parse(localStorage.getItem(EXTRA) ?? '[]') as DevWallet[]).filter(valid); } catch { extra = []; }
  const primary = devWallet(); return primary ? [primary, ...extra.filter(w => w.address.toLowerCase() !== primary.address.toLowerCase())] : extra;
}

/** Adds another on-site wallet (fresh key, generated locally) so a creator can buy and tip from several wallets. */
export function addDevWallet(label?: string): DevWallet {
  if (!devWallet()) return ensureDevWallet();
  const privateKey = generatePrivateKey(); const wallet: DevWallet = { address: privateKeyToAccount(privateKey).address, privateKey, createdAt: Date.now(), ...(label ? { label: label.slice(0, 24) } : {}) };
  const list = devWallets().slice(1); list.push(wallet);
  try { localStorage.setItem(EXTRA, JSON.stringify(list)); } catch { /* ignore */ }
  return wallet;
}

/** Finds the on-site wallet for an address, if its key lives in this browser. */
export function findDevWallet(address: string): DevWallet | null { const a = address.toLowerCase(); return devWallets().find(w => w.address.toLowerCase() === a) ?? null; }
