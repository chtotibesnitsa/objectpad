import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useState } from 'react';
import { onBusy, setPageLanguage } from './engine';
import { bcp47, browserLanguage, languageOf, type Language } from './languages';

const KEY = 'objectpad.lang';

function initial(): string {
  try { const fromUrl = new URLSearchParams(location.search).get('lang'); if (fromUrl) return languageOf(fromUrl).code; const saved = localStorage.getItem(KEY); if (saved) return languageOf(saved).code; } catch { /* Storage blocked: use the browser language. */ }
  return browserLanguage() ?? 'en';
}

/** Site language: persisted choice (or ?lang=), applied to the whole page, with a busy flag while translating. */
export const [LanguageProvider, useLanguage] = createContextHook(() => {
  const [code, setCode] = useState<string>(initial);
  const [busy, setBusy] = useState<boolean>(false);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const language: Language = languageOf(code);
  useEffect(() => onBusy(setBusy), []);
  useEffect(() => {
    document.documentElement.lang = bcp47(code);
    document.documentElement.dir = language.rtl ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('translated', code !== 'en');
    const id = window.setTimeout(() => setPageLanguage(code), 0);
    return () => window.clearTimeout(id);
  }, [code, language.rtl]);
  const choose = useCallback((next: string) => { setCode(next); setPickerOpen(false); try { localStorage.setItem(KEY, next); } catch { /* Choice still applies for this visit. */ } }, []);
  const openPicker = useCallback((from?: HTMLElement | null) => {
    // Remember where the picker was opened from so the desktop panel can drop directly under that button.
    if (from) { const r = from.getBoundingClientRect(); setAnchor({ top: r.bottom, right: window.innerWidth - r.right }); } else setAnchor(null);
    setPickerOpen(true);
  }, []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  return { code, language, busy, choose, pickerOpen, anchor, openPicker, closePicker };
});
