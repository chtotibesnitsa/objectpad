import { memo } from 'react';
import { cn } from '@/lib/utils';

/** Rendered liquid-glass icon set (transparent WebP, 320px). */
export type GlassName = 'mesh' | 'fingerprint' | 'rocket' | 'vault' | 'burn' | 'coins' | 'diamond' | 'qr' | 'ai' | 'chain' | 'wallet' | 'shield' | 'chart';

/** A 3D liquid-glass icon. Use instead of thin line icons for anything a visitor should notice. */
export const GlassIcon = memo(function GlassIcon({ name, size = 40, className, float = false }: { name: GlassName; size?: number; className?: string; float?: boolean }) {
  return <img src={`/assets/glass/${name}.webp`} alt="" aria-hidden="true" width={size} height={size} loading="lazy" decoding="async" draggable={false} className={cn('glass-icon pointer-events-none select-none object-contain', float && 'float-y', className)} style={{ width: size, height: size }}/>;
});

/** A glass icon sitting in a pearl orb, for pills and buttons. */
export function GlassOrb({ name, size = 40, className }: { name: GlassName; size?: number; className?: string }) {
  return <span className={cn('orb', className)} style={{ width: size, height: size }}><GlassIcon name={name} size={Math.round(size * 0.78)} className="!filter-none"/></span>;
}
