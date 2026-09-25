import Foundation

// Typed mirrors of the CasePad backend JSON (`/api/crates/*`). Field names match
// `web-handlesend/src/lib/crates-api.ts` and `casepad-api.ts` exactly so web and
// mobile decode the same payloads. Amounts stay as decimal strings (wei/units).

nonisolated struct TokenBrief: Codable, Hashable, Identifiable {
    var id: String { token }
    let token: String
    let name: String
    let ticker: String
    let image: String
    let mode: String
}

nonisolated struct VaultNumbers: Codable, Hashable {
    let accruedWei: String
    let settledWei: String
    let committedWei: String
    let claimableWei: String
    let paidWei: String
    let freeWei: String
    let invariantOk: Bool
    let rounds: Int
    let activeRounds: Int
}

nonisolated struct Reference: Codable, Hashable {
    let symbol: String
    let name: String
}

nonisolated struct MarketSnapshot: Codable, Hashable {
    let priceWei: String
    let marketCapWei: String
    let reserveWei: String
    let progressBps: Int
    let block: String
    let observedAt: Int64
    let graduated: Bool
    let priceUsd: Double?
    let marketCapUsd: Double?
    let changeBps: Int?
    let changeSince: Int64?
    let stale: Bool
    let volumeWei: String
    let volumeLabel: String
}

nonisolated struct Coin: Codable, Hashable, Identifiable {
    var id: String { token }
    let token: String
    let curve: String
    let txHash: String
    let blockNumber: Int
    let name: String
    let ticker: String
    let description: String
    let image: String
    let website: String
    let reference: Reference?
    let creatorAddress: String
    let creatorDid: String
    let feeRecipient: String
    let creatorTaxBps: Int
    let mode: String
    let createdAt: Int64
    let vault: VaultNumbers
    let market: MarketSnapshot?

    var brief: TokenBrief { TokenBrief(token: token, name: name, ticker: ticker, image: image, mode: mode) }
    var isReal: Bool { mode == "real" }
}

nonisolated struct FeeConfig: Codable, Hashable {
    let protocolBps: Int
    let totalBps: Int?
    let devBps: Int?
    let rewardBps: Int
    let ecosystemBuybackBps: Int
    let creatorRetainedBps: Int
    let basis: String
    let buybackIntervalMs: Int64?
}

nonisolated struct BuybackConfig: Codable, Hashable {
    let status: String
    let target: String?
    let reason: String
    let nextCycleAt: Int64?
}

nonisolated struct ReadinessCheck: Codable, Hashable, Identifiable {
    let id: String
    let ok: Bool
    let detail: String
}

nonisolated struct Readiness: Codable, Hashable {
    let ok: Bool
    let checks: [ReadinessCheck]
    let live: Bool?
}

nonisolated struct PlatformConfig: Codable, Hashable {
    let name: String
    let ecosystemToken: String?
    let xUrl: String?
    let chainId: Int
    let fees: FeeConfig
    let tokenRewards: String
    let marketplace: String
    let readiness: Readiness
    let buyback: BuybackConfig
    let blockers: [String]
}

nonisolated struct Terminal: Codable {
    let coins: [Coin]
    let platform: PlatformConfig
    let observedAt: Int64
    let chainBlock: String?
    let source: String
}

nonisolated struct ChainInfo: Codable, Hashable {
    let id: Int
    let name: String
    let explorer: String
}

nonisolated struct Contribution: Codable, Hashable {
    let bps: Int
    let devBps: Int?
    let cratesBps: Int
    let buybackBps: Int
    let protocolBps: Int
}

nonisolated struct Randomness: Codable, Hashable {
    let method: String
    let provablyFair: Bool
    let note: String
}

nonisolated struct PlatformStatus: Codable {
    let name: String
    let chain: ChainInfo
    let feeRouting: String
    let payouts: String
    let realValue: String
    let randomness: Randomness
    let paused: Bool
    let maintenance: Bool
    let contribution: Contribution
    let burnAddress: String
    let now: Int64
}

nonisolated struct PublicUser: Codable, Hashable {
    let did: String
    let handle: String
    let name: String
    let avatar: String
    let wallet: String?
    let hideAmounts: Bool?
}

nonisolated struct TickerPayload: Codable, Hashable {
    let notionalWei: String?
    let amountWei: String?
    let txHash: String?
    let blockNumber: Int?
    let label: String?
    let name: String?
    let ticker: String?
}

nonisolated struct TickerItem: Codable, Hashable, Identifiable {
    let id: String
    let kind: String
    let token: String
    let tokenInfo: TokenBrief?
    let payload: TickerPayload
    let user: PublicUser?
    let txHash: String?
    let createdAt: Int64

    /// Website `activityLabel`.
    var label: String {
        switch kind {
        case "token.launched": return "LAUNCH"
        case "trade.buy": return "BUY"
        case "trade.sell": return "SELL"
        case "creator.buy": return "DEV BUY"
        case "creator.sell": return "DEV SELL"
        case "payout.confirmed": return "PAYOUT"
        case "vault.funded": return "FUNDING"
        case "buyback.confirmed": return "BUYBACK"
        default: return kind.uppercased()
        }
    }
    var isSell: Bool { kind.contains("sell") }
    var amountWei: String? { payload.amountWei ?? payload.notionalWei }
}

nonisolated struct RemainingPrize: Codable, Hashable {
    let rarity: String
    let label: String
    let visual: String
    let amountWei: String
    let count: Int
}

nonisolated struct Round: Codable, Hashable, Identifiable {
    let id: String
    let token: String
    let crateId: String
    let crateName: String
    let mode: String
    let state: String
    let entries: Int
    let reserved: Int
    let opened: Int
    let available: Int
    let committedWei: String
    let asset: String?
    let entryUnits: String?
    let designId: String?
    let seedCommit: String
    let seedRevealed: String?
    let createdAt: Int64
    let expiresAt: Int64
    let closedAt: Int64?
    let remainingPrizes: [RemainingPrize]
    let tokenInfo: TokenBrief?
}

nonisolated struct OpenCaseMarket: Codable, Hashable {
    let volumeWei: String
    let burns: Int
    let burnedUnits: String
    let priceWei: String?
    let stale: Bool
}

nonisolated struct OpenCase: Codable, Hashable, Identifiable {
    var id: String { round.id }
    let round: Round
    let token: TokenBrief?
    let market: OpenCaseMarket
    let opened: Int
    let bestPrizeUnits: String
}

nonisolated struct OpenCasesFeed: Codable {
    let cases: [OpenCase]
    let live: Bool
    let burnAddress: String
    let observedAt: Int64
}

nonisolated struct CaseOutcome: Codable, Hashable {
    let visual: String
    let label: String
    let count: Int
    let units: String
}

nonisolated struct CaseDesign: Codable, Hashable, Identifiable {
    let id: String
    let provenance: String
    let name: String
    let entryUnits: String
    let outcomes: [CaseOutcome]
    let entries: Int
    let committedUnits: String
    let expectedUnits: String
    let returnBps: String
    let profitProbabilityBps: Int
    let zeroProbabilityBps: Int
    let warnings: [String]
}

nonisolated struct CaseDesigns: Codable {
    let token: String
    let state: String
    let platform: [CaseDesign]
    let creator: [CaseDesign]
    let note: String
}

nonisolated struct AnyPayload: Codable, Hashable {
    let txHash: String?
    let notionalWei: String?
    let amountWei: String?
    let blockNumber: Int?
}

nonisolated struct TokenEvent: Codable, Hashable, Identifiable {
    let id: String
    let kind: String
    let payload: AnyPayload
    let createdAt: Int64
}

nonisolated struct Milestone: Codable, Hashable, Identifiable {
    let id: String
    let label: String
    let targetWei: String
    let unlocks: String
    let reached: Bool
    let progressBps: Int
}

nonisolated struct Quest: Codable, Hashable, Identifiable {
    let id: String
    let token: String
    let tokenInfo: TokenBrief?
    let title: String
    let description: String
    let criteria: String
    let tier: String
    let quantity: Int
    let allocationsTotal: Int
    let allocationsLeft: Int
    let deadline: Int64
    let state: String
    let submissions: Int
    let createdAt: Int64
}

nonisolated struct BattleSeat: Codable, Hashable {
    let seat: Int
    let user: PublicUser
}

nonisolated struct Battle: Codable, Hashable, Identifiable {
    let id: String
    let token: String
    let tokenInfo: TokenBrief?
    let crateName: String
    let keyTier: String
    let host: PublicUser
    let size: Int
    let state: String
    let createdAt: Int64
    let winnerDid: String?
    let participants: [BattleSeat]
    let committedWei: String
    let rules: String
}

nonisolated struct TokenDetail: Codable {
    let token: Coin
    let rounds: [Round]
    let quests: [Quest]
    let battles: [Battle]
    let events: [TokenEvent]
    let participants: Int
    let milestones: [Milestone]
}

nonisolated struct Inventory: Codable {
    let heldUnits: String
    let committedUnits: String
    let claimableUnits: String
    let freeUnits: String
    let snapshotBlock: Int?
    let snapshotAt: Int64?
    let invariantOk: Bool
    let treasury: String?
    let escrowWei: String
    let ethWei: String
    let gasReserveWei: String
}

nonisolated struct TreasuryTx: Codable, Hashable, Identifiable {
    let id: String
    let token: String
    let kind: String
    let amount_wei: String
    let tx_hash: String?
    let state: String
    let created_at: Int64
    let confirmed_at: Int64?
    let tokenInfo: TokenBrief?
}

nonisolated struct TransactionsFeed: Codable {
    let items: [TreasuryTx]
    let totals: [String: String]
    let scope: String
}

nonisolated struct ActivityItem: Codable, Hashable, Identifiable {
    let id: String
    let type: String
    let kind: String
    let at: Int64
    let token: String
    let tokenInfo: TokenBrief?
    let user: PublicUser?
    let wallet: String?
    let amountWei: String?
    let asset: String?
    let txHash: String?
    let state: String
    let href: String
    let label: String
}

nonisolated struct PnlRow: Codable, Hashable, Identifiable {
    var id: String { user.did }
    let user: PublicUser
    let wonWei: String
    let spentWei: String
    let netWei: String
    let opens: Int
    let bestWei: String
}

nonisolated struct LeaderboardRow: Codable, Hashable, Identifiable {
    var id: String { user.did }
    let user: PublicUser
    let score: Int
    let quests: Int?
    let wins: Int?
    let opens: Int?
}

nonisolated struct RankingRow: Codable, Hashable {
    let token: TokenBrief?
    let mode: String
    let settledWei: String
    let freeWei: String
    let committedWei: String
    let keysOutstanding: Int
    let opened: Int
    let returnBps: Int?
}

nonisolated struct Rankings: Codable {
    let bestValue: [RankingRow]
    let bestReturn: [RankingRow]
    let mostFunded: [RankingRow]
}

nonisolated struct BurnFeedItem: Codable, Hashable {
    let token: String
    let tokenInfo: TokenBrief?
    let txHash: String?
    let amountWei: String
    let at: Int64
}

nonisolated struct BurnFeed: Codable {
    let target: String?
    let intervalMs: Int64
    let nextCycleAt: Int64
    let lastCycleAt: Int64?
    let totalBurnedWei: String
    let items: [BurnFeedItem]
}

nonisolated struct ChatMessage: Codable, Hashable, Identifiable {
    let id: String
    let body: String
    let createdAt: Int64
    let user: PublicUser
}

nonisolated struct MessagesPage: Codable {
    let channel: String
    let messages: [ChatMessage]
    let nextCursor: String?
}

/// Curve trade decoded directly from Robinhood Chain logs (same as website `readCurveHistory`).
nonisolated struct CurveTrade: Hashable, Identifiable {
    var id: String { "\(txHash)-\(logIndex)" }
    let txHash: String
    let logIndex: Int
    let blockNumber: Int
    let isBuy: Bool
    let sender: String
    let eth: Double
    let tokens: Double
    let creatorFeeEth: Double
    var timestamp: Int64
    var priceEth: Double { tokens > 0 ? eth / tokens : 0 }
}

/// Live bonding-curve state read from the Pons curve contract (website `CurveState`).
nonisolated struct CurveState: Hashable {
    let quoteReserve: Double
    let tokenReserve: Double
    let phantomQuote: Double
    let graduationThreshold: Double
    let graduated: Bool
    let creatorTaxBps: Int
    let priceEth: Double
    let mcapEth: Double
    let reserveEth: Double
    let sold: Double
    let progress: Double
}
