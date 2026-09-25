import { Link } from 'react-router-dom';
/** The ObjectPad mark: the duck on its pedestal, cropped tight and masked round so it drops into any nav bar or favicon slot. */
export function Mark({ className = '' }: { className?: string }) { return <span className={`inline-block overflow-hidden rounded-full bg-ink ${className}`} aria-hidden="true"><img src="/icon.png" alt="" className="h-full w-full scale-[1.32] object-cover object-[50%_38%]" draggable={false}/></span>; }
export function Brand({ compact = false }: { compact?: boolean }) { return <Link to="/" className="flex items-center gap-2 text-[20px] font-extrabold tracking-[-.05em]" aria-label="ObjectPad home"><Mark className="size-7"/>{!compact && <span>ObjectPad</span>}</Link>; }
