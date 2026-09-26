import { CATALOG } from './catalog';

/** One selectable site language. */
export interface Language { code: string; english: string; native: string; flag: string; rtl: boolean; popular: number }

/** Most-spoken / most-requested first. Everything else follows alphabetically. */
const POPULAR = ['en', 'ja', 'zh-CN', 'zh-TW', 'es', 'ko', 'hi', 'ar', 'pt', 'fr', 'de', 'ru', 'id', 'tr', 'vi', 'th', 'it', 'pl', 'nl', 'uk', 'tl', 'fa', 'bn', 'ur', 'ms', 'sw', 'pt-PT', 'yue', 'iw', 'sv'];
const RTL = new Set(['ar', 'iw', 'fa', 'fa-AF', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'pa-Arab', 'ms-Arab', 'bal']);
/** Flag for languages whose script/region is better shown than the generic country code. */
const FLAG_OVERRIDE: Record<string, string> = { en: '🇺🇸', eo: '🌍', rom: '🌍', la: '🏛️', sa: '🇮🇳', gd: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' };
/** BCP-47 tags for names the translation service spells differently. */
const BCP: Record<string, string> = { iw: 'he', jw: 'jv', tl: 'fil', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', 'mni-Mtei': 'mni', 'fa-AF': 'fa-AF' };
/** Short, hand-checked native names for the top of the list (Intl can be missing on older phones). */
const NATIVE: Record<string, string> = { en: 'English', ja: '日本語', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', es: 'Español', ko: '한국어', hi: 'हिन्दी', ar: 'العربية', pt: 'Português (Brasil)', 'pt-PT': 'Português (Portugal)', fr: 'Français', de: 'Deutsch', ru: 'Русский', id: 'Bahasa Indonesia', tr: 'Türkçe', vi: 'Tiếng Việt', th: 'ไทย', it: 'Italiano', pl: 'Polski', nl: 'Nederlands', uk: 'Українська', tl: 'Filipino', fa: 'فارسی', bn: 'বাংলা', ur: 'اردو', ms: 'Bahasa Melayu', sw: 'Kiswahili', yue: '粵語', iw: 'עברית', sv: 'Svenska' };

/** Converts an ISO 3166 country code into its emoji flag. */
function flagOf(country: string): string { return country.length === 2 ? String.fromCodePoint(...[...country.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐'; }
/** BCP-47 tag used for `<html lang>` and Intl. */
export function bcp47(code: string): string { return BCP[code] ?? code; }

function nativeName(code: string, english: string): string {
  if (NATIVE[code]) return NATIVE[code];
  try { const name = new Intl.DisplayNames([bcp47(code)], { type: 'language' }).of(bcp47(code)); if (name && name.toLowerCase() !== bcp47(code).toLowerCase()) return name.charAt(0).toLocaleUpperCase(bcp47(code)) + name.slice(1); } catch { /* Unknown tag on this browser: fall back to English. */ }
  return english;
}

let cache: Language[] | null = null;
/** Every language, popular first (in POPULAR order), then A–Z by English name. */
export function languages(): Language[] {
  if (cache) return cache;
  const list = CATALOG.split(';').map(row => { const [code, english, country] = row.split('|'); return { code, english, native: nativeName(code, english), flag: FLAG_OVERRIDE[code] ?? flagOf(country), rtl: RTL.has(code), popular: POPULAR.indexOf(code) }; });
  cache = list.sort((a, b) => (a.popular < 0 ? 999 : a.popular) - (b.popular < 0 ? 999 : b.popular) || a.english.localeCompare(b.english));
  return cache;
}
/** Looks up a language by code; English when unknown. */
export function languageOf(code: string): Language { return languages().find(l => l.code === code) ?? languages()[0]; }
/** Best supported match for the browser's preferred languages, or null for English/unsupported. */
export function browserLanguage(): string | null {
  const codes = new Set(languages().map(l => l.code));
  for (const raw of navigator.languages ?? [navigator.language]) {
    const tag = raw.toLowerCase(); const base = tag.split('-')[0];
    if (base === 'en') return null;
    if (base === 'zh') return /tw|hk|mo|hant/.test(tag) ? 'zh-TW' : 'zh-CN';
    if (base === 'he') return 'iw'; if (base === 'fil') return 'tl'; if (base === 'jv') return 'jw';
    if (tag === 'pt-pt') return 'pt-PT';
    if (codes.has(base)) return base;
  }
  return null;
}
