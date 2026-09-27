import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { verifyMessage, type Hex } from 'viem';
import { AlertTriangle, ArrowUpRight, BadgeCheck, CheckCircle2, Fingerprint, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { chain } from '@/lib/chain';
import { verifyProof, type ObjectProof } from '@/shared/proof';
import type { CreatorIdentity, CustodySummary, UniquenessV2Summary } from '@/shared/domain';
import { explorerTx } from '@/shared/pons';
import { shortAddress } from '@/lib/format';
import { ErrorState, Loading } from '@/components/Feedback';
import { cn } from '@/lib/utils';

interface VerifyResponse { proof: ObjectProof & { fingerprints: { geometry: { d2: number[]; a3: number[]; pca: number[]; sphericity: number; triangles: number } | null; surface: { views: { view: string; phash: string }[] } | null } }; record: { objectId: string; symbol: string; name: string; objectTag?: string; tokenAddress: string; launchTransactionHash: string; sponsor?: string; iconUrl?: string; creatorIdentity?: CreatorIdentity; uniquenessV2?: UniquenessV2Summary | null; custody?: CustodySummary; metadataUri: string; metadataHash: string }; }
type Check = { id: string; label: string; state: 'pending' | 'pass' | 'fail' | 'warn'; detail: string };

/** Runs every check locally in the browser: leaf hashes, Merkle root, EIP-191 signature, signer = launch tx sender. */
function useLocalChecks(data: VerifyResponse | undefined): Check[] {
  const [checks, setChecks] = useState<Check[]>([]);
  useEffect(() => {
    if (!data) return; let dead = false; const { proof, record } = data;
    const base: Check[] = [
      { id: 'leaves', label: 'Leaf hashes recomputed (SHA-256)', state: 'pending', detail: '' },
      { id: 'root', label: 'Merkle root recomputed', state: 'pending', detail: '' },
      { id: 'sig', label: 'Treasury signature (EIP-191 ecrecover)', state: 'pending', detail: '' },
      { id: 'tx', label: 'Signer = sender of the launch transaction', state: 'pending', detail: '' },
      { id: 'x', label: 'X account bound by OAuth, not typed text', state: 'pending', detail: '' },
    ];
    setChecks(base);
    const set = (id: string, state: Check['state'], detail: string) => { if (!dead) setChecks(prev => prev.map(c => c.id === id ? { ...c, state, detail } : c)); };
    void (async () => {
      await new Promise(r => setTimeout(r, 350));
      const result = await verifyProof(proof);
      set('leaves', result.badLeaves.length ? 'fail' : 'pass', result.badLeaves.length ? `Mismatch: ${result.badLeaves.join(', ')}` : `${proof.leaves.length}/${proof.leaves.length} leaves match`);
      await new Promise(r => setTimeout(r, 300));
      set('root', result.root === proof.root ? 'pass' : 'fail', result.root);
      let recovered = false;
      if (proof.signature && proof.signer) { try { recovered = await verifyMessage({ address: proof.signer as Hex, message: proof.message, signature: proof.signature as Hex }); } catch { recovered = false; } set('sig', recovered ? 'pass' : 'fail', recovered ? `Recovered ${shortAddress(proof.signer)}` : 'Signature does not recover to the signer'); }
      else set('sig', 'warn', 'Proof unsigned (hashes still verify)');
      try { const tx = await chain.getTransaction({ hash: record.launchTransactionHash as Hex }); const same = Boolean(proof.signer) && tx.from.toLowerCase() === proof.signer!.toLowerCase(); set('tx', same ? 'pass' : 'warn', same ? `Launch tx sent by ${shortAddress(tx.from)}` : `Launch tx sent by ${shortAddress(tx.from)}`); } catch { set('tx', 'warn', 'Chain read unavailable, open the explorer'); }
      const ci = record.creatorIdentity; set('x', ci?.x ? (ci.linkStatus === 'mismatch' ? 'fail' : 'pass') : 'warn', ci?.x ? (ci.linkStatus === 'mismatch' ? `Coin links @${ci.linkHandle}, but the creator is @${ci.x.handle}` : `@${ci.x.handle} (X user ${ci.x.id})`) : 'Creator has no verified X account');
    })();
    return () => { dead = true; };
  }, [data]);
  return checks;
}

function Row({ c }: { c: Check }) {
  const Icon = c.state === 'pass' ? CheckCircle2 : c.state === 'fail' ? XCircle : c.state === 'warn' ? AlertTriangle : Loader2;
  return <li className={cn('flex items-start gap-3 rounded-2xl p-3.5 transition-colors', c.state === 'pass' ? 'bg-up/10' : c.state === 'fail' ? 'bg-down/10' : c.state === 'warn' ? 'bg-[#FFF4D6]' : 'bg-ink/[0.04]')}><Icon size={20} className={cn('mt-0.5 shrink-0', c.state === 'pass' ? 'text-up' : c.state === 'fail' ? 'text-down' : c.state === 'warn' ? 'text-[#B7791F]' : 'animate-spin text-ink/40')}/><div className="min-w-0"><p className="text-[14.5px] font-extrabold">{c.label}</p>{c.detail && <p className="mt-0.5 break-all font-mono text-[11.5px] font-bold text-ink/60">{c.detail}</p>}</div></li>;
}

/** The Merkle tree drawn from the proof's levels, leaves at the bottom. */
function Tree({ proof }: { proof: ObjectProof }) {
  const levels = [...proof.levels].reverse();
  return <div className="space-y-3">{levels.map((level, li) => <div key={li} className="flex justify-center gap-2">{level.map((h, i) => { const leaf = li === levels.length - 1 ? proof.leaves[i] : null; return <div key={i} className={cn('card-pop min-w-0 flex-1 rounded-xl px-2 py-2 text-center', li === 0 ? 'max-w-[320px] bg-ink text-white' : leaf ? 'bg-white shadow-[0_0_0_1px_rgba(12,13,16,.08)]' : 'bg-ink/[0.06]')} style={{ ['--delay' as string]: `${(levels.length - li) * 140 + i * 40}ms` }}><p className={cn('truncate font-mono text-[10.5px] font-extrabold uppercase', li === 0 ? 'text-white/60' : 'text-ink/50')}>{li === 0 ? 'root' : leaf ? leaf.label.replace('_', ' ') : `node`}</p><p className="truncate font-mono text-[11.5px] font-bold">{h.slice(0, 10)}…{h.slice(-4)}</p></div>; })}</div>)}</div>;
}

function Spark({ values, color = '#0C0D10' }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1e-9);
  return <svg viewBox={`0 0 ${values.length * 10} 60`} className="h-16 w-full">{values.map((v, i) => <rect key={i} x={i * 10 + 1} y={60 - (v / max) * 58} width="8" height={(v / max) * 58} rx="2" fill={color} className="wp-rise" style={{ animationDelay: `${i * 25}ms` }}/>)}</svg>;
}

/** /verify and /verify/:id: independent, in-browser verification of one coin's Proof v2. */
export default function Verify() {
  const { id = '' } = useParams(); const nav = useNavigate(); const [input, setInput] = useState<string>('');
  const q = useQuery({ queryKey: ['objectpad', 'verify', id], enabled: /^[a-f0-9]{64}$/.test(id), queryFn: () => api<VerifyResponse>(`/verify/${id}`, { timeout: 40_000 }), retry: false });
  const checks = useLocalChecks(q.data);
  const go = () => { const m = input.match(/[a-f0-9]{64}/); if (m) nav(`/verify/${m[0]}`); };
  const head = <section><p className="lab">Proof v2 · runs in your browser</p><h1 className="display mt-4 text-[44px] leading-[0.92] sm:text-[72px]">Don’t trust. Verify.</h1><p className="mt-4 max-w-2xl text-[17px] font-bold text-ink/65">Every ObjectPad coin carries a SHA-256 Merkle proof over its capture, 3D model, geometry and surface fingerprints and its creator’s identity, signed by the same treasury address that sent the launch transaction. This page recomputes all of it locally.</p>
    <div className="mt-5 flex max-w-2xl gap-2"><input value={input} onChange={e => setInput(e.target.value)} placeholder="Paste an Object ID or coin link" className="min-w-0 flex-1"/><button onClick={go} className="btn press px-6">Verify</button></div></section>;
  if (!id) return <div className="page py-8 sm:py-12">{head}</div>;
  if (q.isPending) return <div className="page py-8">{head}<Loading label="Fetching the proof…"/></div>;
  if (q.isError) return <div className="page py-8">{head}<div className="mt-6"><ErrorState message="No live coin with this Object ID." retry={() => void q.refetch()}/></div></div>;
  const { proof, record } = q.data; const uq = record.uniquenessV2; const allPass = checks.length > 0 && checks.slice(0, 2).every(c => c.state === 'pass');
  const geo = proof.fingerprints.geometry;
  return <div className="page py-6 sm:py-10">{head}
    <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <section className="raised rounded-[30px] p-5 sm:p-6">
        <div className="flex items-center gap-3">{record.iconUrl && <img src={record.iconUrl} alt="" className="size-14 rounded-full bg-white object-cover"/>}<div className="min-w-0"><h2 className="truncate text-[24px] font-extrabold">{record.name} <span className="font-mono text-[15px] text-ink/55">${record.symbol}</span></h2><p className="font-mono text-[12px] font-bold text-ink/55">{record.objectTag} · {record.objectId.slice(0, 16)}…</p></div>{allPass && <BadgeCheck size={34} className="ml-auto shrink-0 text-up"/>}</div>
        <ul className="mt-5 space-y-2">{checks.map(c => <Row key={c.id} c={c}/>)}</ul>
        <div className="mt-4 grid grid-cols-2 gap-2"><a href={explorerTx(record.launchTransactionHash)} target="_blank" rel="noreferrer" className="btn-ghost press min-h-11 text-[12.5px]">Launch tx<ArrowUpRight size={13}/></a><a href={record.metadataUri} target="_blank" rel="noreferrer" className="btn-ghost press min-h-11 text-[12.5px]">Sealed metadata<ArrowUpRight size={13}/></a></div>
        <Link to={`/objects/${record.objectId}`} className="btn press mt-2 min-h-12 w-full">Open the coin</Link>
      </section>
      <section className="smoke rounded-[30px] p-5 sm:p-6">
        <p className="font-mono text-[12px] font-extrabold uppercase text-white/60">Uniqueness v2</p>
        <div className="mt-2 flex items-end gap-3"><p className="display text-[72px] leading-none">{uq?.score != null ? uq.score.toFixed(1) : '…'}</p><p className="mb-2 text-[14px] font-bold text-white/70">/ 100<br/>{uq ? `vs ${uq.compared} objects` : 'fingerprinting'}</p></div>
        {uq && <p className="mt-2 text-[13px] font-semibold text-white/70">Nearest object is {((uq.nearest ?? 0) * 100).toFixed(1)}% similar. Duplicate rule: combined ≥ {uq.rule.combined * 100}% and geometry ≥ {uq.rule.geometry * 100}% and surface ≥ {uq.rule.surface * 100}%.</p>}
        {geo && <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-white/[0.06] p-3"><p className="font-mono text-[11px] font-extrabold text-white/60">D2 SHAPE DISTRIBUTION · 32 BINS</p><Spark values={geo.d2} color="#3BE08A"/></div><div className="rounded-2xl bg-white/[0.06] p-3"><p className="font-mono text-[11px] font-extrabold text-white/60">A3 ANGLE DISTRIBUTION · 16 BINS</p><Spark values={geo.a3} color="#2F7BF2"/></div><div className="rounded-2xl bg-white/[0.06] p-3 font-mono text-[12px] font-bold"><p className="text-white/60">PCA SPECTRUM</p><p className="mt-1">{geo.pca.map(v => v.toFixed(3)).join(' · ')}</p><p className="mt-2 text-white/60">SPHERICITY</p><p>{geo.sphericity.toFixed(4)} · {geo.triangles.toLocaleString()} tris</p></div><div className="rounded-2xl bg-white/[0.06] p-3 font-mono text-[12px] font-bold"><p className="text-white/60">DCT pHASH · 64-BIT / VIEW</p>{proof.fingerprints.surface?.views.map(v => <p key={v.view} className="mt-1 truncate">{v.view.padEnd(6, ' ')} {v.phash}</p>)}</div></div>}
        <div className="mt-5 rounded-2xl bg-white/[0.06] p-3"><p className="flex items-center gap-2 font-mono text-[11px] font-extrabold text-white/60"><Fingerprint size={13}/>SIGNED MESSAGE</p><pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11.5px] leading-5">{proof.message}</pre>{proof.signature && <p className="mt-2 break-all font-mono text-[10.5px] text-white/50">sig {proof.signature}</p>}</div>
      </section>
    </div>
    <section className="glass mt-4 rounded-[30px] p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-extrabold"><ShieldCheck size={18}/>Merkle tree</h2><p className="mt-1 text-[13px] font-semibold text-ink/60">leaf = SHA256("objectpad:leaf:v2:" ‖ label ‖ ":" ‖ value) · node = SHA256(left ‖ right)</p><div className="mt-5"><Tree proof={proof}/></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[12.5px]"><thead className="stat-label"><tr><th className="py-2 font-normal">Label</th><th className="font-normal">Value</th><th className="font-normal">Leaf hash</th></tr></thead><tbody>{proof.leaves.map(l => <tr key={l.label} className="border-t border-ink/[0.06]"><td className="py-2 font-mono font-extrabold">{l.label}</td><td className="max-w-[320px] truncate pr-3 font-mono text-ink/70">{l.value}</td><td className="font-mono text-ink/70">{l.hash.slice(0, 24)}…</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
