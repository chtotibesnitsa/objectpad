/**
 * Live page translator. Walks the rendered DOM, translates visible text and a few attributes into the chosen
 * language, and keeps up with React re-renders through a MutationObserver. Originals are remembered per node, so
 * switching back to English (or to another language) is instant and lossless.
 *
 * Numbers, tickers, addresses, links and the brand are swapped for [n] tokens before translating, so live counters
 * ("Updated 3s ago") reuse one cached translation instead of hitting the network every second.
 */
const ENDPOINT = 'https://translate.googleapis.com/translate_a/t?client=gtx&dt=t&sl=en&tl=';
const SKIP = 'script,style,noscript,pre,code,textarea,svg,canvas,input,select,[translate="no"],.notranslate,[contenteditable="true"]';
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const PROTECT = /(\$[A-Za-z][A-Za-z0-9]*|0x[a-fA-F0-9]{4,}(?:…[a-fA-F0-9]+)?|https?:\/\/\S+|[a-z0-9-]+\.(?:fun|com|app|io)\b|@[A-Za-z0-9_]+|ObjectPad|\b[A-Z][A-Z0-9]{1,9}\b|\d[\d.,:%]*)/g;
const TOKEN = /[[【［]\s*(\d+)\s*[\]】］]/g;
const MAX_CACHE = 4000;

type Listener = (busy: boolean) => void;
interface TextState { original: string; shown: string }

let lang = 'en';
let observer: MutationObserver | null = null;
const textState = new WeakMap<Text, TextState>();
const attrState = new WeakMap<Element, Map<string, TextState>>();
const tracked = new Set<WeakRef<Text>>();
const trackedEls = new Set<WeakRef<Element>>();
const memory = new Map<string, Map<string, string>>();
const inflight = new Set<string>();
const queue = new Set<string>();
let timer: number | null = null;
let failures = 0;
let busyCount = 0;
const listeners = new Set<Listener>();

function setBusy(delta: number): void { busyCount = Math.max(0, busyCount + delta); listeners.forEach(fn => fn(busyCount > 0)); }
/** Subscribe to "translation in progress" updates. */
export function onBusy(fn: Listener): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

function store(code: string): Map<string, string> {
  let map = memory.get(code);
  if (!map) { map = new Map(); try { const saved = localStorage.getItem(`objectpad.i18n.${code}`); if (saved) for (const [k, v] of JSON.parse(saved) as [string, string][]) map.set(k, v); } catch { /* Corrupt or blocked storage: start empty. */ } memory.set(code, map); }
  return map;
}
let persistTimer: number | null = null;
function persist(code: string): void {
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => { try { const entries = [...store(code).entries()].slice(-MAX_CACHE); localStorage.setItem(`objectpad.i18n.${code}`, JSON.stringify(entries)); } catch { /* Storage full: keep the in-memory cache only. */ } }, 800);
}

/** Splits text into a translatable template plus the protected pieces it must keep verbatim. */
function template(text: string): { key: string; parts: string[] } {
  const parts: string[] = [];
  const key = text.replace(PROTECT, match => { parts.push(match); return `[${parts.length}]`; });
  return { key, parts };
}
function fill(translated: string, parts: string[]): string | null {
  const used = new Set<number>();
  const out = translated.replace(TOKEN, (whole, n: string) => { const i = Number(n) - 1; if (parts[i] === undefined) return whole; used.add(i); return parts[i]; });
  return used.size === parts.length ? out : null;
}
/** Worth translating: has letters beyond protected tokens. */
function translatable(key: string): boolean { return /\p{L}{2,}/u.test(key.replace(TOKEN, '')); }

/** Translation of `text` in the current language, or null when not known yet (queued). */
function lookup(text: string): string | null {
  const core = text.trim(); if (!core) return null;
  const { key, parts } = template(core);
  if (!translatable(key)) return null;
  const hit = store(lang).get(key);
  if (hit === undefined) { if (!inflight.has(key)) queue.add(key); schedule(); return null; }
  const filled = fill(hit, parts); if (filled === null) return null;
  const lead = text.match(/^\s*/)?.[0] ?? ''; const trail = text.match(/\s*$/)?.[0] ?? '';
  return lead + filled + trail;
}

function schedule(): void { if (timer === null && queue.size) timer = window.setTimeout(flush, failures ? Math.min(30_000, 1000 * 2 ** failures) : 40); }

async function flush(): Promise<void> {
  timer = null; const code = lang; if (code === 'en' || !queue.size) return;
  const batch: string[] = []; let size = 0;
  for (const key of queue) { if (batch.length >= 120 || size + key.length > 4500) break; batch.push(key); size += key.length; }
  batch.forEach(k => { queue.delete(k); inflight.add(k); });
  setBusy(1);
  try {
    const form = new URLSearchParams(); batch.forEach(k => form.append('q', k));
    const response = await fetch(ENDPOINT + encodeURIComponent(code), { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!response.ok) throw new Error(String(response.status));
    const raw = await response.json() as unknown;
    const list = (Array.isArray(raw) ? raw : [raw]).map(item => Array.isArray(item) ? String(item[0]) : String(item));
    const map = store(code);
    batch.forEach((k, i) => { if (list[i]) map.set(k, list[i]); });
    failures = 0; persist(code);
    if (code === lang) apply();
  } catch {
    failures += 1; batch.forEach(k => queue.add(k));
    if (failures === 3) console.warn('objectpad.i18n.unavailable');
  } finally { batch.forEach(k => inflight.delete(k)); setBusy(-1); schedule(); }
}

function skipped(el: Element | null): boolean { return !el || Boolean(el.closest(SKIP)); }

const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,figcaption,blockquote';
const INLINE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'BR', 'SMALL', 'MARK', 'U', 'SUP', 'SUB']);
const groupCache = new WeakMap<Element, boolean>();
/** A heading/paragraph built from several styled spans is translated as one sentence, not fragment by fragment. */
function groupOf(node: Text): Element | null {
  const block = node.parentElement?.closest(BLOCKS); if (!block) return null;
  let ok = groupCache.get(block);
  if (ok === undefined) { const kids = block.querySelectorAll('*'); ok = kids.length > 0 && kids.length < 12 && [...kids].every(k => INLINE.has(k.tagName)); groupCache.set(block, ok); }
  return ok ? block : null;
}
function texts(el: Element): Text[] { const out: Text[] = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text); return out; }
function translateGroup(block: Element): void {
  const nodes = texts(block); const states: TextState[] = [];
  for (const node of nodes) {
    let state = textState.get(node); const value = node.nodeValue ?? '';
    if (!state) { state = { original: value, shown: value }; textState.set(node, state); tracked.add(new WeakRef(node)); }
    else if (value !== state.shown) { state.original = value; state.shown = value; }
    states.push(state);
  }
  const live = states.filter(st => st.original.trim());
  if (live.length < 2) { nodes.forEach((n, i) => { const st = states[i]; const next = lang === 'en' ? st.original : lookup(st.original) ?? st.original; if (next !== n.nodeValue) { st.shown = next; n.nodeValue = next; } }); return; }
  const combined = states.reduce((acc, st) => acc && st.original && !/\s$/.test(acc) && !/^\s/.test(st.original) && /[\p{L}.,!?]$/u.test(acc) ? `${acc} ${st.original}` : acc + st.original, '');
  const translated = lang === 'en' ? null : lookup(combined.trim());
  nodes.forEach((n, i) => { const st = states[i]; const next = translated === null ? st.original : st === live[0] ? translated : st.original.trim() ? '' : st.original; if (next !== n.nodeValue) { st.shown = next; n.nodeValue = next; } });
}

function translateText(node: Text): void {
  const group = lang === 'en' ? null : groupOf(node); if (group) { translateGroup(group); return; }
  let state = textState.get(node); const value = node.nodeValue ?? '';
  if (!state) { if (!value.trim()) return; state = { original: value, shown: value }; textState.set(node, state); tracked.add(new WeakRef(node)); }
  else if (value !== state.shown) { state.original = value; state.shown = value; }
  const next = lang === 'en' ? state.original : lookup(state.original) ?? state.original;
  if (next !== value) { state.shown = next; node.nodeValue = next; }
}

function translateAttrs(el: Element): void {
  for (const name of ATTRS) {
    const value = el.getAttribute(name); if (value === null) continue;
    let map = attrState.get(el); let state = map?.get(name);
    if (!state) { if (!value.trim()) continue; if (!map) { map = new Map(); attrState.set(el, map); trackedEls.add(new WeakRef(el)); } state = { original: value, shown: value }; map.set(name, state); }
    else if (value !== state.shown) { state.original = value; state.shown = value; }
    const next = lang === 'en' ? state.original : lookup(state.original) ?? state.original;
    if (next !== value) { state.shown = next; el.setAttribute(name, next); }
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) { if (!skipped(root.parentElement)) translateText(root as Text); return; }
  if (!(root instanceof Element) || skipped(root)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n instanceof Element && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (n.nodeType === Node.TEXT_NODE) translateText(n as Text); else translateAttrs(n as Element); }
}

function apply(): void {
  observer?.disconnect();
  walk(document.body); const title = document.querySelector('title'); if (title) walk(title);
  observe();
}

function observe(): void {
  if (lang === 'en') return;
  observer ??= new MutationObserver(records => {
    observer?.disconnect();
    for (const r of records) {
      if (r.type === 'characterData') { if (!skipped(r.target.parentElement)) translateText(r.target as Text); }
      else if (r.type === 'attributes' && r.target instanceof Element) { if (!skipped(r.target)) translateAttrs(r.target); }
      else r.addedNodes.forEach(walk);
    }
    observe();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}

/** Switches the whole page to `code` ('en' restores the original English everywhere). */
export function setPageLanguage(code: string): void {
  if (code === lang) return;
  lang = code; queue.clear(); failures = 0;
  if (code === 'en') {
    observer?.disconnect();
    tracked.forEach(ref => { const node = ref.deref(); const s = node && textState.get(node); if (!node || !s) { tracked.delete(ref); return; } if (node.nodeValue === s.shown) node.nodeValue = s.original; s.shown = s.original; });
    trackedEls.forEach(ref => { const el = ref.deref(); const m = el && attrState.get(el); if (!el || !m) { trackedEls.delete(ref); return; } m.forEach((s, name) => { if (el.getAttribute(name) === s.shown) el.setAttribute(name, s.original); s.shown = s.original; }); });
    return;
  }
  apply();
}
