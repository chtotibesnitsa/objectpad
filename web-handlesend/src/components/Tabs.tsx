import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string> { value: T; label: string; icon?: ReactNode; badge?: ReactNode; }

/**
 * Liquid-glass segmented control with a sliding pill that follows the active tab (measured, so labels can differ in
 * width). Used for page tabs, sort orders and trade direction.
 */
export function SegmentedTabs<T extends string>({ items, value, onChange, className, size = 'md', label }: { items: TabItem<T>[]; value: T; onChange: (value: T) => void; className?: string; size?: 'sm' | 'md'; label: string }) {
  const root = useRef<HTMLDivElement>(null); const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => { const active = root.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`); if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth }); };
    measure(); const observer = new ResizeObserver(measure); if (root.current) observer.observe(root.current); return () => observer.disconnect();
  }, [value, items.length]);
  return <div ref={root} role="tablist" aria-label={label} className={cn('sunk relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full p-1 no-scrollbar', className)}>
    {pill && <span aria-hidden="true" className="raised absolute top-1 bottom-1 rounded-full transition-[left,width] duration-500 ease-[cubic-bezier(.2,.9,.25,1.15)]" style={{ left: pill.left, width: pill.width }}/>}
    {items.map(item => { const active = item.value === value; return <button key={item.value} type="button" role="tab" aria-selected={active} data-value={item.value} onClick={() => onChange(item.value)} className={cn('relative z-10 flex shrink-0 items-center gap-1.5 rounded-full font-bold transition-colors duration-300', size === 'sm' ? 'min-h-9 px-3.5 text-xs' : 'min-h-10 px-4 text-sm', active ? 'text-ink' : 'text-ink/65 hover:text-ink')}>{item.icon}{item.label}{item.badge}</button>; })}
  </div>;
}
