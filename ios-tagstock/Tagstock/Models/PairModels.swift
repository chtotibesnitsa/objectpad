import Foundation

/// What a coin trades against (a Pons V2 quote asset). nil on a coin = ETH.
nonisolated struct CoinPair: Codable, Sendable, Hashable {
    @Def<Str> var address: String
    @Def<Str> var symbol: String
    @Def<Str> var name: String
    @Def<Str> var kind: String
    var sector: String?
    @Def<Str> var logo: String
    var priceEth: Double?
    var priceUsd: Double?
    var change24h: Double?
}

/// The AI's recommended pair for a scanned object. Shown as a one-tap suggestion; ETH stays the default.
nonisolated struct PairSuggestion: Codable, Sendable, Hashable {
    @Def<Str> var symbol: String
    @Def<Str> var address: String
    @Def<Str> var name: String
    @Def<Str> var reason: String
}

/// Uniswap V3 route to buy a pair asset with ETH (WETH first).
nonisolated struct PairRoute: Codable, Sendable, Hashable {
    @Def<Empty<String>> var tokens: [String]
    @Def<Empty<Int>> var fees: [Int]
}

/// One Pons V2 pair asset with its live on-chain price.
nonisolated struct PairQuote: Codable, Sendable, Hashable, Identifiable {
    @Def<Str> var address: String
    @Def<Str> var symbol: String
    @Def<Str> var name: String
    @Def<Str> var kind: String
    @Def<Zero> var decimals: Int
    var sector: String?
    @Def<Str> var logo: String
    @Def<No> var approved: Bool
    var priceEth: Double?
    var priceUsd: Double?
    var change24h: Double?
    @Def<Zero> var coins: Int
    var route: PairRoute?
    var id: String { address.lowercased() }
    var isEth: Bool { kind == "native" }
}

nonisolated struct PairRouter: Codable, Sendable, Hashable {
    @Def<Str> var swapRouter: String
    @Def<Str> var quoter: String
    @Def<Str> var weth: String
}

nonisolated struct PairBoard: Codable, Sendable {
    var ethUsd: Double?
    @Def<Empty<PairQuote>> var assets: [PairQuote]
    var router: PairRouter?
}

nonisolated enum PairCatalog {
    static let ethAddress = "0x0000000000000000000000000000000000000000"
    static let popular = ["ETH", "NVDA", "TSLA", "AAPL", "SPCX", "GME", "COIN", "MSTR", "PLTR", "SPY", "QQQ", "GLD", "AMZN", "META", "GOOGL", "RBLX", "NFLX", "USDG", "cbBTC"]
    static let kinds: [(String, String)] = [("popular", "Popular"), ("stock", "Stocks"), ("etf", "ETFs"), ("commodity", "Commodities"), ("crypto", "Crypto"), ("stable", "Stable"), ("community", "Community"), ("all", "All")]
    static func isEth(_ address: String?) -> Bool { guard let a = address, !a.isEmpty else { return true }; return a.lowercased() == ethAddress }
}
