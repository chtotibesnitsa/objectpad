import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AtSign, Camera, Check, Copy, ExternalLink, KeyRound, Loader2, LogIn, Plus, Trash2, UserRound, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ACCOUNT_KEY, linkDevWallet, linkSessionWallet, useAccount } from '@/lib/account';
import { addDevWallet, devWallets, type DevWallet } from '@/lib/devWallet';
import { socialError, uploadAvatar, useSocial, SOCIAL_ME } from '@/lib/social';
import { copyText, shortAddress } from '@/lib/format';
import { UserAvatar } from '@/components/social/UserChip';
import { cn } from '@/lib/utils';

function Section({ n, title, sub, children }: { n: string; title: string; sub: string; children: React.ReactNode }) {
  return <section className="raised rounded-[30px] p-5 sm:p-6"><div className="flex items-start gap-3"><span className="font-mono text-[12px] font-black text-ink/35">{n}</span><div><h2 className="display text-[24px] leading-none">{title}</h2><p className="mt-1.5 text-[13.5px] font-semibold text-ink/55">{sub}</p></div></div><div className="mt-5">{children}</div></section>;
}

/** Profile, linked X, linked MetaMask/external wallets and on-site wallets, all in one place. */
export function Settings() {
  const session = useSession(); const social = useSocial(); const account = useAccount(); const qc = useQueryClient();
  const me = social.me; const [username, setUsername] = useState<string>(''); const [bio, setBio] = useState<string>(''); const [saved, setSaved] = useState<boolean>(false); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<DevWallet[]>(() => devWallets()); const [reveal, setReveal] = useState<string>(''); const [copied, setCopied] = useState<string>(''); const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (me) { setUsername(me.username ?? ''); setBio(me.bio); } }, [me?.username, me?.bio]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: SOCIAL_ME }), qc.invalidateQueries({ queryKey: ACCOUNT_KEY })]); };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(null); try { await fn(); await refresh(); } catch (e) { setError(socialError(e)); } finally { setBusy(null); } };
  const copy = (v: string) => void copyText(v).then(() => { setCopied(v); setTimeout(() => setCopied(''), 1400); });

  if (!session.authenticated) return <div className="page max-w-3xl py-16 text-center"><UserRound size={34} className="mx-auto text-ink/40"/><h1 className="display mt-4 text-[44px]">Your ObjectPad profile.</h1><p className="mt-3 text-[15px] font-semibold text-ink/60">Sign in with X, MetaMask or email to set a username, chat, tip and make it rain.</p><button onClick={() => session.login()} className="btn press mt-6 min-h-14 px-8 text-[15px]"><LogIn size={17}/>Sign in / Sign up</button></div>;
  const linked = account.data?.wallets ?? []; const isLinked = (a: string) => linked.some(w => w.address === a.toLowerCase());
  const sessionWallet = session.wallet?.toLowerCase() ?? null;

  return <div className="page max-w-4xl py-8 sm:py-12">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">Settings</p><h1 className="display mt-3 text-[40px] leading-none sm:text-[54px]">Your profile.</h1></div>{me?.username && <Link to={`/u/${me.username}`} className="btn press min-h-12 px-5 text-[14px]">View public profile<ExternalLink size={14}/></Link>}</div>
    {error && <p className="slide-in mt-5 rounded-2xl bg-[#E5484D]/10 px-4 py-3 text-[13.5px] font-bold text-[#C52F35]">{error}</p>}
    <div className="mt-6 space-y-4">
      <Section n="01" title="Profile" sub="Your public name, picture and bio across chat, tips and your profile page.">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => file.current?.click()} className="group relative rounded-full" aria-label="Change profile picture"><UserAvatar user={me ? { username: me.username ?? '?', avatar: me.avatar } : null} size={104}/><span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100">{busy === 'avatar' ? <Loader2 className="animate-spin"/> : <Camera/>}</span></button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run('avatar', async () => { await uploadAvatar(await session.token(), f); }); }}/>
            {me?.customAvatar && <button onClick={() => void run('avatar-del', async () => { await api('/social/avatar', { token: await session.token(), method: 'DELETE' }); })} className="text-[12px] font-bold text-ink/50 hover:text-ink">Remove</button>}
          </div>
          <div className="flex-1 space-y-3">
            <label className="block"><span className="mb-1.5 block font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Username</span><span className="sunk flex items-center gap-2 rounded-2xl px-4 py-3"><AtSign size={16} className="text-ink/45"/><input value={username} onChange={e => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20))} className="w-full bg-transparent text-[16px] font-extrabold outline-none"/></span></label>
            <label className="block"><span className="mb-1.5 block font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Bio · {bio.length}/160</span><textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 160))} rows={3} placeholder="Collector of weird objects. Scanning everything." className="sunk w-full resize-none rounded-2xl px-4 py-3 text-[14.5px] font-semibold outline-none"/></label>
            <button onClick={() => void run('profile', async () => { await api('/social/profile', { token: await session.token(), method: 'POST', body: { username, bio } }); setSaved(true); setTimeout(() => setSaved(false), 1800); })} disabled={busy === 'profile' || username.length < 3} className="press flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[14px] font-bold tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_14px_30px_-14px_rgba(12,13,16,.9)] transition-opacity hover:bg-ink/90 disabled:pointer-events-none disabled:opacity-40">{busy === 'profile' ? <Loader2 size={15} className="animate-spin"/> : saved ? <Check size={15}/> : null}{saved ? 'Saved' : 'Save profile'}</button>
          </div>
        </div>
      </Section>

      <Section n="02" title="X account" sub="Shows your handle next to your name and unlocks Post & Earn.">
        {me?.x ? <div className="sunk flex items-center gap-3 rounded-2xl p-3">{me.x.avatar ? <img src={me.x.avatar} alt="" className="size-11 rounded-full"/> : <span className="flex size-11 items-center justify-center rounded-full bg-ink text-white">𝕏</span>}<div className="flex-1"><p className="text-[15px] font-extrabold">@{me.x.handle}</p><p className="font-mono text-[11.5px] font-bold text-[#12A150]">● Linked & verified</p></div><a href={`https://x.com/${me.x.handle}`} target="_blank" rel="noreferrer" className="btn-ghost press min-h-10 px-3 text-[12.5px]">Open<ExternalLink size={12}/></a></div>
          : <button onClick={() => session.linkX?.()} className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-extrabold text-white">𝕏 Link your X account</button>}
        <p className="mt-2 text-[12px] font-semibold text-ink/45">One X account per ObjectPad account, verified through X sign-in.</p>
      </Section>

      <Section n="03" title="MetaMask & linked wallets" sub="Wallets you’ve proven you control. Tips and rain can land in any of them.">
        <div className="space-y-1.5">
          {linked.map(w => <div key={w.address} className="sunk flex items-center gap-3 rounded-2xl px-3 py-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-white text-[15px]">{w.address === sessionWallet ? '🦊' : w.kind === 'account' ? '◆' : '◎'}</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-extrabold">{w.kind === 'account' ? 'Account wallet' : w.address === sessionWallet ? 'Signed-in wallet' : local.some(l => l.address.toLowerCase() === w.address) ? 'On-site wallet' : 'Linked wallet'}</span><span className="block font-mono text-[11.5px] text-ink/55">{shortAddress(w.address, 8, 6)} · {w.claimableEth > 0 ? `${w.claimableEth.toFixed(5)} ETH fees` : 'no fees waiting'}</span></span><button onClick={() => copy(w.address)} className="press flex size-9 items-center justify-center rounded-xl hover:bg-white" aria-label="Copy">{copied === w.address ? <Check size={14}/> : <Copy size={14}/>}</button></div>)}
          {!linked.length && <p className="text-[13px] font-bold text-ink/50">{account.isPending ? 'Loading wallets…' : 'No wallets linked yet.'}</p>}
        </div>
        {sessionWallet && !isLinked(sessionWallet) && <button onClick={() => void run('link-session', async () => { const m = account.data; if (!m) throw new Error('Your account is still loading. Try again in a second.'); await linkSessionWallet(await session.token(), session.wallet!, m.publicId, session.sign); })} className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#F6851B] text-[14px] font-black text-white shadow-[0_12px_24px_-12px_rgba(246,133,27,.9)]">{busy === 'link-session' ? <Loader2 size={15} className="animate-spin"/> : '🦊'}Link {shortAddress(sessionWallet, 6, 4)} with one signature</button>}
        <button onClick={() => session.login(['wallet'])} className="btn-ghost press mt-3 min-h-12 w-full text-[14px]"><Wallet size={15}/>Connect MetaMask or another wallet</button>
        <p className="mt-2 text-[12px] font-semibold text-ink/45">Linking asks your wallet to sign a free message. Nothing is sent or spent.</p>
      </Section>

      <Section n="04" title="On-site wallets" sub="Wallets created in this browser. Buy, sell and tip from several at once. Keys never leave this device.">
        <div className="space-y-1.5">{local.map((w, i) => <div key={w.address} className="sunk rounded-2xl px-3 py-2.5"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-white font-mono text-[12px] font-black">{i + 1}</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-extrabold">{w.label ?? (i === 0 ? 'On-site wallet' : `On-site wallet ${i + 1}`)}</span><span className="block font-mono text-[11.5px] text-ink/55">{shortAddress(w.address, 8, 6)}</span></span>
          {!isLinked(w.address) && <button onClick={() => void run(`link-${w.address}`, async () => { const m = account.data; if (!m) throw new Error('Your account is still loading.'); await linkDevWallet(await session.token(), w, m.publicId); })} className="press rounded-xl bg-ink px-3 py-2 text-[12px] font-extrabold text-white">{busy === `link-${w.address}` ? '…' : 'Link'}</button>}
          <button onClick={() => copy(w.address)} className="press flex size-9 items-center justify-center rounded-xl hover:bg-white" aria-label="Copy address">{copied === w.address ? <Check size={14}/> : <Copy size={14}/>}</button>
          <button onClick={() => setReveal(r => r === w.address ? '' : w.address)} className="press flex size-9 items-center justify-center rounded-xl hover:bg-white" aria-label="Show private key"><KeyRound size={14}/></button></div>
          {reveal === w.address && <div className="slide-in mt-2 rounded-xl bg-ink p-3 text-white"><p className="font-mono text-[10.5px] font-extrabold uppercase text-[#F2C94C]">Private key · never share it</p><p className="mt-1 break-all font-mono text-[11.5px]">{w.privateKey}</p><button onClick={() => copy(w.privateKey)} className="mt-2 text-[12px] font-extrabold text-white/70 hover:text-white">{copied === w.privateKey ? 'Copied' : 'Copy key'}</button></div>}
        </div>)}</div>
        <button onClick={() => void run('add', async () => { const w = addDevWallet(); setLocal(devWallets()); const m = account.data; if (m) await linkDevWallet(await session.token(), w, m.publicId); })} disabled={local.length >= 8} className="btn press mt-3 min-h-12 w-full text-[14px] disabled:opacity-40">{busy === 'add' ? <Loader2 size={15} className="animate-spin"/> : <Plus size={15}/>}Add an on-site wallet</button>
        <p className="mt-2 text-[12px] font-semibold text-ink/45">Back up each key. If you clear this browser without a backup, the wallet can’t be recovered. <Link to="/wallet" className="underline">Deposit & withdraw →</Link></p>
      </Section>

      <div className="flex justify-center pt-2"><button onClick={() => session.logout()} className="flex items-center gap-2 text-[13px] font-bold text-ink/50 hover:text-ink"><Trash2 size={14} className="hidden"/>Sign out</button></div>
    </div>
  </div>;
}

export default Settings;
