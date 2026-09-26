/** Home-screen install helpers shared by the site banner and the app's install guide. */
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  // Android/Chrome only: the one-tap install prompt. Captured as early as possible so it is never missed.
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as InstallPromptEvent; listeners.forEach(l => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('objectpad.app.installed', '1'); } catch { /* ignore */ } listeners.forEach(l => l()); });
}

/** True when running from the home screen (standalone), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}
export function isAndroid(): boolean { return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent); }
/** iOS browsers other than Safari (Chrome, Firefox…) also offer Add to Home Screen from their share menu since iOS 16.4. */
export function iosBrowser(): 'safari' | 'chrome' | 'other' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/CriOS/i.test(ua)) return 'chrome'; if (/FxiOS|EdgiOS|OPiOS/i.test(ua)) return 'other'; return 'safari';
}
/** A phone (not a tablet or desktop). */
export function isMobilePhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPod|Android.+Mobile|Mobile/i.test(navigator.userAgent) || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 760);
}
export const canPromptInstall = (): boolean => deferred !== null;
export function onInstallChange(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Shows the native install prompt where the browser supports it. Returns false when it can't (iOS: use the guide). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred; deferred = null; await event.prompt();
  const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const })); listeners.forEach(l => l());
  return choice.outcome === 'accepted';
}
/** The page that becomes the home-screen app. */
export const APP_PATH = '/app/';
export const APP_INSTALL_URL = 'https://objectpad.fun/app/?install=1';

/** Registers the offline shell. Safe to call more than once. */
export function registerAppWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}
