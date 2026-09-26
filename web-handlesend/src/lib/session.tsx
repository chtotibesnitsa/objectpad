import createContextHook from '@nkzw/create-context-hook';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { Address, Hex } from 'viem';

/** Sign-in routes offered on ObjectPad. Launching never requires one of them. */
export type LoginMethod = 'twitter' | 'wallet' | 'email';
export interface SessionAdapter { ready: boolean; authenticated: boolean; wallet: Address | null; login: (methods?: LoginMethod[]) => void; logout: () => void; token: () => Promise<string | null>; sign: (message: string) => Promise<Hex>; linkX?: () => void; send: (input: { to: Address; data: Hex; value: bigint; gas: bigint }) => Promise<Hex>; }

/** Privy application used by ObjectPad. Configure in the project environment as VITE_PRIVY_APP_ID. */
export const PRIVY_APP_ID = ((import.meta.env.VITE_OBJECTPAD_PRIVY_APP_ID as string | undefined) || (import.meta.env.VITE_PRIVY_APP_ID as string | undefined) || '').trim();

const blocked = async (): Promise<never> => { throw new Error('ObjectPad sign-in is not configured.'); };
export const [SessionProvider, useSession] = createContextHook(() => {
  const [adapter, setAdapter] = useState<SessionAdapter>({ ready: !PRIVY_APP_ID, authenticated: false, wallet: null, login: () => {}, logout: () => {}, token: async () => null, sign: blocked, send: blocked });
  return { ...adapter, setAdapter, configured: Boolean(PRIVY_APP_ID) };
});
const ConnectedAuth = lazy(() => import('./privy'));
export function AuthBoundary({ children }: { children: ReactNode }) { return <SessionProvider>{PRIVY_APP_ID ? <Suspense fallback={children}><ConnectedAuth>{children}</ConnectedAuth></Suspense> : children}</SessionProvider>; }
