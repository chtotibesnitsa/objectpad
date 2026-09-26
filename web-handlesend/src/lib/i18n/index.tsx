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
  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  return { code, language, busy, choose, pickerOpen, openPicker, closePicker };
});
