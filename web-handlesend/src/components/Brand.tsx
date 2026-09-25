import { Link } from 'react-router-dom';
/** The ObjectPad mark: the duck on its pedestal, transparent cutout, sitting straight on the page next to the wordmark — no frame, no background shape. */
export function Mark({ className = '' }: { className?: string }) { return <img src="/brand/duck-mark.png" alt="" aria-hidden="true" draggable={false} className={`block h-full w-auto object-contain ${className}`}/>; }
export function Brand({ compact = false }: { compact?: boolean }) { return <Link to="/" className="flex items-center gap-2 text-[20px] font-extrabold tracking-[-.05em]" aria-label="ObjectPad home"><Mark className="h-8"/>{!compact && <span>ObjectPad</span>}</Link>; }
