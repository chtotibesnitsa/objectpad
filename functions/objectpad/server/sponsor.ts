import { createWalletClient, http, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { SponsorStatus } from '../shared/domain';
import { ApiError, validAddress } from '../shared/security';
import { FACTORY_ABI, MIN_INITIAL_BUY_WEI, PONS_FACTORY, robinhoodChain } from '../shared/pons';
import { rpcUrl, serverClient } from './chain';
import type { Runtime } from './types';
import { Store } from './store';

/** Upper bound for one launchAndBuy (measured ≈3.81M gas on 2026-09-23) plus headroom. */
export const LAUNCH_GAS_BUDGET = 4_800_000n;

/**
 * The ObjectPad launch treasury (sponsor): a platform wallet that sends every Pons V2 launch and pays the launch fee plus the
 * protocol-minimum first buy, which is sent to the dead address. Creators pay nothing and never sign. The key is taken
 * from OBJECTPAD_SPONSOR_PRIVATE_KEY or generated once and kept in this Durable Object's storage; it is never returned.
 */
export class SponsorService {
  private cache: { at: number; status: SponsorStatus } | null = null;
  constructor(private readonly store: Store, private readonly runtime: Runtime) {}
  private key(): Hex {
    const configured = this.runtime.env.OBJECTPAD_SPONSOR_PRIVATE_KEY?.trim();
    if (configured && /^0x[0-9a-fA-F]{64}$/.test(configured)) return configured as Hex;
    const saved = this.store.one<{ value: string }>("SELECT value FROM op_secrets WHERE name='sponsor_key'");
    if (saved) return saved.value as Hex;
    this.store.run("INSERT OR IGNORE INTO op_secrets(name,value,created_at) VALUES ('sponsor_key',?,?)", generatePrivateKey(), Date.now());
    return this.store.one<{ value: string }>("SELECT value FROM op_secrets WHERE name='sponsor_key'")!.value as Hex;
  }
  get address(): Address { return privateKeyToAccount(this.key()).address; }
  wallet() { return createWalletClient({ account: privateKeyToAccount(this.key()), chain: robinhoodChain, transport: http(rpcUrl(this.runtime.env), { timeout: 20_000 }) }); }
  dailyLimit(): number { const value = Number(this.runtime.env.OBJECTPAD_DAILY_LAUNCHES); return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 25; }
  usedToday(): number { return Number(this.store.one<{ count: number }>('SELECT count FROM op_rate_limits WHERE key=?', `launches:${Math.floor(Date.now() / 86_400_000)}`)?.count ?? 0); }
  /** Live sponsor balance and the real cost of one launch (fee + minimum buy + gas budget at the current gas price). */
  async status(fresh = false): Promise<SponsorStatus> {
    if (!fresh && this.cache && Date.now() - this.cache.at < 30_000) return { ...this.cache.status, usedToday: this.usedToday() };
    const client = serverClient(this.runtime.env); const address = this.address;
    const [balance, fee, gasPrice] = await Promise.all([client.getBalance({ address }), client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: 'launchFee' }), client.getGasPrice()]);
    const cost = fee + MIN_INITIAL_BUY_WEI + LAUNCH_GAS_BUDGET * gasPrice;
    const status: SponsorStatus = { address, balanceWei: balance.toString(), launchCostWei: cost.toString(), launchesAffordable: cost > 0n ? Number(balance / cost) : 0, dailyLimit: this.dailyLimit(), usedToday: this.usedToday() };
    this.cache = { at: Date.now(), status }; return status;
  }
  invalidate(): void { this.cache = null; }
  /** Operator-only: move the sponsor balance (minus a gas reserve) to another wallet. */
  async sweep(to: string): Promise<Hex> {
    if (!validAddress(to)) throw new ApiError('WALLET_INVALID');
    const client = serverClient(this.runtime.env); const [balance, gasPrice] = await Promise.all([client.getBalance({ address: this.address }), client.getGasPrice()]);
    const reserve = 21_000n * gasPrice * 3n; if (balance <= reserve) throw new ApiError('SPONSOR_EMPTY', 409);
    this.invalidate(); return this.wallet().sendTransaction({ to: to as Address, value: balance - reserve, gas: 21_000n, chain: robinhoodChain });
  }
}
