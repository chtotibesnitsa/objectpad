/**
 * Every quote asset the Pons V2 factory (0x7ed5…ec7e) currently approves as a `pairToken`, read on-chain from
 * `PairTokenApprovalUpdated` events + `approvedPairTokens()` on Robinhood Chain (4663). ETH (zero address) is the default.
 * Re-verify with `approvedPairTokens(address)` before broadcasting; the owner can revoke an asset at any time.
 */
export type PairKind = 'native' | 'stock' | 'etf' | 'commodity' | 'stable' | 'crypto' | 'community';
export interface PairAsset { address: string; symbol: string; name: string; kind: PairKind; decimals: number; sector?: string; }

export const ETH_PAIR: PairAsset = { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', kind: 'native', decimals: 18 };

const s = (address: string, symbol: string, name: string, sector: string, kind: PairKind = 'stock', decimals = 18): PairAsset => ({ address, symbol, name, kind, decimals, sector });

export const PAIR_ASSETS: readonly PairAsset[] = [
  ETH_PAIR,
  s('0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', 'NVDA', 'NVIDIA', 'Semiconductors'),
  s('0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', 'AAPL', 'Apple', 'Consumer tech'),
  s('0x322f0929c4625ed5bad873c95208d54e1c003b2d', 'TSLA', 'Tesla', 'Automotive'),
  s('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', 'SPCX', 'SpaceX', 'Aerospace'),
  s('0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', 'GOOGL', 'Alphabet', 'Internet'),
  s('0x12f190a9f9d7d37a250758b26824b97ce941bf54', 'AMZN', 'Amazon', 'Retail'),
  s('0xe93237c50d904957cf27e7b1133b510c669c2e74', 'MSFT', 'Microsoft', 'Software'),
  s('0xc0d6457c16cc70d6790dd43521c899c87ce02f35', 'META', 'Meta Platforms', 'Internet'),
  s('0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8', 'NFLX', 'Netflix', 'Media'),
  s('0x1b0e319c6a659f002271b69db8a7df2f911c153e', 'GME', 'GameStop', 'Retail'),
  s('0x05a3d1cd21d0c88145e82600e62e7e496e0f222b', 'AMC', 'AMC Entertainment', 'Media'),
  s('0x1d11f0496982706c5e14a514d4e79f2e6bde4516', 'DJT', 'Trump Media & Technology', 'Media'),
  s('0x6330d8c3178a418788df01a47479c0ce7ccf450b', 'COIN', 'Coinbase', 'Crypto & fintech'),
  s('0xec262a75e413fafd0df80480274532c79d42da09', 'MSTR', 'Strategy', 'Crypto & fintech'),
  s('0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5', 'CRCL', 'Circle', 'Crypto & fintech'),
  s('0xcef9027c7d6985b85f0ba431125073529a947a68', 'BULL', 'Webull', 'Crypto & fintech'),
  s('0x408c14038a04f7bd235329e26d2bf569ee20e250', 'NU', 'Nu Holdings', 'Crypto & fintech'),
  s('0x86923f96303d656e4aa86d9d42d1e57ad2023fdc', 'AMD', 'AMD', 'Semiconductors'),
  s('0x58ffe4a942d3885baa22d7520691f611ef09e7aa', 'TSM', 'Taiwan Semiconductor', 'Semiconductors'),
  s('0xff080c8ce2e5feadaca0da81314ae59d232d4afd', 'MU', 'Micron', 'Semiconductors'),
  s('0x62fd0668e10d8b72339be2dcf7643001688ff13b', 'MRVL', 'Marvell', 'Semiconductors'),
  s('0xc72b96e0e48ecd4dc75e1e45396e26300bc39681', 'INTC', 'Intel', 'Semiconductors'),
  s('0x84cab63bc87912e71ad199ff14a0ba45de68fef8', 'SKHY', 'SK hynix', 'Semiconductors'),
  s('0xb90a19ff0af67f7779aff50a882a9cff42446400', 'SNDK', 'Sandisk', 'Semiconductors'),
  s('0x941ae714ec6d8130c7b75d67160ca08f1e7d11dd', 'DELL', 'Dell', 'Hardware'),
  s('0x980dcf6766fa79f5cf0c4aadb3ab477ff15a9619', 'IBM', 'IBM', 'Hardware'),
  s('0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a', 'PLTR', 'Palantir', 'Software'),
  s('0x116f00968269b7bfbad4109ce591d6e74c0601d4', 'NET', 'Cloudflare', 'Software'),
  s('0xba0cab75495255d0cb58e22b648bfed4ecd1f47e', 'SNOW', 'Snowflake', 'Software'),
  s('0x41f4267525a8aff329540ef24fd83d9044758b33', 'FIG', 'Figma', 'Software'),
  s('0xf53f66751b1eff985311b693531e3290f600c410', 'SHOP', 'Shopify', 'Software'),
  s('0x05b37fb53a299a1b874a619e1c4c404d52c36f4c', 'RDDT', 'Reddit', 'Internet'),
  s('0xf6589f11bc40b669e584073f428b05562f568733', 'SNAP', 'Snap', 'Internet'),
  s('0xad25ac6c84d497db898fa1e8387bf6af3532a1c4', 'BABA', 'Alibaba', 'Internet'),
  s('0x9e7abd3c9139d14e4c86dce0e455aab7a0c2fb3e', 'WYFI', 'WhiteFiber', 'Software'),
  s('0x59818904ab4ce163b3ce4ffb64f2d6ca02c434b4', 'QUBT', 'Quantum Computing', 'Hardware'),
  s('0x5e81213613b6b86eab4c6c50d718d34359459786', 'TTWO', 'Take-Two Interactive', 'Gaming'),
  s('0xf0c4bf4c582cb3836e98394b1d4e7b7281101be8', 'RBLX', 'Roblox', 'Gaming'),
  s('0x48e39e56acdba37b09020c0b734a613c9a2f100a', 'BB', 'BlackBerry', 'Software'),
  s('0xb1bf26c1d20ff267a4f93550d1e0d06ac40a114b', 'RIVN', 'Rivian', 'Automotive'),
  s('0x25c288e6d899b9bc30160965ad9644c67e73be0c', 'F', 'Ford', 'Automotive'),
  s('0x4d21483a44bf67a86b77e3da301411880797d452', 'BA', 'Boeing', 'Aerospace'),
  s('0x329fcaceb9ad6f9580dd5f643fed0646900d043c', 'LMT', 'Lockheed Martin', 'Aerospace'),
  s('0x3b14c39e89d60d627b42a1a4ca45b5bb45fc12e2', 'RKLB', 'Rocket Lab', 'Aerospace'),
  s('0xfde6b5d9bb419b10c23268c74e369abff39c0460', 'RCAT', 'Red Cat', 'Aerospace'),
  s('0x4ea005168d7f09a7a0ba9d1def21a479950e44c2', 'COST', 'Costco', 'Retail'),
  s('0x4e62068525ab11fe768e29dfd00ef909b9803016', 'LULU', 'Lululemon', 'Retail'),
  s('0xf23250dac154d05bb671cb0d0ebef3c635c79ce2', 'UPS', 'UPS', 'Industrials'),
  s('0x822cc93ffd030293e9842c30bbd678f530701867', 'BE', 'Bloom Energy', 'Energy'),
  s('0xae517a2903e68bd929dfd15be875f8369d53e94a', 'CEG', 'Constellation Energy', 'Energy'),
  s('0x8005d266423c7ea827372c9c864491e5786600ea', 'LLY', 'Eli Lilly', 'Healthcare'),
  s('0x03dfbbe0ac4e7bcdafd08ed41a400326b77d8c80', 'JNJ', 'Johnson & Johnson', 'Healthcare'),
  s('0x7066a64c24e4206cd62e83bf198c1e7eb361f51e', 'PFE', 'Pfizer', 'Healthcare'),
  s('0x43b07d15ce533bec5476d70c22a78a1b2b662155', 'MRNA', 'Moderna', 'Healthcare'),
  s('0xccee82fe024c36fa15e1005ede3e9e4787e23d09', 'HIMS', 'Hims & Hers', 'Healthcare'),
  s('0x117cc2133c37b721f49de2a7a74833232b3b4c0c', 'SPY', 'SPDR S&P 500 ETF', 'Index', 'etf'),
  s('0xd5f3879160bc7c32ebb4dc785f8a4f505888de68', 'QQQ', 'Invesco QQQ', 'Index', 'etf'),
  s('0x92fd66527192e3e61d4ddd13322aa222de86f9b5', 'SGOV', 'iShares 0-3M Treasury', 'Bonds', 'etf'),
  s('0xacef2e09adb47ad6abebad9ff06689e60615c2b6', 'INDA', 'iShares MSCI India', 'International', 'etf'),
  s('0x7f0abef0c07280f82c6a08ead09ded6bae2c13fc', 'EWY', 'iShares MSCI South Korea', 'International', 'etf'),
  s('0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e', 'GLD', 'SPDR Gold Trust', 'Gold', 'commodity'),
  s('0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f', 'SLV', 'iShares Silver Trust', 'Silver', 'commodity'),
  s('0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344', 'USO', 'United States Oil Fund', 'Oil', 'commodity'),
  s('0x5fc5360d0400a0fd4f2af552add042d716f1d168', 'USDG', 'Global Dollar', 'Stablecoin', 'stable', 6),
  s('0xcec185eb182c47d1ba1efc84e6959e18cd620be4', 'cbBTC', 'Coinbase Wrapped BTC', 'Bitcoin', 'crypto', 8),
  s('0xf3081494b87e8d5fb7960f066e931d1d0e6e3d67', 'TAO', 'Bittensor', 'AI', 'crypto'),
  s('0x63c12667638f2ae6fc6ae09b43d98ec84a8586ea', 'wsNET', 'Wrapped Staked NET', 'Liquid staking', 'crypto'),
  s('0xaa07a0e9209e16ac99708c3ec70159c6ef3128a3', 'ORBIO', 'Orbio.so', 'Community', 'community'),
  s('0xab093def657f15df31b33922a95e047add645b29', 'SHROOM', 'MUSHROOM', 'Community', 'community'),
  s('0x56910d4409f3a0c78c64dd8d0545ff0705389870', 'Index', 'The Index', 'Community', 'community'),
  s('0x07ebb29a38fbcb41563817e5e19f2cec619c90d2', 'BUN', 'Bundle Cat', 'Community', 'community'),
];

const BY_ADDRESS = new Map(PAIR_ASSETS.map(a => [a.address.toLowerCase(), a]));
/** Resolves a curve's `pairToken()` to catalog metadata; unknown addresses return null. */
export const pairAsset = (address: string | null | undefined): PairAsset | null => BY_ADDRESS.get((address || ETH_PAIR.address).toLowerCase()) ?? null;
const BY_SYMBOL = new Map(PAIR_ASSETS.map(a => [a.symbol.toUpperCase(), a]));
/** Looks an asset up by ticker (case-insensitive, `$` stripped). */
export const pairBySymbol = (symbol: unknown): PairAsset | null => typeof symbol === 'string' ? BY_SYMBOL.get(symbol.replace(/^\$/, '').trim().toUpperCase()) ?? null : null;
/** True for the default native-ETH pair (zero address, empty or missing). */
export const isEthPair = (address: string | null | undefined): boolean => !address || address.toLowerCase() === ETH_PAIR.address;
