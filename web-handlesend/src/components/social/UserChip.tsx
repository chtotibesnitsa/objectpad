import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { SocialUser } from '@/lib/social';
import { cn } from '@/lib/utils';

const HUES = ['#12A150', '#2F7BF2', '#D9A521', '#E5484D', '#8B5CF6', '#0EA5A4', '#F97316', '#1B1D22'];
const hue = (name: string): string => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };

/** Round profile picture, or a coloured monogram when the person has none. */
export const UserAvatar = memo(function UserAvatar({ user, size = 32, className }: { user: Pick<SocialUser, 'username' | 'avatar'> | null; size?: number; className?: string }) {
  const name = user?.username ?? '?';
  if (user?.avatar) return <img src={user.avatar} alt="" width={size} height={size} loading="lazy" className={cn('shrink-0 rounded-full object-cover shadow-[0_0_0_1.5px_#fff,0_0_0_2.5px_rgba(12,13,16,.1)]', className)} style={{ width: size, height: size }}/>;
  return <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full font-black uppercase text-white shadow-[0_0_0_1.5px_#fff,0_0_0_2.5px_rgba(12,13,16,.1)]', className)} style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,.35), transparent 55%), ${hue(name)}`, fontSize: size * 0.4 }}>{name.slice(0, 2)}</span>;
});

/** Clickable @username that opens the person's profile. */
export function UserLink({ user, className, onClick }: { user: SocialUser | null; className?: string; onClick?: () => void }) {
  if (!user) return <span className={cn('font-extrabold', className)}>ObjectPad</span>;
  return <Link to={`/u/${user.username}`} onClick={onClick} className={cn('font-extrabold hover:underline hover:underline-offset-2', className)}>@{user.username}</Link>;
}
