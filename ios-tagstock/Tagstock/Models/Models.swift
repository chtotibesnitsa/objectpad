import Foundation

// MARK: - Lenient decoding (every server field is optional so new or missing fields never break parsing)

nonisolated protocol DefaultValue { associatedtype V: Codable & Sendable & Hashable; static var value: V { get } }
nonisolated enum Str: DefaultValue { static var value: String { "" } }
nonisolated enum Num: DefaultValue { static var value: Double { 0 } }
nonisolated enum Zero: DefaultValue { static var value: Int { 0 } }
nonisolated enum No: DefaultValue { static var value: Bool { false } }
nonisolated enum Empty<T: Codable & Sendable & Hashable>: DefaultValue { static var value: [T] { [] } }

@propertyWrapper
nonisolated struct Def<P: DefaultValue>: Codable, Sendable, Hashable {
    var wrappedValue: P.V
    init(wrappedValue: P.V) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if P.V.self == Double.self, let s = try? c.decode(String.self), let d = Double(s) as? P.V { wrappedValue = d; return }
        wrappedValue = (try? c.decode(P.V.self)) ?? P.value
    }
    func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode(wrappedValue) }
}

nonisolated extension KeyedDecodingContainer {
    func decode<P>(_ type: Def<P>.Type, forKey key: Key) throws -> Def<P> { (try? decodeIfPresent(type, forKey: key)) ?? Def(wrappedValue: P.value) }
}

// MARK: - Market

nonisolated struct ObjectCoin: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var id: String
    @Def<Str> var token: String
    @Def<Str> var curve: String
    @Def<Str> var symbol: String
    @Def<Str> var name: String
    @Def<Str> var logo: String
    @Def<Str> var path: String
    var objectName: String?
    @Def<Num> var priceEth: Double
    @Def<Num> var marketCapEth: Double
    @Def<Num> var change24h: Double
    @Def<Num> var volume24hEth: Double
    @Def<Num> var volumeEth: Double
    @Def<Zero> var trades24h: Int
    @Def<Zero> var trades: Int
    @Def<Zero> var holders: Int
    @Def<Num> var progress: Double
    @Def<No> var graduated: Bool
    @Def<Empty<Double>> var spark: [Double]
    var lastTradeAt: Double?
    @Def<Num> var launchedAt: Double
    @Def<Num> var trending: Double
}

nonisolated struct CoinTrade: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var id: String
    @Def<Str> var curve: String
    @Def<Str> var side: String
    @Def<Num> var eth: Double
    @Def<Num> var tokens: Double
    @Def<Num> var price: Double
    @Def<Str> var trader: String
    @Def<Str> var hash: String
    @Def<Num> var at: Double
}

nonisolated struct CoinsFeed: Codable, Sendable { @Def<Empty<ObjectCoin>> var items: [ObjectCoin]; @Def<Empty<CoinTrade>> var recent: [CoinTrade] }
nonisolated struct CurveTrades: Codable, Sendable { @Def<Empty<CoinTrade>> var trades: [CoinTrade] }
nonisolated struct CoinHolder: Codable, Sendable, Hashable { @Def<Str> var address: String; @Def<Num> var balance: Double; @Def<Num> var share: Double; var label: String? }
nonisolated struct HoldersFeed: Codable, Sendable { @Def<Zero> var count: Int; @Def<Empty<CoinHolder>> var holders: [CoinHolder] }

nonisolated struct MarketTotals: Codable, Sendable, Hashable { @Def<Zero> var trades: Int; @Def<Num> var volumeEth: Double; @Def<Zero> var coins: Int; var creatorFeesEth: Double? }
nonisolated struct PadCounts: Codable, Sendable, Hashable { @Def<Zero> var launched: Int; @Def<Zero> var scanned: Int }
nonisolated struct MarketSnapshot: Codable, Sendable {
    var ethUsd: Double?
    var totals: MarketTotals?
    var objectpad: PadCounts?
}

nonisolated struct SponsorStatus: Codable, Sendable, Hashable {
    @Def<Str> var address: String
    @Def<Str> var balanceWei: String
    @Def<Str> var launchCostWei: String
    @Def<Zero> var launchesAffordable: Int
    @Def<Zero> var dailyLimit: Int
    @Def<Zero> var usedToday: Int
    var perPersonDaily: Int?
}
nonisolated struct Readiness: Codable, Sendable { @Def<Str> var mode: String; @Def<Str> var blocker: String; var sponsor: SponsorStatus? }

nonisolated struct BurnCoinShare: Codable, Sendable, Hashable { @Def<Str> var symbol: String; @Def<Num> var share: Double }
nonisolated struct BurnEntry: Codable, Sendable, Hashable, Identifiable { @Def<Str> var id: String; @Def<Num> var at: Double; @Def<Str> var ethIn: String; @Def<Str> var tokensBurned: String; var hash: String?; @Def<Str> var state: String; @Def<Empty<BurnCoinShare>> var coins: [BurnCoinShare] }
nonisolated struct BurnFeed: Codable, Sendable {
    @Def<No> var live: Bool
    @Def<Zero> var intervalSec: Int
    var nextAt: Double?
    @Def<Str> var totalEth: String
    @Def<Str> var totalTokens: String
    @Def<Zero> var burns: Int
    @Def<Empty<BurnEntry>> var items: [BurnEntry]
}
nonisolated struct BuildingCoin: Codable, Sendable, Hashable, Identifiable { @Def<Str> var code: String; @Def<Str> var name: String; @Def<Str> var symbol: String; @Def<Num> var progress: Double; @Def<Str> var stage: String; var id: String { code } }
nonisolated struct BuildingFeed: Codable, Sendable { @Def<Empty<BuildingCoin>> var items: [BuildingCoin] }

// MARK: - Scans & launches

nonisolated struct CaptureView: Codable, Sendable, Hashable { @Def<Str> var view: String; @Def<Num> var acceptedAt: Double }
nonisolated struct ObjectSuggestion: Codable, Sendable, Hashable { @Def<Str> var name: String; @Def<Str> var ticker: String; @Def<Str> var story: String; @Def<Zero> var compared: Int }
nonisolated struct LaunchDraft: Codable, Sendable, Hashable {
    var publicName: String
    var symbol: String
    var story: String
    var xUrl: String
    var telegram: String?
    var feeWallet: String?
}
nonisolated struct EngineJob: Codable, Sendable, Hashable { @Def<Str> var state: String; @Def<Num> var progress: Double; var queue: Int? }
nonisolated struct ModelArtifact: Codable, Sendable, Hashable { @Def<Str> var optimizedHash: String; @Def<Str> var modelUrl: String; @Def<Str> var thumbnailUrl: String; @Def<Zero> var triangles: Int }
nonisolated struct SessionLaunch: Codable, Sendable, Hashable { @Def<Str> var recordId: String; @Def<Str> var recordState: String; @Def<Str> var state: String; var hash: String?; var token: String?; var feeWallet: String? }
nonisolated struct CoinIconInfo: Codable, Sendable, Hashable { @Def<Str> var hash: String; @Def<Str> var url: String; @Def<Str> var source: String; var modelHash: String? }

nonisolated struct CaptureSession: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var id: String
    @Def<Str> var state: String
    @Def<Num> var createdAt: Double
    @Def<Empty<CaptureView>> var views: [CaptureView]
    var job: EngineJob?
    var model: ModelArtifact?
    var failureCode: String?
    var suggestion: ObjectSuggestion?
    var launchDraft: LaunchDraft?
    var objectId: String?
    var coinUrl: String?
    var failureRetries: Int?
    var guest: Bool?
    var launch: SessionLaunch?
    var successor: String?
    var icon: CoinIconInfo?

    var isCapturing: Bool { ["awaiting_mobile", "capturing"].contains(state) || (state == "review" && views.count < 6) }
    var isBuilding: Bool { ["screening", "reconstructing", "validating"].contains(state) || (state == "review" && views.count >= 6 && failureCode == nil) }
    var isModelReady: Bool { ["model_review", "approved"].contains(state) && model != nil }
    var isTerminal: Bool { ["blocked", "cancelled", "expired"].contains(state) }
    var isLaunched: Bool { launch?.recordState == "confirmed" }
}

nonisolated struct SessionCreated: Codable, Sendable { var session: CaptureSession; var handoffUrl: String? }
nonisolated struct SessionClaimed: Codable, Sendable { var session: CaptureSession; @Def<Str> var claimSecret: String }
nonisolated struct UploadTicket: Codable, Sendable { @Def<Str> var url: String; @Def<Str> var token: String }
nonisolated struct LaunchResult: Codable, Sendable { @Def<Str> var state: String; var hash: String?; var session: CaptureSession }
nonisolated struct SessionWrap: Codable, Sendable { var session: CaptureSession }
nonisolated struct SessionList: Codable, Sendable { @Def<Empty<CaptureSession>> var items: [CaptureSession] }
nonisolated struct GuestToken: Codable, Sendable { @Def<Str> var token: String }

/// The six guided angles, in shooting order.
nonisolated enum ScanAngle: String, CaseIterable, Sendable, Identifiable {
    case front, right, back, left, highFront = "high-front", highBack = "high-back"
    var id: String { rawValue }
    var title: String { ["Front", "Right side", "Back", "Left side", "Top · front", "Top · back"][index] }
    var hint: String { ["Face the object, phone at its height.", "Walk a quarter turn around it.", "Keep walking to the far side.", "One more quarter turn.", "Raise your phone and look down at it.", "From above, go to the far side."][index] }
    var short: String { ["Front", "Right", "Back", "Left", "Top 1", "Top 2"][index] }
    var index: Int { Self.allCases.firstIndex(of: self) ?? 0 }
    /// Position on the orbit ring (degrees), so the guide shows where to stand.
    var degrees: Double { [0, 90, 180, 270, 30, 210][index] }
}

// MARK: - Records & accounts

nonisolated struct RecordModel: Codable, Sendable, Hashable { @Def<Str> var modelUrl: String; @Def<Str> var thumbnailUrl: String; @Def<Zero> var triangles: Int }
nonisolated struct ObjectRecord: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var objectId: String
    @Def<Str> var publicName: String
    @Def<Str> var verifiedName: String
    @Def<Str> var symbol: String
    @Def<Str> var story: String
    @Def<Str> var xUrl: String
    @Def<Str> var canonicalUrl: String
    @Def<Str> var tokenAddress: String
    @Def<Str> var curveAddress: String
    @Def<Str> var launchTransactionHash: String
    var objectName: String?
    @Def<Num> var createdAt: Double
    var model: RecordModel?
    var iconUrl: String?
    var feeVault: String?
    @Def<Str> var creatorWallet: String
    @Def<Zero> var acceptedViewCount: Int
    var id: String { objectId }
}

nonisolated struct AccountWallet: Codable, Sendable, Hashable { @Def<Str> var address: String; @Def<Str> var kind: String; @Def<Str> var claimableWei: String; @Def<Num> var claimableEth: Double }
nonisolated struct AccountLaunch: Codable, Sendable, Hashable, Identifiable { @Def<Str> var objectId: String; @Def<Str> var symbol: String; @Def<Str> var name: String; @Def<Str> var thumbnail: String; var feeWallet: String?; var token: String?; var curve: String?; var launchedAt: Double?; var id: String { objectId } }
nonisolated struct AccountMe: Codable, Sendable {
    @Def<Str> var did: String
    @Def<Str> var publicId: String
    @Def<Str> var alias: String
    @Def<Empty<AccountWallet>> var wallets: [AccountWallet]
    @Def<Empty<AccountLaunch>> var launches: [AccountLaunch]
    @Def<Num> var totalClaimableEth: Double
    @Def<No> var `operator`: Bool
    var treasury: String?
}
nonisolated struct Profile: Codable, Sendable { @Def<Str> var publicId: String; @Def<Str> var alias: String; var wallet: String? }
nonisolated struct Adopted: Codable, Sendable { @Def<Zero> var adopted: Int }

// MARK: - Paid Rewards

nonisolated struct RewardPoster: Codable, Sendable, Hashable { @Def<Str> var handle: String; @Def<Str> var name: String; @Def<Str> var avatar: String; @Def<Str> var wallet: String }
nonisolated struct RewardAudit: Codable, Sendable, Hashable { @Def<Str> var event: String; @Def<Str> var detail: String; var tx: String?; @Def<Num> var at: Double }
nonisolated struct RewardProof: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var id: String
    @Def<Str> var photo: String
    var token: String?
    @Def<Str> var coinName: String
    @Def<Str> var coinSymbol: String
    @Def<Str> var note: String
    @Def<Str> var state: String
    @Def<Str> var reviewNote: String
    var payoutTx: String?
    @Def<Str> var handle: String
    @Def<Str> var avatar: String
    @Def<Str> var wallet: String
    @Def<No> var mine: Bool
    @Def<Num> var createdAt: Double
    var who: String { handle.isEmpty ? wallet : "@\(handle)" }
}
nonisolated struct RewardWinner: Codable, Sendable, Hashable { var handle: String?; @Def<Str> var avatar: String; @Def<Str> var coinName: String; @Def<Str> var coinUrl: String; @Def<Str> var creatorWallet: String; @Def<No> var paid: Bool }
nonisolated struct Reward: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var id: String
    @Def<Str> var kind: String
    @Def<Str> var title: String
    @Def<Str> var object: String
    @Def<Str> var tagline: String
    @Def<Empty<String>> var rules: [String]
    @Def<Str> var category: String
    @Def<No> var adult: Bool
    @Def<Num> var rewardUsd: Double
    var rewardEth: Double?
    var rewardWei: String?
    @Def<Str> var image: String
    var coverState: String?
    var promoUrl: String?
    @Def<Str> var status: String
    var deadline: Double?
    var poster: RewardPoster?
    var fundTx: String?
    var refundTx: String?
    var payoutTx: String?
    var escrow: String?
    @Def<No> var mine: Bool
    @Def<Str> var postedAt: String
    @Def<Num> var createdAt: Double
    @Def<Empty<RewardProof>> var submissions: [RewardProof]
    @Def<Empty<RewardAudit>> var audit: [RewardAudit]
    var winner: RewardWinner?

    var isPlatform: Bool { kind == "platform" }
    var painting: Bool { coverState == "generating" }
    var imageURL: URL? {
        guard !image.isEmpty, !painting else { return nil }
        return image.hasPrefix("http") ? URL(string: image) : URL(string: "https://www.objectpad.fun\(image)")
    }
}
nonisolated struct RewardStats: Codable, Sendable { @Def<Num> var openUsd: Double; @Def<Num> var paidUsd: Double; @Def<Zero> var open: Int; @Def<Zero> var paid: Int; @Def<Zero> var hunters: Int; @Def<Zero> var proofs: Int; @Def<Num> var escrowEth: Double }
nonisolated struct RewardBoard: Codable, Sendable { @Def<Empty<Reward>> var bounties: [Reward]; var stats: RewardStats?; @Def<Str> var escrow: String; @Def<No> var `operator`: Bool }
nonisolated struct RewardPhoto: Codable, Sendable, Hashable { @Def<Str> var hash: String; @Def<Str> var url: String }

// MARK: - Post & earn

nonisolated struct EarnMarket: Codable, Sendable { @Def<Num> var priceUsd: Double; @Def<Num> var marketCapUsd: Double; @Def<Num> var rewardUsd: Double; @Def<Num> var nextRewardUsd: Double; @Def<Num> var nextMilestoneUsd: Double; @Def<Num> var progress: Double }
nonisolated struct LeaderboardEntry: Codable, Sendable, Hashable { @Def<Str> var handle: String; @Def<Str> var name: String; @Def<Str> var avatar: String; @Def<Num> var paidUsd: Double; @Def<Num> var creditedUsd: Double; @Def<Zero> var payouts: Int }
nonisolated struct LeaderboardTotals: Codable, Sendable { @Def<Num> var paidUsd: Double; @Def<Num> var creditedUsd: Double; @Def<Zero> var earners: Int; @Def<Zero> var payouts: Int }
nonisolated struct Leaderboard: Codable, Sendable { @Def<Empty<LeaderboardEntry>> var earners: [LeaderboardEntry]; var totals: LeaderboardTotals? }
nonisolated struct EarnReason: Codable, Sendable, Hashable { @Def<Str> var message: String; @Def<Str> var fix: String }
nonisolated struct EarnSubmission: Codable, Sendable, Hashable, Identifiable { @Def<Str> var id: String; @Def<Str> var url: String; @Def<Str> var text: String; @Def<Str> var state: String; @Def<Num> var rewardUsd: Double; @Def<Str> var rewardState: String; @Def<Empty<EarnReason>> var reasons: [EarnReason]; @Def<Num> var submittedAt: Double }
nonisolated struct EarnBalances: Codable, Sendable { @Def<Num> var availableUsd: Double; @Def<Num> var pendingVerificationUsd: Double; @Def<Num> var pendingPayoutUsd: Double; @Def<Num> var lifetimeUsd: Double; @Def<Num> var claimedUsd: Double }
nonisolated struct EarnX: Codable, Sendable { @Def<Str> var handle: String; @Def<Str> var name: String; @Def<Str> var avatar: String }
nonisolated struct EarnWallet: Codable, Sendable, Hashable { @Def<Str> var address: String; @Def<Str> var kind: String }
nonisolated struct EarnMe: Codable, Sendable { var x: EarnX?; var xError: String?; var balances: EarnBalances?; @Def<Empty<EarnSubmission>> var submissions: [EarnSubmission]; @Def<Empty<EarnWallet>> var wallets: [EarnWallet] }
