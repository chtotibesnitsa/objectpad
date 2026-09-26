import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Globe2, Loader2, Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { languages, type Language } from '@/lib/i18n/languages';
import { cn } from '@/lib/utils';

/** Twemoji art for an emoji flag, so flags look identical on Windows (which has no flag emoji) and every phone. */
function twemoji(emoji: string): string { return [...emoji].map(c => c.codePointAt(0)!.toString(16)).filter(c => c !== 'fe0f').join('-'); }
export const Flag = memo(function Flag({ emoji, size = 22 }: { emoji: string; size?: number }) {
  const [failed, setFailed] = useState<boolean>(false);
  if (failed) return <span style={{ fontSize: size }} className="leading-none" aria-hidden="true">{emoji}</span>;
  return <img src={`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${twemoji(emoji)}.svg`} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="shrink-0 select-none" style={{ width: size, height: size }} draggable={false}/>;
});

/** Compact flag button that opens the language sheet. */
export function LanguageButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { language, busy, openPicker } = useLanguage();
  return <button onClick={e => openPicker(e.currentTarget)} translate="no" aria-label={`Language: ${language.english}`} title="Language" className={cn('press notranslate flex items-center justify-center gap-1.5 font-extrabold', compact ? 'sunk min-h-10 rounded-[14px] px-2.5 text-[12px]' : 'raised min-h-[52px] rounded-[17px] px-3.5 text-[13px]', className)}>
    <Flag emoji={language.flag} size={compact ? 17 : 20}/>
    <span className="font-mono uppercase tracking-wide">{language.code.split('-')[0]}</span>
    {busy && <Loader2 size={12} className="animate-spin text-ink/50"/>}
  </button>;
}

/** Full-width row used in the drawer and Settings. */
export function LanguageRow({ onOpen, className }: { onOpen?: () => void; className?: string }) {
  const { language, openPicker } = useLanguage();
  return <button onClick={() => { onOpen?.(); openPicker(); }} translate="no" className={cn('press notranslate group flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 text-left hover:bg-white/70', className)}>
    <span className="raised flex size-[38px] items-center justify-center rounded-xl"><Flag emoji={language.flag} size={20}/></span>
    <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-extrabold tracking-[-0.01em]">Language · {language.native}</span><span className="block font-mono text-[11.5px] text-ink/60">{languages().length} languages · 日本語 · 中文 · Español</span></span>
    <Globe2 size={16} className="text-ink/50"/>
  </button>;
}

const Row = memo(function Row({ lang, active, onPick }: { lang: Language; active: boolean; onPick: (code: string) => void }) {
  return <button onClick={() => onPick(lang.code)} lang={lang.code} className={cn('flex min-h-[54px] w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors', active ? 'bg-ink text-white' : 'hover:bg-ink/[0.05]')} aria-pressed={active}>
    <Flag emoji={lang.flag} size={24}/>
    <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-left text-[15px] font-extrabold tracking-[-0.01em]">{lang.native}</span>{lang.native !== lang.english && <span className={cn('block truncate text-[12px] font-semibold', active ? 'text-white/60' : 'text-ink/50')}>{lang.english}</span>}</span>
    {active && <Check size={17} strokeWidth={3}/>}
  </button>;
});

/** Searchable language sheet: popular languages first, then every other language A–Z.
 * When opened from a header button, the desktop panel drops directly under that button (right-aligned to it);
 * without an anchor — or on phones, where it is a bottom sheet — it falls back to the default placement. */
export function LanguagePicker() {
  const { code, choose, pickerOpen, anchor, closePicker } = useLanguage();
  const [query, setQuery] = useState<string>(''); const input = useRef<HTMLInputElement>(null);
  const all = languages();
  useEffect(() => { if (!pickerOpen) { setQuery(''); return; } const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 250); const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closePicker(); }; window.addEventListener('keydown', key); return () => { window.clearTimeout(t); window.removeEventListener('keydown', key); }; }, [pickerOpen, closePicker]);
  const { popular, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (l: Language) => !q || l.english.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().startsWith(q);
    return { popular: all.filter(l => l.popular >= 0 && hit(l)), rest: all.filter(l => l.popular < 0 && hit(l)) };
  }, [all, query]);
  return <div translate="no" className={cn('notranslate fixed inset-0 z-[90] transition-[visibility] duration-300', pickerOpen ? 'visible' : 'invisible')} role="dialog" aria-modal="true" aria-label="Choose language" aria-hidden={!pickerOpen}>
    <button className={cn('absolute inset-0 bg-ink/25 backdrop-blur-[4px] transition-opacity duration-300', pickerOpen ? 'opacity-100' : 'opacity-0')} aria-label="Close" onClick={closePicker} tabIndex={-1}/>
    <div style={pickerOpen && anchor && (typeof window === 'undefined' || window.matchMedia('(min-width: 640px)').matches) ? { top: anchor.top + 10, right: anchor.right } : undefined} className={cn('glass-nav absolute inset-x-2 bottom-2 flex max-h-[86dvh] flex-col overflow-hidden rounded-[30px] transition-all duration-300 ease-[cubic-bezier(.2,.9,.25,1.05)] sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:max-h-[min(720px,calc(100dvh-120px))] sm:w-[420px]', pickerOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 sm:-translate-y-3')}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div><p className="lab">Language</p><h2 className="display mt-1 text-[26px] leading-none">Choose language</h2></div>
        <button onClick={closePicker} className="press raised flex size-11 items-center justify-center rounded-2xl" aria-label="Close" tabIndex={pickerOpen ? 0 : -1}><X size={18} strokeWidth={2.5}/></button>
      </div>
      <label className="sunk mx-4 mt-4 flex min-h-12 items-center gap-2 rounded-2xl px-3.5"><Search size={16} className="text-ink/45"/><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${all.length} languages`} className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-ink/40" tabIndex={pickerOpen ? 0 : -1}/></label>
      <div className="mt-3 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 no-scrollbar">
        {popular.length > 0 && <><p className="lab px-3 pb-1 pt-2">Popular</p>{popular.map(l => <Row key={l.code} lang={l} active={l.code === code} onPick={choose}/>)}</>}
        {rest.length > 0 && <><p className="lab px-3 pb-1 pt-4">All languages · A–Z</p>{rest.map(l => <Row key={l.code} lang={l} active={l.code === code} onPick={choose}/>)}</>}
        {!popular.length && !rest.length && <p className="px-3 py-10 text-center text-[14px] font-semibold text-ink/50">No language matches “{query}”.</p>}
      </div>
      <p className="border-t border-ink/[0.07] px-5 py-3 font-mono text-[11px] font-semibold text-ink/50">Machine-translated live. Coin names, tickers and addresses stay original.</p>
    </div>
  </div>;
}
