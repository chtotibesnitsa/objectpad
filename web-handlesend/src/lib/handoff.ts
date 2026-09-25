import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { deviceSecret, ensureGuestToken, lastDeviceScan, saveDeviceSecret, useCreator } from './creator';
import type { CaptureSession } from '@/shared/domain';

const KEY = 'objectpad.pending';
const OPEN = ['awaiting_mobile', 'capturing', 'review'];
/** Never let a slow sign-in provider hold up the QR: fall back to the browser's guest token. */
export async function withTimeout(pending: Promise<string>, ms: number): Promise<string> {
  return Promise.race([pending.catch(() => ensureGuestToken()), new Promise<string>((resolve, reject) => setTimeout(() => { ensureGuestToken().then(resolve, reject); }, ms))]);
}
/** Opens the private scan without ever waiting on sign-in: account token if it answers within 2.5s, else the guest token. */
export async function openScan(token: () => Promise<string>): Promise<ScanLink> {
  return Promise.race([ensureScan(await withTimeout(token(), 2500)), new Promise<ScanLink>((_, reject) => setTimeout(() => reject(new Error('The scanner took too long to open. Tap Try again.')), 20_000))]);
}
/**
 * The scan this phone is linked to by QR (following any rescans), if it is still taking photos. Lets a phone that
 * reloaded, closed its tab or tapped "Scan" carry on with the computer's scan instead of starting an unlinked one.
 */
export async function resumeDeviceScan(): Promise<string | null> {
  let id = lastDeviceScan();
  for (let hop = 0; id && hop < 4; hop++) {
    const secret = deviceSecret(id); if (!secret) return null;
    try {
      const session = await api<CaptureSession>(`/sessions/${id}`, { headers: { 'X-Capture-Device': secret } });
      if (session.successor) { saveDeviceSecret(session.successor, secret); id = session.successor; continue; }
      return OPEN.includes(session.state) && session.expiresAt > Date.now() ? id : null;
    } catch { return null; }
  }
  return null;
}
/** A private scan for this browser plus its single-use phone link. */
export interface ScanLink { session: CaptureSession; url: string; expires: number; }

/** The scan this browser is working on (kept until its coin launches, so every QR resumes the same scan). */
export function pendingScan(): string | null { try { const v = localStorage.getItem(KEY); return v && /^[a-f0-9-]{36}$/.test(v) ? v : null; } catch { return null; } }
export function rememberScan(id: string): void { try { localStorage.setItem(KEY, id); } catch { /* private mode */ } }
export function forgetScan(id?: string): void { try { if (!id || localStorage.getItem(KEY) === id) localStorage.removeItem(KEY); } catch { /* ignore */ } }

function saveLink(id: string, url: string, expiresAt?: number): { url: string; expires: number } {
  const next = { url, expires: Math.min(expiresAt ?? Number.MAX_SAFE_INTEGER, Date.now() + 9.5 * 60_000) };
  try { sessionStorage.setItem(`objectpad.handoff.${id}`, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

/**
 * Reuses this browser's open scan when it is still waiting for photos, otherwise opens a new one, and returns a fresh
 * single-use link for the phone. No account: the creator is the browser's guest token unless someone is signed in.
 */
export async function ensureScan(token: string): Promise<ScanLink> {
  const saved = pendingScan();
  if (saved) {
    try {
      const session = await api<CaptureSession>(`/sessions/${saved}`, { token });
      if (OPEN.includes(session.state) && !session.launch && session.expiresAt > Date.now() + 5 * 60_000) {
        if (session.deviceConnected) return { session, url: '', expires: 0 };
        const link = await api<{ handoffUrl: string; expiresAt: number }>(`/sessions/${saved}/handoff`, { token, method: 'POST', body: {} });
        return { session, ...saveLink(saved, link.handoffUrl, link.expiresAt) };
      }
    } catch { /* the saved scan belongs elsewhere or expired: start a new one */ }
  }
  const data = await api<{ session: CaptureSession; handoffUrl?: string }>('/sessions', { token, method: 'POST', body: { draftId: crypto.randomUUID(), rights: true } });
  rememberScan(data.session.id);
  return { session: data.session, ...(data.handoffUrl ? saveLink(data.session.id, data.handoffUrl) : { url: '', expires: 0 }) };
}

/**
 * Private QR for this visitor, used on the homepage. The link is refreshed before it expires, and the moment the phone
 * connects (or a photo arrives) this browser follows into the live scan studio.
 */
export function useScanLink(enabled: boolean) {
  const creator = useCreator(); const navigate = useNavigate();
  const link = useQuery({ queryKey: ['objectpad', 'scan-link', creator.signedIn], enabled, queryFn: async () => openScan(creator.token), staleTime: 8 * 60_000, refetchInterval: 9 * 60_000, refetchOnWindowFocus: false, retry: 2, retryDelay: 800 });
  const id = link.data?.session.id;
  const status = useQuery({ queryKey: ['objectpad', 'scan-link-status', id], enabled: Boolean(id) && enabled, queryFn: async () => api<CaptureSession>(`/sessions/${id}`, { token: await creator.token() }), refetchInterval: 2500, retry: 1 });
  const session = status.data ?? link.data?.session ?? null;
  // Follow into the studio only when the phone connects while this page is open; a scan already in progress is offered as "resume" instead.
  const initial = useRef<boolean | null>(null);
  useEffect(() => { if (!session) return; const busy = Boolean(session.deviceConnected || session.views.length > 0); if (initial.current === null) { initial.current = busy; return; } if (busy && !initial.current) navigate(`/launch/${session.id}`); }, [session, navigate]);
  return { url: link.data?.url ?? '', expires: link.data?.expires ?? 0, session, loading: link.isPending && enabled, error: link.error, retry: () => void link.refetch() };
}
