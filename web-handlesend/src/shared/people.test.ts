import { describe, expect, it } from 'vitest';
import { BPS, allocate, defaultSplit, feeMessage, secureNonce, splitFor, validSplit, walletMessage } from './people';

describe('People fee split', () => {
  it('allocates $100 of received USDC-style units 70/20/10 under the default assisted split', () => {
    const received = 100_000_000n; // 100.000000 in a 6-decimal asset
    const a = allocate(received, defaultSplit('assisted'));
    expect(a).toEqual({ subject: 70_000_000n, launcher: 20_000_000n, platform: 10_000_000n, dust: 0n });
  });
  it('allocates 18-decimal ETH exactly and never creates or loses base units', () => {
    const wei = 100n * 10n ** 18n + 7n;
    const a = allocate(wei, defaultSplit('assisted'));
    expect(a.subject + a.launcher + a.platform).toBe(wei);
    expect(a.launcher).toBe(wei * 2000n / 10000n);
    expect(a.dust).toBeGreaterThanOrEqual(0n);
  });
  it('self-launch is a separate 90/0/10 policy', () => {
    expect(defaultSplit('self')).toEqual({ subjectBps: 9000, launcherBps: 0, platformBps: 1000 });
    expect(splitFor('self', 2000).launcherBps).toBe(0);
  });
  it('rejects splits that do not sum to 10,000, exceed the collaborator cap or change the platform share', () => {
    expect(validSplit({ subjectBps: 7000, launcherBps: 2000, platformBps: 1000 })).toBe(true);
    expect(validSplit({ subjectBps: 7000, launcherBps: 2000, platformBps: 999 })).toBe(false);
    expect(validSplit({ subjectBps: 6000, launcherBps: 3000, platformBps: 1000 })).toBe(false);
    expect(validSplit({ subjectBps: 7000.5, launcherBps: 1999.5, platformBps: 1000 })).toBe(false);
    expect(() => allocate(-1n, defaultSplit('self'))).toThrow();
    expect(BPS).toBe(10_000);
  });
});

describe('People challenges', () => {
  it('uses 32 random bytes per nonce', () => {
    const a = secureNonce(); const b = secureNonce();
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).not.toBe(b);
  });
  it('binds wallet messages to domain, chain, nonce, draft and expiry (EIP-4361 shape)', () => {
    const m = walletMessage({ domain: 'www.objectpad.fun', uri: 'https://www.objectpad.fun', address: '0xabc', draftId: 'd1', nonce: 'n'.repeat(64), issuedAt: 0, expiresAt: 600_000 });
    expect(m.startsWith('www.objectpad.fun wants you to sign in with your Ethereum account:\n0xabc')).toBe(true);
    for (const part of ['Chain ID: 4663', `Nonce: ${'n'.repeat(64)}`, 'Expiration Time: 1970-01-01T00:10:00.000Z', 'urn:objectpad:people-draft:d1']) expect(m).toContain(part);
  });
  it('states the fee denominator in the signed text', () => {
    const m = feeMessage({ domain: 'x', draftId: 'd', relationship: 'assisted', split: defaultSplit('assisted'), subjectWallet: '0x1', launcherWallet: '0x2', version: 1, nonce: 'n', expiresAt: 0 });
    expect(m).toContain('creator fees actually collected'); expect(m).toContain('7000 bps (70%) to 0x1');
  });
});
