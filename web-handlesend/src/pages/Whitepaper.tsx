import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const SECTIONS = [
  ['abstract', 'Abstract'], ['problem', '1. The problem'], ['capture', '2. Capture pipeline'], ['hashing', '3. Hashing & commitments'],
  ['uniqueness', '4. Uniqueness v2'], ['math', '5. Collision math'], ['reconstruction', '6. 3D reconstruction'], ['identity', '7. Identity & anti-impersonation'],
  ['proof', '8. Proof v2 (Merkle + EIP-191)'], ['launch', '9. Launch on Pons V2'], ['vaults', '10. Object Vaults & indexes'], ['custody', '11. Proof of custody'],
  ['economy', '12. $OBJECTPAD economy'], ['threats', '13. Threat model'], ['limits', '14. What it does not prove'], ['roadmap', '15. Roadmap'],
] as const;

function Sec({ id, n, title, children }: { id: string; n?: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-28 border-t border-ink/[0.08] py-12 first:border-t-0 first:pt-0"><p className="font-mono text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink/50">{n ?? 'ObjectPad'}</p><h2 className="display mt-2 text-[32px] sm:text-[44px]">{title}</h2><div className="wp mt-5 space-y-4 text-[16.5px] leading-[1.75] text-ink/80">{children}</div></section>;
}
function Eq({ children, label }: { children: ReactNode; label?: string }) { return <div className="my-5 overflow-x-auto rounded-2xl bg-ink px-5 py-4 font-mono text-[14px] font-bold leading-7 text-[#E9FBEF]">{label && <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</p>}{children}</div>; }
function Figure({ children, caption }: { children: ReactNode; caption: string }) { return <figure className="steel my-6 overflow-hidden rounded-[28px] p-3"><div className="raised overflow-hidden rounded-[22px] p-4">{children}</div><figcaption className="px-2 pt-2.5 font-mono text-[11.5px] font-bold text-ink/55">{caption}</figcaption></figure>; }
function Table({ rows, head }: { rows: string[][]; head: string[] }) { return <div className="my-5 overflow-x-auto rounded-2xl bg-white/70 shadow-[0_0_0_1px_rgba(12,13,16,.07)]"><table className="w-full min-w-[520px] text-left text-[14px]"><thead className="stat-label"><tr>{head.map(h => <th key={h} className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r[0]} className="border-t border-ink/[0.06]">{r.map((c, i) => <td key={i} className={cn('px-4 py-2.5', i === 0 ? 'font-mono font-extrabold' : 'text-ink/75')}>{c}</td>)}</tr>)}</tbody></table></div>; }

/** Animated end-to-end pipeline: phone → frames → hashes → fingerprints → Merkle root → chain. */
function PipelineFigure() {
  const nodes = [['Phone', '6 guided angles'], ['Frames', 'SHA-256 + dHash'], ['3D model', 'GLB · validated'], ['Fingerprints', 'geometry · surface'], ['Merkle root', 'signed EIP-191'], ['Robinhood Chain', 'Pons V2 launch']];
  return <svg viewBox="0 0 1200 220" className="w-full">
    {nodes.slice(0, -1).map((_, i) => <line key={i} x1={100 + i * 200 + 70} y1={110} x2={100 + (i + 1) * 200 - 70} y2={110} stroke="#12A150" strokeWidth="4" className="wp-flow"/>)}
    {nodes.map(([a, b], i) => <g key={a} className="card-pop" style={{ ['--delay' as string]: `${i * 140}ms` }}><rect x={100 + i * 200 - 70} y={60} width={140} height={100} rx={22} fill={i === 5 ? '#0C0D10' : '#fff'} stroke="#0C0D10" strokeOpacity=".12"/><circle cx={100 + i * 200} cy={60} r={9} fill="#12A150" className="wp-pulse" style={{ animationDelay: `${i * 0.3}s` }}/><text x={100 + i * 200} y={108} textAnchor="middle" fontSize="19" fontWeight="800" fill={i === 5 ? '#fff' : '#0C0D10'}>{a}</text><text x={100 + i * 200} y={134} textAnchor="middle" fontSize="13" fontFamily="Geist Mono" fill={i === 5 ? '#ffffffaa' : '#0C0D1099'}>{b}</text></g>)}
  </svg>;
}
/** SHA-256 avalanche: flipping one input character changes ~half of the 256 output bits. */
function AvalancheFigure() {
  const [a, setA] = useState<string>(''); const [b, setB] = useState<string>(''); const [tick, setTick] = useState<number>(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 2200); return () => clearInterval(t); }, []);
  useEffect(() => { const run = async () => { const h = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), x => x.toString(16).padStart(2, '0')).join(''); setA(await h(`objectpad:frame:front:${tick}`)); setB(await h(`objectpad:frame:front:${tick + 1}`)); }; void run(); }, [tick]);
  const bits = (hex: string) => hex.split('').flatMap(c => parseInt(c, 16).toString(2).padStart(4, '0').split('')); const ba = bits(a), bb = bits(b); const diff = ba.filter((x, i) => x !== bb[i]).length;
  return <div><div className="grid grid-cols-[repeat(32,minmax(0,1fr))] gap-[3px]">{ba.map((x, i) => <span key={i} className={cn('aspect-square rounded-[3px] transition-colors duration-500', x !== bb[i] ? 'bg-[#12A150]' : x === '1' ? 'bg-ink' : 'bg-ink/10')}/>)}</div>
    <p className="mt-3 font-mono text-[12px] font-bold text-ink/65">input …:{tick} vs …:{tick + 1} → <span className="text-up">{diff}/256 bits flipped</span> (expected 128 ± 8)</p></div>;
}
/** Hamming distance between two 64-bit perceptual hashes. */
function HammingFigure() {
  const [seed, setSeed] = useState<number>(1); useEffect(() => { const t = setInterval(() => setSeed(s => s + 1), 1800); return () => clearInterval(t); }, []);
  const a = useMemo(() => Array.from({ length: 64 }, (_, i) => ((i * 2654435761) >>> 7) & 1), []);
  const flips = seed % 4 === 0 ? 2 : seed % 4 === 1 ? 5 : seed % 4 === 2 ? 1 : 31;
  const b = a.map((v, i) => (((i * 7 + seed * 13) % 64) < flips ? 1 - v : v)); const d = a.filter((v, i) => v !== b[i]).length;
  return <div className="grid gap-4 sm:grid-cols-[1fr_auto]"><div className="space-y-2">{[a, b].map((row, r) => <div key={r} className="grid grid-cols-[repeat(32,minmax(0,1fr))] gap-[3px]">{row.map((v, i) => <span key={i} className={cn('aspect-square rounded-[3px] transition-colors duration-500', row === b && v !== a[i] ? 'bg-down' : v ? 'bg-ink' : 'bg-ink/10')}/>)}</div>)}</div>
    <div className="flex flex-col justify-center rounded-2xl bg-ink px-5 py-3 text-white"><p className="font-mono text-[11px] text-white/55">HAMMING</p><p className="display text-[44px] leading-none">{d}</p><p className={cn('mt-1 font-mono text-[12px] font-extrabold', d <= 3 ? 'text-[#FF8A80]' : 'text-[#3BE08A]')}>{d <= 3 ? 'SAME ANGLE → reject' : 'distinct → accept'}</p></div></div>;
}
/** D2 shape distributions of two different objects vs the same object. */
function D2Figure() {
  const curve = (k: number, m: number, s: number) => Array.from({ length: 32 }, (_, i) => Math.exp(-((i / 32 * 3 - m) ** 2) / (2 * s * s)) * (1 + 0.15 * Math.sin(i * k)));
  const mug = curve(1.3, 1.25, 0.42); const shoe = curve(0.7, 0.95, 0.55); const max = Math.max(...mug, ...shoe);
  return <svg viewBox="0 0 640 200" className="w-full">{mug.map((v, i) => <rect key={`m${i}`} x={i * 20 + 2} y={190 - (v / max) * 170} width={8} height={(v / max) * 170} rx={2} fill="#12A150" className="wp-rise" style={{ animationDelay: `${i * 20}ms` }}/>)}{shoe.map((v, i) => <rect key={`s${i}`} x={i * 20 + 10} y={190 - (v / max) * 170} width={8} height={(v / max) * 170} rx={2} fill="#2F7BF2" opacity=".85" className="wp-rise" style={{ animationDelay: `${300 + i * 20}ms` }}/>)}<text x="630" y="24" textAnchor="end" fontSize="14" fontWeight="800" fill="#12A150">mug</text><text x="630" y="44" textAnchor="end" fontSize="14" fontWeight="800" fill="#2F7BF2">sneaker</text><text x="4" y="16" fontSize="12" fontFamily="Geist Mono" fill="#0C0D1088">p(d), d = |pᵢ − pⱼ| / r_rms, 32 bins on [0, 3]</text></svg>;
}
/** Merkle tree with 6 leaves building up to the root. */
function MerkleFigure() {
  const leaves = ['object_id', 'manifest', 'model', 'geometry', 'surface', 'identity'];
  const lx = (i: number) => 70 + i * 212; const l1 = [0, 1, 2].map(i => (lx(i * 2) + lx(i * 2 + 1)) / 2); const l2 = [(l1[0] + l1[1]) / 2, (l1[2] + l1[2]) / 2]; const root = (l2[0] + l2[1]) / 2;
  const box = (x: number, y: number, t: string, dark = false, d = 0) => <g key={`${x}${y}`} className="card-pop" style={{ ['--delay' as string]: `${d}ms` }}><rect x={x - 64} y={y - 20} width={128} height={40} rx={12} fill={dark ? '#0C0D10' : '#fff'} stroke="#0C0D10" strokeOpacity=".14"/><text x={x} y={y + 5} textAnchor="middle" fontSize="13" fontFamily="Geist Mono" fontWeight="700" fill={dark ? '#3BE08A' : '#0C0D10'}>{t}</text></g>;
  const edge = (x1: number, y1: number, x2: number, y2: number) => <line key={`${x1}${y1}${x2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#12A150" strokeWidth="2.5" className="wp-flow"/>;
  return <svg viewBox="0 0 1200 330" className="w-full">
    {leaves.map((_, i) => edge(lx(i), 270, l1[Math.floor(i / 2)], 190))}{l1.map((x, i) => edge(x, 190, l2[Math.floor(i / 2)], 110))}{l2.map(x => edge(x, 110, root, 40))}
    {leaves.map((t, i) => box(lx(i), 290, t, false, i * 80))}{l1.map((x, i) => box(x, 190, `H(${i * 2}‖${i * 2 + 1})`, false, 600 + i * 80))}{l2.map((x, i) => box(x, 110, i ? 'H(4‖4)' : 'H(a‖b)', false, 900 + i * 80))}{box(root, 40, 'ROOT', true, 1100)}
  </svg>;
}
/** Identity binding: the X OAuth subject and wallet are hashed into the same root as the object. */
function IdentityFigure() {
  return <svg viewBox="0 0 1200 200" className="w-full">
    {[['X OAuth', 'immutable user id', 150], ['Privy wallet', 'fee recipient', 450], ['Object root', 'sha256 Merkle', 750], ['Treasury sig', 'EIP-191', 1050]].map(([a, b, x], i) => <g key={a as string} className="card-pop" style={{ ['--delay' as string]: `${i * 150}ms` }}><circle cx={x as number} cy={90} r={62} fill={i === 3 ? '#0C0D10' : '#fff'} stroke="#0C0D10" strokeOpacity=".14"/><circle cx={x as number} cy={90} r={72} fill="none" stroke="#2F7BF2" strokeOpacity=".35" strokeWidth="2" className="wp-pulse" style={{ animationDelay: `${i * .4}s` }}/><text x={x as number} y={88} textAnchor="middle" fontSize="17" fontWeight="800" fill={i === 3 ? '#fff' : '#0C0D10'}>{a}</text><text x={x as number} y={110} textAnchor="middle" fontSize="12" fontFamily="Geist Mono" fill={i === 3 ? '#ffffff99' : '#0C0D1088'}>{b}</text></g>)}
    {[220, 520, 820].map(x => <line key={x} x1={x} y1={90} x2={x + 160} y2={90} stroke="#2F7BF2" strokeWidth="4" className="wp-flow"/>)}
  </svg>;
}
/** Index level from two constituents. */
function IndexFigure() {
  const a = Array.from({ length: 48 }, (_, i) => 1 + 0.4 * Math.sin(i / 7) + i / 60); const b = Array.from({ length: 48 }, (_, i) => 2 + 0.6 * Math.cos(i / 5) - i / 90);
  const idx = a.map((v, i) => 1000 * (v + b[i]) / (a[0] + b[0])); const path = (s: number[], min: number, max: number) => s.map((v, i) => `${i ? 'L' : 'M'}${i * 13 + 10},${190 - ((v - min) / (max - min)) * 170}`).join('');
  return <svg viewBox="0 0 640 200" className="w-full"><path d={path(a, 0, 3)} fill="none" stroke="#2F7BF2" strokeWidth="2.5" strokeOpacity=".6" pathLength={1} className="chart-draw"/><path d={path(b, 0, 3)} fill="none" stroke="#B7791F" strokeWidth="2.5" strokeOpacity=".6" pathLength={1} className="chart-draw"/><path d={path(idx, Math.min(...idx) - 60, Math.max(...idx) + 60)} fill="none" stroke="#12A150" strokeWidth="4.5" pathLength={1} className="chart-draw"/><text x="630" y="22" textAnchor="end" fontSize="14" fontWeight="800" fill="#12A150">vault index I(t)</text><text x="630" y="42" textAnchor="end" fontSize="12" fill="#2F7BF2">coin A price</text><text x="630" y="58" textAnchor="end" fontSize="12" fill="#B7791F">coin B price</text></svg>;
}

/** /whitepaper: the ObjectPad technical white paper. */
export default function Whitepaper() {
  const [active, setActive] = useState<string>('abstract');
  useEffect(() => { const obs = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id); }, { rootMargin: '-30% 0px -60% 0px' }); SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) obs.observe(el); }); return () => obs.disconnect(); }, []);
  return <div className="page py-6 sm:py-10">
    <header className="smoke relative overflow-hidden rounded-[40px] p-6 text-white sm:p-12">
      <div className="absolute inset-0 opacity-30" aria-hidden="true"><svg viewBox="0 0 800 400" className="h-full w-full" preserveAspectRatio="xMidYMid slice">{Array.from({ length: 22 }, (_, i) => <line key={i} x1={i * 40} y1={0} x2={i * 40 - 200} y2={400} stroke="#3BE08A" strokeOpacity=".35" className="wp-flow" style={{ animationDelay: `${i * .1}s` }}/>)}</svg></div>
      <div className="relative"><p className="flex items-center gap-2 font-mono text-[12px] font-extrabold uppercase tracking-[0.16em] text-white/60"><FileText size={14}/>ObjectPad technical white paper · v2.0 · September 2026</p>
        <h1 className="display mt-5 max-w-4xl text-[46px] leading-[0.92] sm:text-[88px]">Proof that a coin is one real object.</h1>
        <p className="mt-5 max-w-3xl text-[18px] font-semibold leading-8 text-white/75">How ObjectPad turns a phone camera into an on-ramp: guided capture, SHA-256 commitments, a geometry + surface uniqueness engine, OAuth-bound creator identity, signed Merkle proofs, free sponsored launches on Pons V2 (Robinhood Chain, an Ethereum L2), and tradable Object Vault indexes.</p>
        <div className="mt-7 flex flex-wrap gap-2.5"><Link to="/verify" className="btn press min-h-12 px-6">Verify a coin<ArrowRight size={16}/></Link><Link to="/vaults" className="btn-ghost press min-h-12 px-6 !text-white">Object Vaults<ArrowUpRight size={16}/></Link></div></div>
    </header>

    <div className="mt-8 grid gap-10 lg:grid-cols-[260px_1fr]">
      <nav className="hidden lg:block"><div className="sticky top-28 space-y-0.5">{SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`} className={cn('block rounded-xl px-3 py-1.5 text-[13.5px] font-bold transition-colors', active === id ? 'bg-ink text-white' : 'text-ink/60 hover:bg-ink/[0.05]')}>{t}</a>)}</div></nav>
      <article className="min-w-0 max-w-[880px]">
        <Sec id="abstract" title="Abstract">
          <p>ObjectPad is a launchpad where the only way to create a coin is to photograph a real physical object. A creator shoots six guided angles on a phone; the server normalises and hashes every frame, rejects reused or near-identical imagery, reconstructs a textured 3D model, fingerprints its geometry and surface, compares it against every object already in the archive, binds the creator’s verified X account and wallet, and commits all of it into a SHA-256 Merkle root. The root is signed by the same treasury address that sends the coin’s launch transaction on Pons V2, the bonding-curve launchpad on Robinhood Chain (chain id 4663, an Ethereum L2). The creator pays nothing.</p>
          <p>Every step is reproducible by a third party: the fingerprints are deterministic (seeded by the model’s own hash), the proof is recomputable in a browser, and the signature recovers with standard <code>ecrecover</code>. This document specifies each component, the exact thresholds, the collision math, and, as importantly, what the system does <em>not</em> prove.</p>
          <Figure caption="Fig. 1: End-to-end pipeline. Every arrow is a hash-committed hand-off."><PipelineFigure/></Figure>
        </Sec>

        <Sec id="problem" n="Section 1" title="The problem">
          <p>Launchpads let anyone deploy a token for anything, which makes a token a claim with nothing behind it. Tokens that point at physical items have historically relied on a picture and a promise: images are copied, the same item is minted repeatedly, and social links are pasted by whoever launches first. Three failure modes follow: <b>duplication</b> (one object, many coins), <b>fabrication</b> (a coin for an object nobody has), and <b>impersonation</b> (a coin that links to someone else’s account).</p>
          <p>ObjectPad addresses each with a mechanism that can be checked, not trusted: capture-bound hashing against fabrication, multi-signal fingerprinting against duplication, and OAuth-bound identity against impersonation.</p>
        </Sec>

        <Sec id="capture" n="Section 2" title="Capture pipeline">
          <p>Capture starts on the creator’s desktop, which issues a single-use QR token (256-bit random, only its SHA-256 is stored). The phone that claims it receives a device secret; every upload needs a fresh single-use ticket bound to that secret, the account and one of the guided view ids (<code>front, left, back, right, top, detail</code>).</p>
          <Table head={['Gate', 'Rule', 'Effect']} rows={[
            ['Decode', 'Strict JPEG decode, ≤ 4.2 MP, ≥ 720 px short side', 'Malformed or tiny files rejected'],
            ['Metadata', 'Pixels re-encoded server-side', 'EXIF/GPS stripped, nothing leaks'],
            ['Focus', 'Variance of the Laplacian ∇²I over the frame', 'Blurry frames rejected'],
            ['Exposure', 'Mean luminance Y = 0.299R + 0.587G + 0.114B', 'Too dark / bright rejected'],
            ['Same angle', 'dHash Hamming distance < 3 to any other view', 'Re-shot angle rejected'],
            ['Archive exact', 'SHA-256 of normalised frame already stored', 'Reused photo rejected'],
            ['Archive near', '≥ 8 same-angle views within Hamming ≤ 3 of one capture', 'Re-uploaded capture rejected'],
          ]}/>
          <p>The accepted frames are summarised into a canonical capture manifest (deterministic key order, NFC strings) whose SHA-256 is the <b>capture manifest hash</b>. The manifest explicitly records <code>coverageEvidence: user_guided_angles_plus_server_image_checks_not_3d_pose_proof</code>: guided angles are a strong signal, not a pose proof, and we say so.</p>
        </Sec>

        <Sec id="hashing" n="Section 3" title="Hashing & commitments">
          <p>ObjectPad uses SHA-256 (FIPS 180-4) everywhere a value must be committed: frames, manifest, 3D model, thumbnail, metadata, fingerprints, identity, Merkle nodes, and the append-only moderation log (each entry commits to the previous entry’s hash). Records are immutable at the database level: triggers abort any update to a sealed commitment and any delete.</p>
          <Eq label="Deterministic identifiers">objectId = SHA256("objectpad:v1:" ‖ captureSessionId)<br/>objectTag = base32(SHA256(objectName ‖ modelHash ‖ manifestHash))[0..8] → OP-XXXX-XXXX<br/>metadataHash = SHA256(canonicalJSON(commitment))</Eq>
          <Figure caption="Fig. 2: SHA-256 avalanche, computed live in your browser. One character changes about half of the 256 output bits."><AvalancheFigure/></Figure>
          <p>The launch transaction itself carries the object: the Pons description field contains the model and manifest hashes, and a UTF-8 suffix appended to the calldata contains the object tag, catalogue name, Object ID and physical specs (<code>tris, dims, tex, mat, views, fp2</code>). Anyone can decode it from the raw transaction input.</p>
        </Sec>

        <Sec id="uniqueness" n="Section 4" title="Uniqueness v2">
          <p>Uniqueness is decided by independent signals, each computed deterministically, combined with published weights and gated by a published rule. v1 signals (exact and perceptual frame hashes, AI visual comparison before the paid 3D build) still run first; v2 adds two fingerprints that can only exist after reconstruction.</p>
          <h3 className="text-[20px] font-extrabold text-ink">4.1 Geometry fingerprint</h3>
          <p>From the validated GLB, N = 4096 surface points are drawn by area-weighted triangle sampling (barycentric coordinates r₁, r₂ with reflection when r₁ + r₂ &gt; 1), using an xorshift32 PRNG seeded with the first 32 bits of the model’s SHA-256, so anyone re-running it gets identical output. Points are centred on their centroid and divided by their RMS radius, which makes every descriptor invariant to translation and scale; the descriptors themselves are rotation invariant.</p>
          <Eq label="Descriptors">D2(d) = histogram of |pᵢ − pⱼ| / r_rms over 4096 random pairs, 32 bins on [0, 3]<br/>A3(θ) = histogram of ∠(pᵢ − pⱼ, pₖ − pⱼ) over 4096 triples, 16 bins on [0, π]<br/>PCA = eig(Σ) / tr(Σ), Σ = (1/N) Σᵢ pᵢpᵢᵀ   (cyclic Jacobi rotation)<br/>Ψ = π^(1/3) (6V)^(2/3) / A,  V = |Σ (a · (b × c)) / 6|</Eq>
          <Figure caption="Fig. 3: D2 shape distributions. Different objects produce different curves; the same object rescanned produces nearly the same curve."><D2Figure/></Figure>
          <h3 className="text-[20px] font-extrabold text-ink">4.2 Surface fingerprint</h3>
          <p>From each canonical photo (central 70% crop, 96 × 96 grid): an HSV colour histogram (8 hue × 3 saturation × 3 value = 72 bins), a local-binary-pattern texture histogram (256 codes: each pixel compared with its 8 neighbours), which responds to wear, stitching, scratches and print, and a 64-bit DCT perceptual hash (32 × 32 grayscale, 2D DCT-II, 8 × 8 low-frequency block, median threshold).</p>
          <h3 className="text-[20px] font-extrabold text-ink">4.3 Combined score and duplicate rule</h3>
          <Eq label="Similarity (all in [0,1])">G = 1 − [0.45·½‖D2ₐ−D2ᵦ‖₁ + 0.30·½‖A3ₐ−A3ᵦ‖₁ + 0.15·½‖PCAₐ−PCAᵦ‖₁ + 0.10·|Ψₐ−Ψᵦ|]<br/>S = mean_views [0.6·Σmin(HSVₐ,HSVᵦ) + 0.4·Σmin(LBPₐ,LBPᵦ)]<br/>P = mean_views max(0, (1 − H(pHashₐ,pHashᵦ)/64 − 0.5) / 0.5)   (chance-corrected)<br/>C = 0.40·G + 0.30·S + 0.30·P<br/>duplicate ⇔ C ≥ 0.92 ∧ G ≥ 0.90 ∧ S ≥ 0.85<br/>Uniqueness score U = 100 × (1 − max_archive C)</Eq>
          <p>All three gates must pass for a duplicate verdict, which keeps false positives low: two different mugs can share a shape (high G) but not their colours and wear (lower S). A confirmed duplicate is blocked before its launch is broadcast. Coins launched before v2 are fingerprinted by a background job and receive a score, but are never retroactively delisted by it.</p>
        </Sec>

        <Sec id="math" n="Section 5" title="Collision math">
          <p><b>Cryptographic hashes.</b> For SHA-256 the probability that any two of n distinct inputs collide is ≈ n² / 2²⁵⁷. Even at n = 10¹² committed artifacts that is ≈ 4.3 × 10⁻⁵⁴: a collision is not a practical concern.</p>
          <p><b>Perceptual hashes.</b> For two unrelated images the 64 bits of a perceptual hash behave approximately like fair coins, so the chance that they fall within Hamming distance 3 is:</p>
          <Eq>P(H ≤ 3) = Σ_{'{k=0..3}'} C(64,k) / 2⁶⁴ = (1 + 64 + 2016 + 41664) / 1.845×10¹⁹ ≈ 2.37 × 10⁻¹⁵</Eq>
          <Figure caption="Fig. 4: Hamming distance between two 64-bit perceptual hashes. ≤ 3 differing bits = same angle."><HammingFigure/></Figure>
          <p>The whole-capture near-duplicate rule needs 8 views to match independently, so for unrelated captures the false-match rate is bounded by roughly (2.37 × 10⁻¹⁵)⁸, which is effectively zero. The real risk is the opposite (a genuine duplicate photographed differently), which is why geometry and surface fingerprints and an AI comparison sit behind the hash layer.</p>
        </Sec>

        <Sec id="reconstruction" n="Section 6" title="3D reconstruction">
          <p>Four canonical views are sent to an external multi-view reconstruction service. ObjectPad does not claim to run the reconstruction network itself; it adds the proof layer around it. The returned GLB is structurally validated before anything is published: container and chunk bounds, a closed feature subset (no animations, skins, external or data URIs), accessor bounds, ≤ 100k triangles, ≤ 16 textures of at most 4096 px. The model and thumbnail are stored content-addressed (key = SHA-256), read back and re-hashed before acceptance.</p>
        </Sec>

        <Sec id="identity" n="Section 7" title="Identity & anti-impersonation">
          <p>A coin may carry an X link only if it is the creator’s own X account, proven by X OAuth. The binding is keyed by the immutable X user id, not the handle; one X account maps to one ObjectPad account, forever. Typing someone else’s handle is rejected at draft time (<code>X_LINK_NOT_YOURS</code>) and, as a backstop, any unproven link is stripped before the commitment is sealed, so it never reaches the on-chain metadata.</p>
          <Figure caption="Fig. 5: The creator’s X OAuth subject and fee wallet are hashed into the same root as the object and signed."><IdentityFigure/></Figure>
          <p>Every coin page shows a <b>Verified creator</b> panel: the OAuth-bound X account, the dev (fee) wallet with an explorer link, and the status of the coin’s X link: <i>verified</i>, <i>unverified</i>, or <i>mismatch</i> (flagged in red as impersonation). Bounty proofs show the submitter’s verified X account and full wallet, and a coin can only be submitted by its own creator.</p>
        </Sec>

        <Sec id="proof" n="Section 8" title="Proof v2: Merkle root + EIP-191">
          <Eq label="Leaves (in order)">object_id · capture_manifest · model_sha256 · geometry_fp · surface_fp · creator_identity<br/>leafᵢ = SHA256("objectpad:leaf:v2:" ‖ labelᵢ ‖ ":" ‖ valueᵢ)<br/>node = SHA256(left_hex ‖ right_hex), odd levels duplicate the last node<br/>message = "ObjectPad Proof v2\nobject: …\nroot: …\ncreator: …\nx: …\nuniqueness: …"<br/>signature = personal_sign(message) by the launch treasury</Eq>
          <Figure caption="Fig. 6: The six committed leaves hashed pairwise into one root."><MerkleFigure/></Figure>
          <p>Verification requires no trust in ObjectPad’s servers: recompute each leaf, fold to the root, <code>ecrecover</code> the signature, and compare the recovered address with the <code>from</code> of the coin’s launch transaction. The <Link to="/verify" className="font-extrabold text-ink underline">Verify page</Link> does exactly this in your browser.</p>
        </Sec>

        <Sec id="launch" n="Section 9" title="Launch on Pons V2">
          <p>Coins launch on Pons V2, a bonding-curve launchpad on Robinhood Chain. The ObjectPad treasury sends <code>launchAndBuy</code>, pays the launch fee and the protocol-minimum first buy, and sends those first tokens to the dead address, so no wallet starts with a bag. The factory and router bytecode hashes are pinned: if deployed code ever differs, launches halt.</p>
          <Table head={['Parameter', 'Value']} rows={[['Supply', '1,000,000,000 per coin'], ['Creator fee', '1.5% of every trade to the creator wallet'], ['Launch cost to creator', '0 ETH (treasury sponsored)'], ['Confirmation depth', '30 blocks before a coin is final'], ['Quote assets (V2)', 'ETH or tokenized stocks/ETFs (e.g. NVDA, TSLA, SPY)']]}/>
          <p>With V2 pairing, a coin can be quoted in a tokenized stock instead of ETH. Buying with ETH routes through Uniswap V3 into the pair asset and then into the curve, each leg simulated before signing.</p>
        </Sec>

        <Sec id="vaults" n="Section 10" title="Object Vaults & tradable indexes">
          <p>A vault is a typed basket (Collection, Set, Theme or Creator) of 2 to 12 coins. Because every coin has the same fixed supply, market cap is proportional to price, and the index is computed directly from on-chain trades:</p>
          <Eq label="Index level">cap-weighted:   I(t) = 1000 · Σᵢ MCᵢ(t) / Σᵢ MCᵢ(t₀)<br/>equal-weighted: I(t) = 1000 · (1/N) · Σᵢ Pᵢ(t) / Pᵢ(t₀)<br/>weights: wᵢ = MCᵢ / Σ MC  (or 1/N)</Eq>
          <Figure caption="Fig. 7: A vault index (green) rebuilt from its constituents’ trade prices."><IndexFigure/></Figure>
          <p><b>Buying the index</b> splits the ETH amount by wᵢ and executes one wallet-signed buy per coin on its own curve (stock-paired coins add a swap + approve). Selling sells the same percentage of every holding. There is no wrapper token and no custody: the basket is simply the coins in your wallet. A single-transaction basket router is on the roadmap.</p>
        </Sec>

        <Sec id="custody" n="Section 11" title="Proof of custody">
          <p>A creator can re-photograph the object at any time. The new photo must not be a replay of an original frame (exact hash check), and a vision model compares it with the original scan. Matched check-ins are counted on the coin page: <b>Still exists ✓</b> when the last match is within 30 days, <b>Lapsed</b> after that. The status is public, so holders can see whether the object is still in the creator’s hands.</p>
        </Sec>

        <Sec id="economy" n="Section 12" title="$OBJECTPAD economy">
          <p>Launches are funded by the treasury, whose balance is public on the Treasury page. $OBJECTPAD is bought back and burned from protocol revenue, and every burn is a real transaction listed on the Burn page. Earn pays verified X accounts for genuine posts about ObjectPad (links are resolved through t.co), and community bounties are escrowed in ETH and released on-chain. None of this implies a return; coins carry no redemption right.</p>
        </Sec>

        <Sec id="threats" n="Section 13" title="Threat model">
          <Table head={['Attack', 'Mitigation']} rows={[
            ['Re-upload someone’s photos', 'Exact SHA-256 archive check + near-duplicate dHash rule'],
            ['Photograph a screen or print', 'AI screening at capture and at check-in'],
            ['Rescan the same object', 'AI comparison before build, then geometry + surface fingerprints'],
            ['Paste another person’s X link', 'OAuth-bound identity; unproven links rejected and stripped'],
            ['Tamper with a record', 'DB triggers make commitments immutable; SHA-256 metadata'],
            ['Fake a proof', 'Root recomputed client-side; signature must recover to the launch sender'],
            ['Swap launch contracts', 'Pinned bytecode hashes halt launches on mismatch'],
          ]}/>
        </Sec>

        <Sec id="limits" n="Section 14" title="What it does not prove">
          <p>A scan record proves that a specific set of photos and a 3D model were captured, were not already in the archive, and were committed by an identified creator. It does <b>not</b> prove legal ownership, authenticity, provenance before the scan, or value. Mass-produced identical items may be indistinguishable to any vision system; the rule treats a practically indistinguishable copy as the same object. Coins are not claims on the object.</p>
        </Sec>

        <Sec id="roadmap" n="Section 15" title="Roadmap">
          <Table head={['Stage', 'Scope']} rows={[['Shipped', 'Uniqueness v2, Proof v2 + Verify page, OAuth-bound identity, Object Vaults with basket trading, custody status'], ['Next', 'On-chain registry that stores the Merkle root per token; one-transaction basket router'], ['Then', 'Vault leaderboards, custody streak rewards, creator UGC programme, brand bounties'], ['Later', 'LiDAR capture on supported phones for metric-scale geometry']]}/>
          <div className="mt-6 flex flex-wrap gap-2.5"><Link to="/launch" className="btn press min-h-12 px-6">Scan & launch<ArrowRight size={16}/></Link><Link to="/verify" className="btn-ghost press min-h-12 px-6">Verify a coin</Link><Link to="/docs" className="btn-ghost press min-h-12 px-6">How it works (short)</Link></div>
        </Sec>
      </article>
    </div>
  </div>;
}
