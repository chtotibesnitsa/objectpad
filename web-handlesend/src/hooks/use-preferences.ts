import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useState } from 'react';
export const [PreferencesProvider, usePreferences] = createContextHook(() => {
  const [sound, setSound] = useState<boolean>(() => { try { return localStorage.getItem('objectpad.sound') === 'on'; } catch { return false; } });
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const q = window.matchMedia('(prefers-reduced-motion: reduce)'); const changed = () => setReducedMotion(q.matches); q.addEventListener('change', changed); return () => q.removeEventListener('change', changed); }, []);
  const toggleSound = useCallback(() => setSound(previous => { const next = !previous; try { localStorage.setItem('objectpad.sound', next ? 'on' : 'off'); } catch { /* A disabled storage area must not prevent a preference change. */ } return next; }), []);
  const play = useCallback((event: 'handoff' | 'capture' | 'rejected' | 'orbit' | 'model' | 'seal' | 'launch' | 'retry') => { if (sound) { const audio = new Audio(`/sfx/${event}.mp3`); audio.volume = 0.22; void audio.play().catch(() => {}); } }, [sound]);
  return { sound, toggleSound, reducedMotion, play };
});
