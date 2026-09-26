import { Link } from 'react-router-dom';
import { V2Pill } from './V2Pill';
/**
 * The ObjectPad mark: the duck on its pedestal as a transparent cutout. Always rendered inside a fixed-size box
 * (width/height attributes + explicit size) so it can never balloon to the source image's natural size.
 */
export function Mark({ size = 30 }: { size?: number }) {
  return <span className="inline-flex shrink-0 items-center justify-center overflow-hidden" style={{ width: size, height: size }} aria-hidden="true"><img src="/brand/duck-mark-96.png" srcSet="/brand/duck-mark-96.png 1x, /brand/duck-mark-192.png 2x" width={Math.round(size * 0.77)} height={size} alt="" draggable={false} decoding="async" className="block h-full w-auto max-w-full object-contain"/></span>;
}
/** Logo + wordmark, with the gold V2 pill to its right (links to the V2 release notes). */
export function Brand({ compact = false, pill = true }: { compact?: boolean; pill?: boolean }) { return <span translate="no" className="notranslate flex shrink-0 items-center gap-2"><Link to="/" className="flex shrink-0 items-center gap-1.5 text-[20px] font-extrabold tracking-[-.05em]" aria-label="ObjectPad home"><Mark/>{!compact && <span className="whitespace-nowrap">ObjectPad</span>}</Link>{pill && <V2Pill size={compact ? 'sm' : 'md'}/>}</span>; }
