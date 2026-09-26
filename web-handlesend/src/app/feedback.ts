/**
 * Interface sounds and haptics, 1:1 with the iOS app's Feedback: the same sound files, volumes and moments.
 * Sounds play through Web Audio (unlocked on the first touch), follow the silent switch where Safari allows
 * (ambient audio session) and the in-app sound toggle. Haptics use the Vibration API, and on iPhone the
 * system switch haptic (Safari 18+).
 */
export type Sound = 'tap' | 'swoosh' | 'success' | 'coins' | 'error' | 'capture' | 'orbit' | 'model' | 'launch' | 'seal' | 'handoff' | 'rejected' | 'retry';
const FILES: Record<Sound, string> = { tap: 'glass_tap_tick', swoosh: 'tab_switch_swoosh', success: 'success_chime_sparkle', coins: 'coin_cascade_sparkle', error: 'soft_error_thud', capture: 'sfx_capture', orbit: 'sfx_orbit', model: 'sfx_model', launch: 'sfx_launch', seal: 'sfx_seal', handoff: 'sfx_handoff', rejected: 'sfx_rejected', retry: 'sfx_retry' };
const KEY = 'objectpad.app.sound';

let ctx: AudioContext | null = null;
const buffers = new Map<Sound, AudioBuffer>();
let loading: Promise<void> | null = null;

export function soundOn(): boolean { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } }
export function setSoundOn(on: boolean): void { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ } }

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Ctor) return null;
  try { const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession; if (session) session.type = 'ambient'; } catch { /* older Safari */ }
  ctx = new Ctor(); return ctx;
}
/** Decodes every sound once. Called on the first user gesture. */
export function prepare(): Promise<void> {
  const c = context(); if (!c) return Promise.resolve();
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  loading ??= Promise.all((Object.keys(FILES) as Sound[]).map(async s => { try { const res = await fetch(`/app/sfx/${FILES[s]}.mp3`); buffers.set(s, await c.decodeAudioData(await res.arrayBuffer())); } catch { /* a missing sound never breaks the UI */ } })).then(() => undefined);
  return loading;
}
if (typeof window !== 'undefined') {
  const unlock = () => { void prepare(); window.removeEventListener('touchstart', unlock); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('touchstart', unlock, { passive: true }); window.addEventListener('pointerdown', unlock, { passive: true });
}

export function play(sound: Sound, volume = 0.55): void {
  if (!soundOn()) return; const c = context(); if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  const buffer = buffers.get(sound); if (!buffer) { void prepare(); return; }
  const src = c.createBufferSource(); const gain = c.createGain(); gain.gain.value = volume; src.buffer = buffer; src.connect(gain).connect(c.destination); src.start();
}

let switchLabel: HTMLLabelElement | null = null;
/** iPhone Safari has no Vibration API, but toggling a native switch plays the system haptic. */
function iosHaptic(): void {
  if (!switchLabel) {
    const input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('switch', ''); input.id = 'op-haptic'; input.style.display = 'none';
    switchLabel = document.createElement('label'); switchLabel.htmlFor = 'op-haptic'; switchLabel.style.display = 'none';
    document.body.append(input, switchLabel);
  }
  switchLabel.click();
}
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') { navigator.vibrate(pattern); return; }
  try { iosHaptic(); } catch { /* no haptics on this device */ }
}

export const Feedback = {
  play,
  tap(sound = true): void { vibrate(8); if (sound) play('tap', 0.22); },
  selection(): void { vibrate(5); },
  thud(): void { vibrate(18); },
  softImpact(): void { vibrate(10); },
  success(sound: Sound = 'success'): void { vibrate([10, 40, 14]); play(sound); },
  warning(): void { vibrate([20, 60, 20]); play('error', 0.4); },
  error(): void { vibrate([30, 50, 30]); play('error'); },
};
