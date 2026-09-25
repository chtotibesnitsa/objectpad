import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const KEY = 'objectpad.devwallet.v1';

/** A creator wallet generated in this browser for account-free launches. Its key never leaves the device. */
export interface DevWallet { address: string; privateKey: `0x${string}`; createdAt: number; }

/** Returns this device's dev wallet, if one exists. */
export function devWallet(): DevWallet | null {
  try { const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DevWallet | null; return saved && /^0x[a-fA-F0-9]{64}$/.test(saved.privateKey) ? saved : null; } catch { return null; }
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
