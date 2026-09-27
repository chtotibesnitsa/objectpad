// Run with: bun functions/objectpad/server/people.selftest.ts
// Exercises PeopleService state rules against an in-memory SQLite store (no network, no keys).
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyMessage } from 'viem';
import { Store } from './store';
import { PeopleService, syncSha256 } from './people';
import type { ObjectContext, Runtime } from './types';

const db = new Database(':memory:');
const ctx = { storage: { sql: { exec: (q: string, ...args: unknown[]) => { const st = db.prepare(q); const rows = /^\s*(select|with)/i.test(q) ? st.all(...(args as never[])) : (st.run(...(args as never[])), []); return { toArray: () => rows, [Symbol.iterator]: () => (rows as unknown[])[Symbol.iterator]() }; } }, transactionSync: <T>(fn: () => T): T => db.transaction(fn)() }, blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn() } as unknown as ObjectContext;
const store = new Store(ctx); store.migrate();
const runtime = { env: {}, privyAppId: 'app', toolkitKey: '' } as unknown as Runtime;
let xIds: Record<string, { id: string; handle: string }> = { 'did:privy:alice': { id: '111', handle: 'alice' }, 'did:privy:bob': { id: '222', handle: 'bob' } };
const svc = new PeopleService(store, runtime, { xIdentity: async o => xIds[o] ?? null, walletOf: async () => '0x' + 'b'.repeat(40), verify: async (a, m, s) => verifyMessage({ address: a as `0x${string}`, message: m, signature: s as `0x${string}` }) });
const ORIGIN = 'https://www.objectpad.fun';
let pass = 0; const ok = (c: boolean, name: string) => { if (!c) { console.error('FAIL', name); process.exit(1); } pass++; console.log('ok', name); };
const code = async (fn: () => Promise<unknown> | unknown): Promise<string> => { try { await fn(); return 'none'; } catch (e) { return (e as { code?: string }).code ?? String(e); } };

ok(syncSha256('abc') === createHash('sha256').update('abc').digest('hex'), 'sync sha256 matches node');
ok(await code(() => svc.create('guest:x', { relationship: 'self', displayName: 'Guest' })) === 'SIGN_IN_REQUIRED', 'guests cannot create drafts');

// Assisted: mallory prepares a draft for alice.
const draft = await svc.create('did:privy:mallory', { relationship: 'assisted', displayName: 'Alice' });
ok(draft.state === 'awaiting_subject' && !draft.subjectAccepted, 'assisted draft waits for subject');
ok(await code(() => svc.consent(draft.id, 'did:privy:mallory', { kind: 'public_likeness', granted: true })) === 'SUBJECT_ONLY', 'uploader cannot consent for the subject');
ok(await code(() => svc.publish(draft.id, 'did:privy:mallory')) === 'SUBJECT_ONLY', 'uploader cannot publish another person');
ok(await code(() => svc.get(draft.id, 'did:privy:stranger')) === 'NOT_FOUND', 'strangers cannot see drafts');
const inv1 = await svc.invite(draft.id, 'did:privy:mallory', ORIGIN); const t1 = inv1.url.split('/').pop()!;
const inv2 = await svc.invite(draft.id, 'did:privy:mallory', ORIGIN); const t2 = inv2.url.split('/').pop()!;
ok(await code(() => svc.acceptInvite(t1, 'did:privy:alice')) === 'INVITATION_REVOKED', 'superseded invitation fails');
ok(await code(() => svc.acceptInvite(t2, 'did:privy:mallory')) === 'CANNOT_ACCEPT_OWN_INVITATION', 'creator cannot accept own invitation');
const accepted = await svc.acceptInvite(t2, 'did:privy:alice'); ok(accepted.role === 'subject' && accepted.subjectAccepted, 'subject accepts invitation');
ok(await code(() => svc.acceptInvite(t2, 'did:privy:bob')) === 'INVITATION_USED', 'invitation is single use');
ok(await code(() => svc.update(draft.id, 'did:privy:mallory', { displayName: 'Hijack' })) === 'SUBJECT_ONLY', 'creator loses edit rights after acceptance');

// Revoked invitation.
const d2 = await svc.create('did:privy:mallory', { relationship: 'assisted', displayName: 'Carol' }); const i3 = (await svc.invite(d2.id, 'did:privy:mallory', ORIGIN)).url.split('/').pop()!; await svc.revokeInvite(d2.id, 'did:privy:mallory');
ok(await code(() => svc.acceptInvite(i3, 'did:privy:bob')) === 'INVITATION_REVOKED', 'revoked invitation fails');
// Expired invitation.
const d3 = await svc.create('did:privy:mallory', { relationship: 'assisted', displayName: 'Dan' }); const i4 = (await svc.invite(d3.id, 'did:privy:mallory', ORIGIN)).url.split('/').pop()!; store.run('UPDATE op_people_invitations SET expires=1 WHERE draft_id=?', d3.id);
ok(await code(() => svc.acceptInvite(i4, 'did:privy:bob')) === 'INVITATION_EXPIRED', 'expired invitation fails');

// Wallet proof: challenge binding, replay, expiry, wrong signer.
const key = generatePrivateKey(); const acct = privateKeyToAccount(key); const other = privateKeyToAccount(generatePrivateKey());
const ch = await svc.walletChallenge(draft.id, 'did:privy:alice', { address: acct.address }, ORIGIN);
ok(await code(async () => svc.walletVerify(draft.id, 'did:privy:alice', { nonce: ch.nonce, signature: await other.signMessage({ message: ch.message }) }, ORIGIN)) === 'SIGNATURE_INVALID', 'wrong signer rejected');
ok(await code(async () => svc.walletVerify(draft.id, 'did:privy:alice', { nonce: ch.nonce, signature: await acct.signMessage({ message: ch.message }) }, ORIGIN)) === 'CHALLENGE_REPLAYED', 'challenge consumed even after a failed attempt');
const ch2 = await svc.walletChallenge(draft.id, 'did:privy:alice', { address: acct.address }, ORIGIN);
ok(await code(async () => svc.walletVerify(draft.id, 'did:privy:alice', { nonce: ch2.nonce, signature: await acct.signMessage({ message: ch2.message }) }, 'https://evil.example')) === 'CHALLENGE_INVALID', 'challenge bound to domain');
const ch3 = await svc.walletChallenge(draft.id, 'did:privy:alice', { address: acct.address }, ORIGIN); store.run('UPDATE op_people_challenges SET expires=1 WHERE used_at IS NULL');
ok(await code(async () => svc.walletVerify(draft.id, 'did:privy:alice', { nonce: ch3.nonce, signature: await acct.signMessage({ message: ch3.message }) }, ORIGIN)) === 'CHALLENGE_EXPIRED', 'expired challenge fails');
const ch4 = await svc.walletChallenge(draft.id, 'did:privy:alice', { address: acct.address }, ORIGIN);
const sig4 = await acct.signMessage({ message: ch4.message }); const bound = await svc.walletVerify(draft.id, 'did:privy:alice', { nonce: ch4.nonce, signature: sig4 }, ORIGIN);
ok(bound.wallet?.address === acct.address.toLowerCase(), 'wallet bound after valid signature');
ok(await code(() => svc.walletVerify(draft.id, 'did:privy:alice', { nonce: ch4.nonce, signature: sig4 }, ORIGIN)) === 'CHALLENGE_REPLAYED', 'replayed valid signature fails');

// Consents, account, fee policy.
for (const kind of ['adult', 'verification_processing', 'public_likeness']) await svc.consent(draft.id, 'did:privy:alice', { kind, granted: true });
await svc.bindAccount(draft.id, 'did:privy:alice');
const fc = await svc.feeChallenge(draft.id, 'did:privy:alice', ORIGIN); ok(fc.split.subjectBps === 7000 && fc.split.launcherBps === 2000, 'default assisted split 70/20/10');
const signed = await svc.feeVerify(draft.id, 'did:privy:alice', { nonce: fc.nonce, signature: await acct.signMessage({ message: fc.message }) }, ORIGIN);
ok(signed.checks.find(c => c.id === 'feePolicy')!.passed, 'fee policy signed by subject');
await svc.update(draft.id, 'did:privy:alice', { launcherBps: 500 });
ok(!svc.get(draft.id, 'did:privy:alice').checks.find(c => c.id === 'feePolicy')!.passed, 'changing split invalidates the signed policy');

// Liveness: provider absent, so no badge and no publish.
ok(await code(() => svc.startLiveness(draft.id, 'did:privy:alice')) === 'LIVENESS_NOT_CONFIGURED', 'liveness refuses without a provider');
const pub = await code(() => svc.publish(draft.id, 'did:privy:alice')); ok(pub.startsWith('CHECKS_INCOMPLETE') && pub.includes('liveness'), 'publish blocked until liveness passes');
store.run("INSERT INTO op_people_verifications(id,draft_id,provider,provider_ref,state,created_at,decided_at) VALUES ('fake',?, 'none','r','passed',1,1)", draft.id);
ok(!svc.get(draft.id, 'did:privy:alice').checks.find(c => c.id === 'liveness')!.passed, 'a forged passed row from an unconfigured provider never counts');

// Canonical claim race: force all checks, then two drafts for the same X id.
(svc as unknown as { checks: (d: unknown) => { id: string; passed: boolean }[] }).checks = () => [{ id: 'all', passed: true }];
store.run("INSERT INTO op_people_models(id,draft_id,digest,state,approved_at,created_at) VALUES ('m1',?,?,'approved',1,1)", draft.id, 'f'.repeat(64));
xIds['did:privy:alice'] = { id: '999', handle: 'alice' };
ok(await code(() => svc.publish(draft.id, 'did:privy:alice')) === 'ACCOUNT_CHANGED', 'switching X account after binding cannot publish the claim');
xIds['did:privy:alice'] = { id: '111', handle: 'alice_renamed' };
const published = await svc.publish(draft.id, 'did:privy:alice'); ok(published.state === 'published', 'renamed handle keeps the same immutable identity and publishes');
const profile = svc.profile(published.profileId!); const pj = JSON.stringify(profile);
ok(!pj.includes('111') && !pj.includes('did:privy') && !pj.includes('signature'), 'public profile exposes no account mapping, IDs or signatures');
const dup = await svc.create('did:privy:alice2', { relationship: 'self', displayName: 'Alice again' }); xIds['did:privy:alice2'] = { id: '111', handle: 'alice' };
ok(await code(() => svc.bindAccount(dup.id, 'did:privy:alice2')) === 'SUBJECT_ALREADY_CLAIMED', 'second profile for the same X account is refused');
store.run("INSERT INTO op_people_social(draft_id,subject,provider,provider_user_id,handle_snapshot,bound_at) VALUES (?,?,?,?,?,1)", dup.id, 'did:privy:alice2', 'x', '111', 'alice');
store.run("INSERT INTO op_people_wallets(draft_id,subject,address,message_hash,bound_at) VALUES (?,?,?,?,1)", dup.id, 'did:privy:alice2', '0x' + 'c'.repeat(40), 'h');
store.run("INSERT INTO op_people_models(id,draft_id,digest,state,approved_at,created_at) VALUES ('m2',?,?,'approved',1,1)", dup.id, 'e'.repeat(64));
ok(await code(() => svc.publish(dup.id, 'did:privy:alice2')) === 'DUPLICATE_SUBJECT_REVIEW', 'unique constraint blocks a second canonical profile and opens review');
ok(Number(store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_people_cases WHERE kind='duplicate_subject'")!.n) === 1, 'duplicate goes to the review queue');

// Withdrawal and deletion.
await svc.consent(draft.id, 'did:privy:alice', { kind: 'public_likeness', granted: false });
ok(await code(() => svc.profile(published.profileId!)) === 'NOT_FOUND', 'withdrawing likeness consent takes the profile down');
await svc.remove(draft.id, 'did:privy:alice'); ok(await code(() => svc.get(draft.id, 'did:privy:alice')) === 'NOT_FOUND', 'deleted draft is gone');
ok(!store.one('SELECT 1 FROM op_people_canonical WHERE draft_id=?', draft.id), 'deletion releases the canonical slot');

// Applications and nominations.
const app = await svc.apply(null, { name: 'Sam', email: 'sam@example.com', location: 'san_francisco', roles: ['creator'], contactConsent: true, handles: { tiktok: '@sam' }, portfolio: ['https://example.com'] });
ok(app.state === 'received', 'application received');
ok(await code(() => svc.apply(null, { name: 'Sam', email: 'SAM@example.com', location: 'remote', roles: ['ugc'], contactConsent: true })) === 'APPLICATION_RECENT', 'duplicate application throttled');
ok(await code(() => svc.apply(null, { name: 'Sam', email: 'x@y.co', location: 'remote', roles: ['ugc'], contactConsent: true, portfolio: ['http://169.254.169.254/'] })) === 'LINK_INVALID', 'non-https/internal portfolio links rejected');
ok((await svc.nominate('did:privy:bob', { platform: 'x', handle: '@SomeCreator', displayName: 'Some Creator', publicAccount: true })).state === 'unclaimed', 'nomination saved as unclaimed');
ok(await code(() => svc.nominate('did:privy:bob', { platform: 'x', handle: 'somecreator', displayName: 'Some Creator', publicAccount: true })) === 'ALREADY_NOMINATED', 'duplicate nomination refused');
ok(svc.status().publishedProfiles === 0 && svc.status().features.find(f => f.id === 'public_profile')!.state === 'planned', 'status registry reports real state');
console.log(`\n${pass} checks passed`);
