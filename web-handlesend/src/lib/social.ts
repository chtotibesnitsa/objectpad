import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeFunctionData, erc20Abi, formatUnits, type Address, type Hex } from 'viem';
import { api, API_BASE, RequestError } from './api';
import { useSession } from './session';
import { useAccount, linkSessionWallet, ACCOUNT_KEY } from './account';
import { devWallets } from './devWallet';
import { chain, prepareTx, waitForReceipt } from './chain';
import { useSigner, type Signer } from './wallet';

/** Public identity shown on every message, activity row and profile link. */
export interface SocialUser { username: string; avatar: string | null; x: string | null; }
export interface SocialWallet { address: string; kind: 'account' | 'linked'; }
export interface SocialMe { username: string | null; bio: string; avatar: string | null; customAvatar: boolean; joinedAt: number | null; x: { handle: string; avatar: string } | null; wallets: SocialWallet[]; unread: number; pendingTips: number; escrow: string; operator: boolean; }
export interface ChatTip { amount: string; symbol: string; decimals: number; to: SocialUser | null; state: string; }
export interface ChatMessage { seq: number; id: string; kind: 'text' | 'tip' | 'rain' | 'system'; text: string; createdAt: number; user: SocialUser | null; ref: string | null; tip: ChatTip | null; }
export interface Rain { id: string; by: SocialUser | null; source: 'escrow' | 'treasury'; asset: string; symbol: string; decimals: number; amount: string; slots: number; joined: number; recent: SocialUser[]; state: 'open' | 'distributing' | 'done' | 'refunding' | 'refunded' | 'expired'; message: string; createdAt: number; closesAt: number; fundHash: string | null; you: boolean; yourShare: string | null; yourHash: string | null; paid: number; own: boolean; }
export interface ChatPage { items: ChatMessage[]; rains: Rain[]; hidden: string[]; cursor: number; }
export interface Notice { id: string; kind: string; actor: SocialUser | null; text: string; link: string | null; ref: string | null; read: boolean; createdAt: number; }
export interface Tip { id: string; from: SocialUser | null; to: SocialUser | null; asset: string; symbol: string; decimals: number; amount: string; state: string; note: string; fundHash: string; payoutHash: string | null; toWallet: string | null; createdAt: number; decidedAt: number | null; expiresAt: number; incoming: boolean; }
export interface ActivityItem { id: string; kind: 'buy' | 'sell' | 'launch' | 'burn' | 'tip' | 'rain' | 'claim'; at: number; symbol?: string; path?: string; eth?: number; tokens?: number; feeEth?: number; amount?: string; decimals?: number; wallet?: string; user: SocialUser | null; to?: SocialUser | null; hash: string | null; slots?: number; state?: string; }
export interface Holding { token: string; symbol: string; path: string; balance: string; priceEth: number; }
export interface Position { curve: string; symbol: string; path: string; boughtEth: number; soldEth: number; holding: number; holdingEth: number; pnlEth: number; }
export interface PublicProfile extends SocialUser { bio: string; joinedAt: number; wallets: SocialWallet[]; stats: { tipsReceived: number; tipsSent: number; rainsFunded: number; messages: number }; pnl: { boughtEth: number; soldEth: number; holdingEth: number; pnlEth: number; positions: Position[] }; coins: { objectId: string; symbol: string; name: string; thumbnail: string; path: string; token: string | null; curve: string | null; launchedAt: number | null; priceEth: number; marketCapEth: number }[]; trades: { side: 'buy' | 'sell'; eth: number; tokens: number; hash: string; at: number; wallet: string; symbol: string; path: string }[]; }

export const SOCIAL_ME = ['objectpad', 'social', 'me'] as const;
export const RAIN_SLOTS = [5, 10, 25, 50, 100] as const;

/** Friendly copy for every social error code. */
const SOCIAL_ERRORS: Record<string, string> = {
  USERNAME_INVALID: 'Use 3–20 letters, numbers or underscores.',
  USERNAME_TAKEN: 'That username is taken. Try another.',
  USERNAME_RESERVED: 'That username is reserved.',
  USERNAME_REQUIRED: 'Pick a username first.',
  CHAT_ADDRESS_BLOCKED: 'Wallet addresses can’t be posted in chat (it stops scams). Use Tip to send funds to someone.',
  CHAT_LINK_BLOCKED: 'Only objectpad.fun and x.com links can be posted in chat.',
  MESSAGE_INVALID: 'Messages are 1–400 characters.',
  RATE_LIMITED: 'Slow down a little, then try again.',
  TIP_SELF: 'You can’t tip yourself.',
  USER_NOT_FOUND: 'No ObjectPad user has that username.',
  DEPOSIT_NOT_YOURS: 'That wallet isn’t linked to your account yet.',
  DEPOSIT_NOT_FOUND: 'The deposit didn’t reach the escrow. Nothing was recorded.',
  DEPOSIT_USED: 'That transaction already funded a tip or rain.',
  TIP_DECIDED: 'This tip was already decided.',
  WALLET_NOT_LINKED: 'Pick one of your linked wallets.',
  RAIN_CLOSED: 'This rain already closed.',
  RAIN_FULL: 'This rain is full.',
  RAIN_JOINED: 'You’re already inside this rain.',
  RAIN_NETWORK_JOINED: 'Someone on your network already joined this rain.',
  RAIN_OWN: 'You funded this rain, so you can’t join it.',
  RAIN_TOO_SMALL: 'Rains need at least 0.0005 ETH (or one unit per person).',
  NO_WALLET: 'Your account has no wallet yet. Open Settings to link one.',
  SIGN_IN_REQUIRED: 'Sign in to do that.',
  SPONSOR_EMPTY: 'The treasury doesn’t hold enough ETH for that rain.',
};
export function socialError(error: unknown): string {
  if (error instanceof RequestError) return SOCIAL_ERRORS[error.code] ?? error.message;
  if (error instanceof Error) return /user rejected|denied/i.test(error.message) ? 'You cancelled the transaction in your wallet.' : error.message.slice(0, 160);
  return 'Something went wrong. Try again.';
}

/** Formats a raw token amount for display. */
export function amountLabel(amount: string | bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(typeof amount === 'string' ? BigInt(amount) : amount, decimals));
  const text = n === 0 ? '0' : n < 0.0001 ? '<0.0001' : n >= 10_000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : n.toLocaleString('en', { maximumFractionDigits: n < 1 ? 5 : 3 });
  return `${text} ${symbol}`;
}

/**
 * The signed-in person's social identity, notifications and chat state, shared app-wide. Also drives the username gate:
 * `needsUsername` is true right after sign-up until a username is saved.
 */
export const [SocialProvider, useSocial] = createContextHook(() => {
  const session = useSession(); const qc = useQueryClient();
  const me = useQuery({ queryKey: SOCIAL_ME, enabled: session.authenticated, queryFn: async () => api<SocialMe>('/social/me', { token: await session.token(), timeout: 30_000 }), refetchInterval: 20_000, staleTime: 8_000, retry: 2 });
  const [chatOpen, setChatOpenState] = useState<boolean>(() => { try { return localStorage.getItem('objectpad.chat.open') !== '0'; } catch { return true; } });
  const setChatOpen = useCallback((open: boolean) => { setChatOpenState(open); try { localStorage.setItem('objectpad.chat.open', open ? '1' : '0'); } catch { /* ignore */ } }, []);
  const [tipTarget, setTipTarget] = useState<string | null>(null);
  const [rainOpen, setRainOpen] = useState<boolean>(false);
  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: ['objectpad', 'social'] }); }, [qc]);
  const needsUsername = session.authenticated && me.isSuccess && !me.data.username;
  const requireUser = useCallback((): boolean => { if (!session.authenticated) { session.login(); return false; } return Boolean(me.data?.username); }, [session, me.data]);
  return { me: me.data ?? null, meLoading: session.authenticated && me.isPending, needsUsername, signedIn: session.authenticated, chatOpen, setChatOpen, tipTarget, openTip: setTipTarget, rainOpen, setRainOpen, refresh, requireUser };
});

/** Live global chat, polled every 2.5s from the last seen message. */
export function useChat() {
  const session = useSession(); const [messages, setMessages] = useState<ChatMessage[]>([]); const [rains, setRains] = useState<Rain[]>([]); const cursor = useRef<number>(0); const [loaded, setLoaded] = useState<boolean>(false); const [failed, setFailed] = useState<boolean>(false);
  const poll = useCallback(async () => {
    try {
      const token = session.authenticated ? await session.token() : null;
      const page = await api<ChatPage>(`/social/chat${cursor.current ? `?after=${cursor.current}` : ''}`, { token, timeout: 15_000 });
      setRains(page.rains); setFailed(false);
      if (page.items.length || page.hidden.length) setMessages(prev => { const seen = new Set(prev.map(m => m.id)); const merged = [...prev.filter(m => !page.hidden.includes(m.id)), ...page.items.filter(m => !seen.has(m.id))]; return merged.slice(-200); });
      cursor.current = Math.max(cursor.current, page.cursor); setLoaded(true);
    } catch { setFailed(true); setLoaded(true); }
  }, [session]);
  useEffect(() => { cursor.current = 0; setMessages([]); void poll(); const id = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 2500); return () => clearInterval(id); }, [poll, session.authenticated]);
  const send = useMutation({ mutationFn: async (text: string) => api<{ seq: number }>('/social/chat', { token: await session.token(), method: 'POST', body: { text } }), onSuccess: () => void poll() });
  return { messages, rains, loaded, failed, send, poll };
}

/** Everything happening on ObjectPad, newest first. */
export function useActivity(enabled: boolean) {
  return useQuery({ queryKey: ['objectpad', 'social', 'activity'], enabled, queryFn: async () => (await api<{ items: ActivityItem[] }>('/social/activity')).items, refetchInterval: 5_000, staleTime: 3_000 });
}

/** @mention autocomplete: up to 10 real usernames that start with the typed letters. */
export function useUserSearch(q: string | null) {
  return useQuery({ queryKey: ['objectpad', 'social', 'users', q ?? ''], enabled: q !== null, queryFn: async () => (await api<{ items: SocialUser[] }>(`/social/users?q=${encodeURIComponent(q ?? '')}`)).items, staleTime: 20_000, placeholderData: prev => prev });
}

export function useProfile(username: string) {
  return useQuery({ queryKey: ['objectpad', 'social', 'profile', username.toLowerCase()], queryFn: async () => api<PublicProfile>(`/social/users/${encodeURIComponent(username)}`, { timeout: 30_000 }), refetchInterval: 30_000, retry: false });
}

export function useNotifications(enabled: boolean) {
  const session = useSession();
  return useQuery({ queryKey: ['objectpad', 'social', 'notifications'], enabled: enabled && session.authenticated, queryFn: async () => api<{ items: Notice[]; unread: number }>('/social/notifications', { token: await session.token() }), refetchInterval: 15_000 });
}
export function useTips(enabled: boolean) {
  const session = useSession();
  return useQuery({ queryKey: ['objectpad', 'social', 'tips'], enabled: enabled && session.authenticated, queryFn: async () => api<{ incoming: Tip[]; outgoing: Tip[] }>('/social/tips', { token: await session.token() }), refetchInterval: 10_000 });
}
export function useHoldings(wallet: string | null) {
  return useQuery({ queryKey: ['objectpad', 'social', 'holdings', wallet], enabled: Boolean(wallet), queryFn: async () => (await api<{ items: Holding[] }>(`/social/holdings/${wallet}`)).items, staleTime: 15_000 });
}

/** Wallets this browser can sign with right now (signed-in wallet such as MetaMask, plus every on-site wallet), with live ETH balances. */
export function useSendWallets() {
  const session = useSession(); const signerFor = useSigner();
  const list = useMemo(() => { const out: { address: string; label: string; kind: 'session' | 'device' }[] = []; if (session.wallet) out.push({ address: session.wallet.toLowerCase(), label: 'Signed-in wallet', kind: 'session' }); devWallets().forEach((w, i) => { if (!out.some(o => o.address === w.address.toLowerCase())) out.push({ address: w.address.toLowerCase(), label: w.label ?? (i === 0 ? 'On-site wallet' : `On-site wallet ${i + 1}`), kind: 'device' }); }); return out; }, [session.wallet]);
  const balances = useQuery({ queryKey: ['objectpad', 'social', 'send-balances', list.map(w => w.address).join(',')], enabled: list.length > 0, queryFn: async () => Object.fromEntries(await Promise.all(list.map(async w => [w.address, (await chain.getBalance({ address: w.address as Address }).catch(() => 0n)).toString()] as const))), refetchInterval: 20_000 });
  return { list, balances: balances.data ?? {}, signerFor };
}

/** One deposit into the escrow: makes sure the sending wallet is linked (one signature), sends ETH or a coin, waits for it. */
export function useDeposit() {
  const session = useSession(); const account = useAccount(); const qc = useQueryClient();
  return useCallback(async (signer: Signer, escrow: string, asset: string, amount: bigint, onStep: (s: 'linking' | 'sending' | 'confirming') => void): Promise<Hex> => {
    const me = account.data; const addr = signer.address.toLowerCase();
    if (me && !me.wallets.some(w => w.address === addr)) {
      onStep('linking');
      if (signer.kind === 'session') await linkSessionWallet(await session.token(), signer.address, me.publicId, session.sign);
      else { const { linkDevWallet } = await import('./account'); const { findDevWallet } = await import('./devWallet'); const w = findDevWallet(addr); if (w) await linkDevWallet(await session.token(), w, me.publicId); }
      await qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
    }
    onStep('sending');
    const tx = asset === 'eth' ? await prepareTx(signer.address, { to: escrow as Address, data: '0x', value: amount }) : await prepareTx(signer.address, { to: asset as Address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [escrow as Address, amount] }) });
    const hash = await signer.send(tx); onStep('confirming'); await waitForReceipt(hash); return hash;
  }, [session, account.data, qc]);
}

/** Uploads a profile picture (downscaled square JPEG made in the browser). */
export async function uploadAvatar(token: string | null, file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file); const size = 512; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser can’t process images.');
  const s = Math.min(bitmap.width, bitmap.height); ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88)); if (!blob) throw new Error('The image could not be read.');
  const response = await fetch(`${API_BASE}/social/avatar`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: blob, credentials: 'omit' });
  const data = await response.json() as { avatar?: string | null; error?: string };
  if (!response.ok) throw new RequestError(data.error ?? 'AVATAR_FAILED', data.error ?? 'AVATAR_FAILED', response.status);
  return data.avatar ?? null;
}

/** Splits chat text into plain text and @mention tokens for rendering. */
export function mentionParts(text: string): { text: string; mention: boolean }[] {
  const out: { text: string; mention: boolean }[] = []; let last = 0;
  for (const m of text.matchAll(/@([A-Za-z0-9_]{3,20})/g)) { const i = m.index ?? 0; if (i > last) out.push({ text: text.slice(last, i), mention: false }); out.push({ text: m[0], mention: true }); last = i + m[0].length; }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out;
}
