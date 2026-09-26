import { LogIn } from 'lucide-react';
import { useSession } from '@/lib/session';
import { Inbox } from '@/components/social/Notifications';

/** Full-page inbox: everything you missed while away, plus tips to accept or decline. */
export default function NotificationsPage() {
  const session = useSession();
  return <div className="page max-w-2xl py-8 sm:py-12">
    <p className="lab">Inbox</p>
    <h1 className="display mt-3 text-[40px] leading-none sm:text-[52px]">While you were away.</h1>
    <p className="mt-3 text-[15px] font-semibold text-ink/60">Mentions, tips waiting for you, rains you caught and everything your account has been up to.</p>
    <div className="raised mt-6 rounded-[30px] p-3 sm:p-4">
      {session.authenticated ? <Inbox/> : <div className="py-12 text-center"><button onClick={() => session.login()} className="btn press min-h-12 px-6 text-[14px]"><LogIn size={16}/>Sign in to see your notifications</button></div>}
    </div>
  </div>;
}
