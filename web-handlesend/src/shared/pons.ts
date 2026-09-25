/** Derived from the source launch adapter; no custody, fee splitter or retail quote arithmetic. */
import { createPublicClient, defineChain, encodeFunctionData, http, parseAbi, zeroAddress, type Address, type Hex } from 'viem';
export const robinhoodChain = defineChain({ id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } }, blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } }, contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } } });
export const PONS_FACTORY: Address = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
export const PONS_ROUTER: Address = '0xe33e9e479df8802cb0866d5d05258bec4cf62948';
export const LAUNCH_CONFIG_ID = 0n;
export const MIN_INITIAL_BUY_WEI = 100_000_000_000_000n;
export const ROUTER_ABI = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct LaunchParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'function launchAndBuy(LaunchParams params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns(address token,address curve,uint256 tokensOut)',
]);
export const FACTORY_ABI = parseAbi([
  'function launchFee() view returns(uint256)', 'function launchEnabled() view returns(bool)',
  'function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns(bytes32)',
  // Log layout checked against receipts: three indexed addresses, not four. Unknown words are not represented as supply.
  'event TokenLaunched(address indexed token,address indexed curve,address indexed launcher,address pairToken,uint256 value0,uint256 value1)',
]);
export const CURVE_ABI = parseAbi(['function token() view returns(address)', 'function pairToken() view returns(address)', 'function isNativeQuote() view returns(bool)', 'function graduated() view returns(bool)', 'function creatorTaxBps() view returns(uint256)', 'function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns(uint256)', 'function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns(uint256)', 'event CurveBuy(address indexed sender,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 protocolFee,uint256 creatorFee)', 'event CurveSell(address indexed sender,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 protocolFee,uint256 creatorFee)']);
export const ERC20_ABI = parseAbi(['function name() view returns(string)', 'function symbol() view returns(string)', 'function decimals() view returns(uint8)', 'function curve() view returns(address)', 'function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)']);
export const REGISTRY_ABI = parseAbi([
  'function register(bytes32 objectId,string publicName,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,string metadataUri,uint256 deadline,bytes signature)',
  'event ObjectRegistered(bytes32 indexed objectId,address indexed creator,string publicName,bytes32 metadataHash,bytes32 modelHash,bytes32 captureManifestHash,string metadataUri,uint256 timestamp,uint16 schemaVersion)',
  'event TokenLinked(bytes32 indexed objectId,address indexed token,address indexed creator)',
  'function linkToken(bytes32 objectId,address token)',
  'function exists(bytes32 objectId) view returns(bool)', 'function paused() view returns(bool)',
  'function artifactOwner(bytes32 hash) view returns(bytes32)', 'function objectOfToken(address token) view returns(bytes32)', 'function tokenOf(bytes32 objectId) view returns(address)',
]);
export function chainClient(rpc?: string) { return createPublicClient({ chain: robinhoodChain, transport: http(rpc, { timeout: 12_000, retryCount: 1 }) }); }
/** `recipient` receives the first buy; sponsored launches send it to the dead address so no one holds a launch bag. */
export interface LaunchInput { name: string; symbol: string; logo: string; description: string; website: string; twitter: string; telegram?: string; creator: Address; recipient?: Address; feeRecipient: Address; creatorTaxBps: number; quoteIn: bigint; minTokensOut: bigint; salt: Hex; }
export async function readLaunchTerms(client = chainClient()) { const [launchFee, expectedEconomics, enabled] = await Promise.all([client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: 'launchFee' }), client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: 'previewLaunchEconomics', args: [LAUNCH_CONFIG_ID, zeroAddress] }), client.readContract({ address: PONS_FACTORY, abi: FACTORY_ABI, functionName: 'launchEnabled' })]); return { launchFee, expectedEconomics, enabled }; }
export function launchArguments(input: LaunchInput, expectedEconomics: Hex) {
  if (input.quoteIn < MIN_INITIAL_BUY_WEI || input.minTokensOut < 0n || input.creatorTaxBps !== 150 || !/^0x[0-9a-f]{64}$/i.test(input.salt)) throw new Error('Launch terms require explicit protocol review.');
  return [{ name: input.name, symbol: input.symbol, logo: input.logo, description: input.description, socials: { twitter: input.twitter, telegram: input.telegram ?? '', discord: '', website: input.website, farcaster: '' }, creatorFeeRecipient: input.feeRecipient, creatorTaxBps: input.creatorTaxBps, buybackEnabled: false, expectedEconomics, salt: input.salt }, LAUNCH_CONFIG_ID, zeroAddress, input.quoteIn, input.minTokensOut, input.recipient ?? input.creator, []] as const;
}
export function buildLaunchTx(input: LaunchInput, terms: { launchFee: bigint; expectedEconomics: Hex }) { return { to: PONS_ROUTER, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'launchAndBuy', args: launchArguments(input, terms.expectedEconomics) }), value: terms.launchFee + input.quoteIn }; }
export const explorerTx = (hash: string) => `https://robinhoodchain.blockscout.com/tx/${hash}`;
