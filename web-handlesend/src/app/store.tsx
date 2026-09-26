import createContextHook from '@nkzw/create-context-hook';
import { isNsfwText } from '@/shared/nsfw';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createWalletClient, encodeFunctionData, http, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { api } from '@/lib/api';
import { useCoins } from '@/lib/coins';
import { useMarket, useReadiness } from '@/lib/market';
import { useBurnFeed } from '@/lib/burns';
import { useBuilding } from '@/lib/objects';
import { useRewardBoard } from '@/lib/rewards';
import { usePairs, type PairQuote } from '@/lib/pairs';
import { isEthPair } from '@/shared/pairs';
import { useSession } from '@/lib/session';
import { devWallet, ensureDevWallet, type DevWallet } from '@/lib/devWallet';
import { guestToken, useCreator } from '@/lib/creator';
import { ACCOUNT_KEY, useAccount, type Account } from '@/lib/account';
import { chain, prepareTx, type PreparedTx } from '@/lib/chain';
import { robinhoodChain, ERC20_ABI } from '@/shared/pons';
import type { CaptureSession } from '@/shared/domain';
import { Feedback } from './feedback';

export type Tab = 'home' | 'market' | 'scan' | 'rewards' | 'wallet';
export const TABS: Tab[] = ['home', 'market', 'scan', 'rewards', 'wallet'];
const TAB_ROOT: Record<Tab, string> = { home: '/app/', market: '/app/market', scan: '/app/', rewards: '/app/rewards', wallet: '/app/wallet' };
const DEVKEY = 'objectpad.devwallet.v1';
const LAST_SCAN = 'objectpad.app.lastScan';
const WATCH = 'objectpad.app.watchlist';

/** Anything that can sign and broadcast a Robinhood Chain transaction: the account wallet or this phone's wallet. */
export interface AppSigner { address: Address; kind: 'account' | 'device'; send: (tx: { to: Address; data?: Hex; value?: bigint }) => Promise<Hex>; sendPrepared: (tx: PreparedTx) => Promise<Hex>; }

function tabFor(path: string): Tab | null {
  if (path === '/app' || path === '/app/') return 'home';
  if (path.startsWith('/app/market')) return 'market';
  if (path.startsWith('/app/rewards')) return 'rewards';
  if (path.startsWith('/app/wallet')) return 'wallet';
  return null;
}

/**
 * The whole app's shared state, 1:1 with the iOS AppStore + AccountStore + Router: live market data on the website's
 * intervals, the identity (account wallet or this phone's wallet), watchlist, toast and every sheet or cover.
 */
export const [AppProvider, useApp] = createContextHook(() => {
  const navigate = useNavigate(); const location = useLocation(); const qc = useQueryClient();
  const session = useSession(); const creator = useCreator();
  const coinsQ = useCoins(); const marketQ = useMarket(); const statusQ = useReadiness(); const burnsQ = useBurnFeed(); const buildingQ = useBuilding(); const rewardsQ = useRewardBoard(); const pairsQ = usePairs(); const meQ = useAccount();

  // ── Router ──────────────────────────────────────────────
  const [tab, setTabState] = useState<Tab>(() => tabFor(location.pathname) ?? 'home');
  const lastPath = useRef<Record<Tab, string>>({ ...TAB_ROOT });
  useEffect(() => { const t = tabFor(location.pathname); if (t && t !== tab) setTabState(t); lastPath.current[t ?? tab] = location.pathname + location.search; }, [location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scanning, setScanning] = useState<boolean>(false); const [resumeScan, setResumeScan] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<boolean>(false); const [account, setAccount] = useState<boolean>(false); const [v2, setV2] = useState<boolean>(false); const [creatingReward, setCreatingReward] = useState<boolean>(false); const [install, setInstall] = useState<boolean>(false);
  const selectTab = useCallback((t: Tab) => {
    if (t === 'scan') { setResumeScan(null); setScanning(true); Feedback.play('handoff', 0.35); return; }
    if (t === tab) { navigate(TAB_ROOT[t]); lastPath.current[t] = TAB_ROOT[t]; return; }
    Feedback.play('swoosh', 0.25); setTabState(t); navigate(lastPath.current[t] ?? TAB_ROOT[t]);
  }, [tab, navigate]);
  const push = useCallback((path: string, on?: Tab) => { if (on && on !== tab) setTabState(on); navigate(path); }, [tab, navigate]);
  const startScan = useCallback((resume: string | null = null) => { setResumeScan(resume); setScanning(true); Feedback.play('handoff', 0.35); }, []);

  // ── Toast & watchlist ───────────────────────────────────
  const [toast, setToast] = useState<string | null>(null); const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2000); }, []);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(WATCH) ?? '[]') as string[]); } catch { return new Set(); } });
  const toggleWatch = useCallback((id: string) => { setWatchlist(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); show('Removed from watchlist'); } else { next.add(id); show('Added to watchlist'); } try { localStorage.setItem(WATCH, JSON.stringify([...next])); } catch { /* ignore */ } return next; }); Feedback.selection(); }, [show]);

  // ── Identity ────────────────────────────────────────────
  const [local, setLocal] = useState<DevWallet | null>(() => devWallet());
  const accountWallet = session.authenticated ? session.wallet : null;
  const activeWallet: Address | null = (accountWallet ?? (local?.address as Address | undefined)) ?? null;
  const ensureLocalWallet = useCallback((): Address => { const w = ensureDevWallet(); setLocal(w); return w.address as Address; }, []);
  const importLocalWallet = useCallback((hex: string) => {
    const body = hex.trim().replace(/^0x/i, '').toLowerCase(); if (!/^[a-f0-9]{64}$/.test(body)) throw new Error('That isn’t a valid 64-character private key.');
    const privateKey = `0x${body}` as Hex; const w: DevWallet = { address: privateKeyToAccount(privateKey).address, privateKey, createdAt: Date.now() };
    localStorage.setItem(DEVKEY, JSON.stringify(w)); setLocal(w);
  }, []);
  const newLocalKey = useCallback(() => generatePrivateKey(), []);
  const signer = useCallback((address?: string | null): AppSigner => {
    const target = address?.toLowerCase();
    if (accountWallet && (!target || accountWallet.toLowerCase() === target)) return { address: accountWallet, kind: 'account', sendPrepared: tx => session.send(tx), send: async tx => session.send(await prepareTx(accountWallet, { ...tx, data: tx.data ?? '0x' })) };
    if (!target || target === local?.address.toLowerCase()) {
      const w = local ?? ensureDevWallet(); if (!local) setLocal(w);
      const acct = privateKeyToAccount(w.privateKey); const client = createWalletClient({ account: acct, chain: robinhoodChain, transport: http() });
      const sendPrepared = (tx: PreparedTx) => client.sendTransaction({ ...tx, chain: robinhoodChain });
      return { address: acct.address, kind: 'device', sendPrepared, send: async tx => sendPrepared(await prepareTx(acct.address, { ...tx, data: tx.data ?? '0x' })) };
    }
    throw new Error('This wallet’s key isn’t on this phone.');
  }, [accountWallet, local, session]);
  const accountToken = useCallback(async (): Promise<string | null> => session.authenticated ? session.token() : null, [session]);
  const [profile, setProfile] = useState<{ publicId: string; alias: string; wallet?: string } | null>(null);
  useEffect(() => { if (!session.authenticated) { setProfile(null); return; } let cancelled = false; void (async () => { const t = await session.token(); if (!t) return; try { const p = await api<{ publicId: string; alias: string; wallet?: string }>('/account', { token: t, method: 'POST', body: {} }); if (!cancelled) setProfile(p); } catch { /* profile is optional */ } })(); return () => { cancelled = true; }; }, [session.authenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  const me: Account | undefined = meQ.data;
  const displayName = profile?.alias ? profile.alias : session.authenticated ? 'Creator' : 'Guest';
  const setAlias = useCallback(async (alias: string) => { const p = await api<{ alias: string; publicId: string }>('/profile', { token: await creator.token(), method: 'POST', body: { alias } }); setProfile(prev => ({ publicId: prev?.publicId ?? p.publicId, alias: p.alias, wallet: prev?.wallet })); }, [creator]);
  /** Proves this phone holds its wallet (signed locally) and links it to the signed-in account. */
  const linkLocalWallet = useCallback(async () => {
    const t = await accountToken(); if (!t) throw new Error('Sign in first.'); const w = local; const publicId = profile?.publicId ?? me?.publicId; if (!w || !publicId) return;
    const at = Date.now(); const signature = await privateKeyToAccount(w.privateKey).signMessage({ message: `ObjectPad: link creator wallet ${w.address.toLowerCase()} to account ${publicId} at ${at}` });
    await api('/account/wallets', { token: t, method: 'POST', body: { address: w.address, at, signature } }); void qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
  }, [accountToken, local, profile, me, qc]);
  const claimGas = useCallback(async (address: string) => { const t = await accountToken(); if (!t) return; await api('/account/claim-gas', { token: t, method: 'POST', body: { address }, timeout: 60_000 }); }, [accountToken]);
  const myScans = useCallback(async (): Promise<CaptureSession[]> => { const list = await api<{ items: CaptureSession[] }>('/sessions', { token: await creator.token() }); return [...list.items].sort((a, b) => b.createdAt - a.createdAt); }, [creator]);
  const adopt = useCallback(async (sessionId: string): Promise<number> => { const t = await accountToken(); if (!t) return 0; const g = guestToken(); try { const r = await api<{ adopted: number }>('/account/adopt', { token: t, method: 'POST', body: { sessionId, ...(g ? { guestToken: g } : {}) } }); return r.adopted; } catch { return 0; } }, [accountToken]);

  // ── Market ──────────────────────────────────────────────
  const coins = useMemo(() => coinsQ.data?.items ?? [], [coinsQ.data]); const recent = coinsQ.data?.recent ?? [];
  const ethUsd = marketQ.data?.ethUsd ?? null; const status = statusQ.data ?? null; const sponsor = status?.sponsor ?? null;
  const launchesLeft = sponsor ? Math.max(0, Math.min(sponsor.launchesAffordable, sponsor.perPersonDaily ?? 5, sponsor.dailyLimit - sponsor.usedToday)) : 0;
  const treasuryOpen = Boolean(sponsor && sponsor.launchesAffordable >= 1 && sponsor.usedToday < sponsor.dailyLimit);
  const coin = useCallback((id: string) => coins.find(c => c.id === id || c.token.toLowerCase() === id.toLowerCase()), [coins]);
  const pair = useCallback((address: string | null | undefined): PairQuote | undefined => pairsQ.data?.assets.find(a => isEthPair(address) ? a.kind === 'native' : a.address.toLowerCase() === address?.toLowerCase()), [pairsQ.data]);
  /** Live ETH and coin balances of the active wallet, read straight from Robinhood Chain in one multicall. */
  const holdings = useQuery({ queryKey: ['objectpad', 'app', 'holdings', activeWallet, coins.length], enabled: Boolean(activeWallet && coins.length), refetchInterval: 30_000, queryFn: async () => {
    const owner = activeWallet!; const [eth, results] = await Promise.all([chain.getBalance({ address: owner }), chain.multicall({ allowFailure: true, contracts: coins.map(c => ({ address: c.token as Address, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [owner] as const })) })]);
    const balances: Record<string, bigint> = {}; results.forEach((r, i) => { if (r.status === 'success' && (r.result as bigint) > 0n) balances[coins[i].token.toLowerCase()] = r.result as bigint; });
    return { eth, balances };
  } });
  const refreshAll = useCallback(async () => { await qc.invalidateQueries({ queryKey: ['objectpad'] }); }, [qc]);
  const lastScan = useCallback((): string | null => { try { return localStorage.getItem(LAST_SCAN); } catch { return null; } }, []);
  const setLastScan = useCallback((id: string | null) => { try { if (id) localStorage.setItem(LAST_SCAN, id); else localStorage.removeItem(LAST_SCAN); } catch { /* ignore */ } }, []);
  const tokenBalance = useCallback(async (token: string, owner: string) => chain.readContract({ address: token as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner as Address] }), []);

  return {
    // router
    tab, selectTab, push, navigate, back: () => (window.history.length > 1 ? navigate(-1) : navigate('/app/')),
    scanning, setScanning, resumeScan, startScan, signIn, setSignIn, account, setAccount, v2, setV2, creatingReward, setCreatingReward, install, setInstall,
    toast, show, watchlist, toggleWatch,
    // identity
    session, creator, signedIn: session.authenticated, signInAvailable: session.configured, accountWallet, localWallet: (local?.address as Address | undefined) ?? null, localKey: local?.privateKey ?? null, activeWallet,
    ensureLocalWallet, importLocalWallet, newLocalKey, signer, accountToken, profile, me, displayName, setAlias, linkLocalWallet, claimGas, myScans, adopt, refetchMe: () => void meQ.refetch(),
    // market
    coins, recent, loaded: !coinsQ.isPending, coinsError: coinsQ.isError && !coins.length ? coinsQ.error.message : null, market: marketQ.data ?? null, ethUsd, status, burns: burnsQ.data ?? null, building: (buildingQ.data?.items ?? []).filter(b => b.nsfw !== true && !isNsfwText(b.name, b.symbol) && Date.now() - (b.startedAt ?? b.queuedAt) < 180_000), rewards: rewardsQ.data ?? null, refetchRewards: () => void rewardsQ.refetch(),
    pairs: pairsQ.data ?? null, pair, coin, launchesLeft, treasuryOpen, ethBalance: holdings.data?.eth ?? null, balances: holdings.data?.balances ?? {}, refreshHoldings: () => void holdings.refetch(), refreshAll, lastScan, setLastScan, tokenBalance,
    encodeFunctionData,
  };
});
