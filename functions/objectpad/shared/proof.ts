/**
 * ObjectPad Proof v2: a SHA-256 Merkle commitment over everything that makes one coin one object.
 *
 * leaf_i = SHA256("objectpad:leaf:v2:" || label_i || ":" || value_i)
 * node   = SHA256(left_hex || right_hex)           (odd levels duplicate the last node, as in Bitcoin)
 * root   = the single remaining node
 *
 * The attestation message below is signed (EIP-191 personal_sign) by the ObjectPad launch treasury, the same address that
 * sends every sponsored launch transaction, so a signature can be checked against the `from` of the coin's launch tx.
 * Everything here runs identically in the browser (WebCrypto), which is how the Verify page recomputes proofs.
 */
import { sha256 } from './security';

export const PROOF_VERSION = 2;
export const LEAF_LABELS = ['object_id', 'capture_manifest', 'model_sha256', 'geometry_fp', 'surface_fp', 'creator_identity'] as const;
export type LeafLabel = typeof LEAF_LABELS[number];
export interface ProofLeaf { label: LeafLabel; value: string; hash: string; }
export interface ObjectProof { version: 2; objectId: string; leaves: ProofLeaf[]; levels: string[][]; root: string; score: number | null; nearest: number | null; compared: number; message: string; signature: string | null; signer: string | null; issuedAt: number; }

export async function leafHash(label: string, value: string): Promise<string> { return sha256(`objectpad:leaf:v2:${label}:${value}`); }
/** Every level of the tree, leaves first, root last. */
export async function merkleLevels(leaves: string[]): Promise<string[][]> {
  if (!leaves.length) throw new Error('EMPTY_TREE');
  const levels: string[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const level = levels[levels.length - 1]; const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(await sha256(level[i] + (level[i + 1] ?? level[i])));
    levels.push(next);
  }
  return levels;
}
export async function merkleRoot(leaves: string[]): Promise<string> { const levels = await merkleLevels(leaves); return levels[levels.length - 1][0]; }
/** Exact text the treasury signs for one object. */
export function attestationMessage(input: { objectId: string; root: string; creatorWallet: string; xUserId: string | null; score: number | null }): string {
  return `ObjectPad Proof v2\nobject: ${input.objectId}\nroot: ${input.root}\ncreator: ${input.creatorWallet.toLowerCase()}\nx: ${input.xUserId ?? 'none'}\nuniqueness: ${input.score ?? 'pending'}`;
}
/** Recomputes leaves and root from the published values. Returns which leaves (if any) do not match. */
export async function verifyProof(proof: Pick<ObjectProof, 'leaves' | 'root'>): Promise<{ ok: boolean; root: string; badLeaves: string[] }> {
  const bad: string[] = []; const hashes: string[] = [];
  for (const leaf of proof.leaves) { const h = await leafHash(leaf.label, leaf.value); if (h !== leaf.hash) bad.push(leaf.label); hashes.push(h); }
  const root = await merkleRoot(hashes); return { ok: !bad.length && root === proof.root, root, badLeaves: bad };
}
