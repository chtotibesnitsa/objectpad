/**
 * ObjectPad economy policy. These constants are mirrored exactly by the Solidity
 * contracts in /contracts and asserted by the Foundry and Vitest suites, so the
 * interface can never describe a split the contracts do not enforce.
 */
import { parseAbi, type Address } from 'viem';

export const DEAD_ADDRESS: Address = '0x000000000000000000000000000000000000dEaD';
export const BPS = 10_000;
/** Pons creator tax routed to each object's fee vault on every curve trade. */
export const CREATOR_TAX_BPS = 150;
/** Pons protocol fee on every curve trade (kept by Pons, not ObjectPad). */
export const PONS_PROTOCOL_FEE_BPS = 100;
/** Split of each harvested creator-fee payment inside an object's vault: equal thirds, so each is 0.5% of every trade. */
export const VAULT_SPLIT = { creatorBps: 3_334, forgeBps: 3_333, burnBps: 3_333 } as const;
/** Pons token supply for launch config 0. */
export const TOKEN_SUPPLY = 1_000_000_000n * 10n ** 18n;

/** Crafting table rules. */
export const CRAFT = {
  minIngredients: 2,
  maxIngredients: 3,
  /** 0.1% of a 1B supply. */
  minIngredientAmount: 1_000_000n * 10n ** 18n,
  baseMultiplierBps: 10_000,
  trioBonusBps: 2_500,
  locks: [
    { tier: 0, days: 30, bonusBps: 0, label: '30 days' },
    { tier: 1, days: 90, bonusBps: 5_000, label: '90 days' },
    { tier: 2, days: 180, bonusBps: 10_000, label: '180 days' },
  ],
  burns: [
    { tier: 0, amount: 0n, bonusBps: 0, label: 'No burn' },
    { tier: 1, amount: 100_000n * 10n ** 18n, bonusBps: 2_500, label: '100K $OBJECTPAD' },
    { tier: 2, amount: 1_000_000n * 10n ** 18n, bonusBps: 5_000, label: '1M $OBJECTPAD' },
  ],
} as const;

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Mythic';

/** Pure preview of the multiplier the Forge contract computes on-chain. */
export function craftMultiplierBps(ingredientCount: number, lockTier: number, burnTier: number): number {
  const lock = CRAFT.locks.find(l => l.tier === lockTier); const burn = CRAFT.burns.find(b => b.tier === burnTier);
  if (!lock || !burn || ingredientCount < CRAFT.minIngredients || ingredientCount > CRAFT.maxIngredients) throw new Error('Invalid recipe');
  return CRAFT.baseMultiplierBps + (ingredientCount === 3 ? CRAFT.trioBonusBps : 0) + lock.bonusBps + burn.bonusBps;
}

/** Cosmetic rarity derived only from the enforced multiplier. */
export function rarityOf(multiplierBps: number): Rarity {
  if (multiplierBps >= 27_500) return 'Mythic';
  if (multiplierBps >= 22_500) return 'Epic';
  if (multiplierBps >= 17_500) return 'Rare';
  if (multiplierBps >= 12_500) return 'Uncommon';
  return 'Common';
}

/** Share of one trade's notional that reaches each party, in bps of the trade. */
export function perTradeSplitBps() {
  return {
    creator: (CREATOR_TAX_BPS * VAULT_SPLIT.creatorBps) / BPS,
    forge: (CREATOR_TAX_BPS * VAULT_SPLIT.forgeBps) / BPS,
    burn: (CREATOR_TAX_BPS * VAULT_SPLIT.burnBps) / BPS,
    pons: PONS_PROTOCOL_FEE_BPS,
  };
}

export const FORGE_ABI = parseAbi([
  'function craft(address[] tokens,uint256[] amounts,uint8 lockTier,uint8 burnTier) returns (uint256 itemId)',
  'function claim(uint256 itemId) returns (uint256 paid)',
  'function dissolve(uint256 itemId)',
  'function pending(uint256 itemId) view returns (uint256)',
  'function itemsOf(address owner) view returns (uint256[])',
  'function ingredientsOf(uint256 itemId) view returns (address[] tokens,uint256[] amounts,uint256[] shares)',
  'function items(uint256 itemId) view returns (uint64 craftedAt,uint64 unlockAt,uint16 multiplierBps,uint8 count,uint256 burned)',
  'function totalShares(address token) view returns (uint256)',
  'function totalLocked(address token) view returns (uint256)',
  'function ownerOf(uint256 itemId) view returns (address)',
  'function nextItemId() view returns (uint256)',
  'function objectpadToken() view returns (address)',
  'event Crafted(uint256 indexed itemId,address indexed owner,address[] tokens,uint256[] amounts,uint16 multiplierBps,uint64 unlockAt,uint256 burned)',
  'event RewardNotified(address indexed token,uint256 amount)',
  'event Claimed(uint256 indexed itemId,address indexed owner,uint256 amount)',
  'event Dissolved(uint256 indexed itemId,address indexed owner)',
]);

export const BURN_ENGINE_ABI = parseAbi([
  'function token() view returns (address)',
  'function curve() view returns (address)',
  'function totalEthSpent() view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function burns() view returns (uint256)',
  'function maxPerBurn() view returns (uint256)',
  'function execute(uint256 amount,uint256 minTokensOut) returns (uint256 burned)',
  'event Funded(address indexed from,uint256 amount)',
  'event Burned(uint256 ethIn,uint256 tokensBurned,uint256 timestamp)',
]);

export const VAULT_FACTORY_ABI = parseAbi([
  'function vaultOf(bytes32 objectId) view returns (address)',
  'function deployed(bytes32 objectId) view returns (address)',
  'function harvest(bytes32 objectId) returns (uint256 distributed)',
]);

export const VAULT_ABI = parseAbi([
  'function creatorOwed() view returns (uint256)',
  'function withdrawOwed()',
  'function totalHarvested() view returns (uint256)',
  'event Harvested(uint256 total,uint256 creatorCut,uint256 forgeCut,uint256 burnCut)',
]);

export const ESCROW_ABI = parseAbi(['function balanceOf(address) view returns (uint256)', 'function claim()']);
/** Pons fee escrow holding creator-tax balances per recipient (selectors checked against deployed bytecode by the source app). */
export const PONS_FEE_ESCROW: Address = '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e';

export interface EconomyConfig { forge: Address | null; burnEngine: Address | null; objectpadToken: Address | null; vaultFactory: Address | null; registry: Address | null; }
