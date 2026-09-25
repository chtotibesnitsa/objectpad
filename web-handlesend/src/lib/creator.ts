import { useCallback } from 'react';
import { api, RequestError, type ApiOptions } from './api';
import { useSession } from './session';

const GUEST_KEY = 'objectpad.guest';
const deviceKey = (id: string): string => `objectpad.device.${id}`;
let pendingGuest: Promise<string> | null = null;

/** The browser's account-free creator token, if one was issued. Only its hash exists on the server. */
export function guestToken(): string | null {
  try { const value = localStorage.getItem(GUEST_KEY); return value && /^g_[a-f0-9]{64}$/.test(value) ? value : null; } catch { return null; }
}
/** Returns the guest token, asking the API for one on first use. Launching never needs an account. */
export async function ensureGuestToken(): Promise<string> {
  const saved = guestToken(); if (saved) return saved;
  pendingGuest ??= api<{ token: string }>('/guests', { method: 'POST', body: {} }).then(({ token }) => { try { localStorage.setItem(GUEST_KEY, token); } catch { /* private mode: token lives for this page only */ } return token; }).finally(() => { pendingGuest = null; });
  return pendingGuest;
}
/** Secret that pairs this phone with one capture session (issued when the QR code is claimed). */
export function deviceSecret(id: string): string | null { try { const value = localStorage.getItem(deviceKey(id)); return value && /^[a-f0-9]{64}$/.test(value) ? value : null; } catch { return null; } }
export function saveDeviceSecret(id: string, secret: string): void { try { localStorage.setItem(deviceKey(id), secret); localStorage.setItem(LAST_DEVICE, id); } catch { /* ignore */ } }
const LAST_DEVICE = 'objectpad.device.last';
/** The scan this phone was last paired to by QR, so a reload or a closed tab can link straight back to it. */
export function lastDeviceScan(): string | null { try { const id = localStorage.getItem(LAST_DEVICE); return id && /^[a-f0-9-]{36}$/.test(id) && deviceSecret(id) ? id : null; } catch { return null; } }
export function forgetDeviceScan(id: string): void { try { if (localStorage.getItem(LAST_DEVICE) === id) localStorage.removeItem(LAST_DEVICE); } catch { /* ignore */ } }
/** Phones and tablets get the in-browser scanner; desktops get a QR code that moves the same session to a phone. */
export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); const touchMac = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
  return ua || touchMac || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900);
}

/** Current creator identity: the signed-in account when there is one, otherwise the browser's guest token. */
export function useCreator() {
  const session = useSession(); const { authenticated, token: accountToken } = session;
  const token = useCallback(async (): Promise<string> => { if (authenticated) { const value = await accountToken(); if (value) return value; } return ensureGuestToken(); }, [authenticated, accountToken]);
  return { token, ready: session.ready, signedIn: authenticated, wallet: session.wallet, login: session.login, logout: session.logout, configured: session.configured };
}

const retryable = (error: unknown): boolean => error instanceof RequestError && [401, 403, 404].includes(error.status);
/**
 * API caller for one capture session. Tries, in order: this phone's device secret, the current creator identity and
 * (for signed-in users) the browser's older guest token. Whichever holds the session answers; nothing is shared.
 */
export function useSessionCaller(id: string) {
  const { token, signedIn } = useCreator();
  const attempts = useCallback((): (() => Promise<Record<string, string> | null>)[] => [
    async () => { const secret = deviceSecret(id); return secret ? { 'X-Capture-Device': secret } : null; },
    async () => ({ Authorization: `Bearer ${await token()}` }),
    async () => { const guest = guestToken(); return guest && signedIn ? { Authorization: `Bearer ${guest}` } : null; },
  ], [id, token, signedIn]);
  const call = useCallback(async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
    let last: unknown = new RequestError('Nothing exists at this address.', 'NOT_FOUND', 404);
    for (const attempt of attempts()) { const headers = await attempt(); if (!headers) continue; try { return await api<T>(path, { ...options, headers: { ...options.headers, ...headers } }); } catch (error) { last = error; if (!retryable(error)) throw error; } }
    throw last;
  }, [attempts]);
  /** Raw download (for private 3D artifacts) with the same access order. */
  const download = useCallback(async (url: string): Promise<Blob> => {
    for (const attempt of attempts()) { const headers = await attempt(); if (!headers) continue; const response = await fetch(url, { headers, credentials: 'omit' }); if (response.ok) return response.blob(); if (![401, 403, 404].includes(response.status)) break; }
    throw new Error('The 3D model could not be loaded. Retry in a moment.');
  }, [attempts]);
  return { call, download };
}
