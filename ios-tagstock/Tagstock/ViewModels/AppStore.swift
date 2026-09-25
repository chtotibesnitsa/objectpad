import Foundation
import SwiftUI

/// Shared app state: the same public reads the website polls (terminal, tape,
/// status, platform, open cases), plus a watched wallet whose balances are read
/// straight from Robinhood Chain. Nothing here fabricates data; every field is
/// nil/empty until a real response lands, and `lastError` surfaces failures.
@Observable
final class AppStore {
    private(set) var terminal: Terminal?
    private(set) var tape: [TickerItem] = []
    private(set) var status: PlatformStatus?
    private(set) var openCases: OpenCasesFeed?
    private(set) var ethUsd: Double = 0
    private(set) var isRefreshing: Bool = false
    private(set) var lastError: String?
    private(set) var lastUpdated: Date?

    /// Wallet the user chose to watch (address only, never keys). Persisted locally.
    var watchedWallet: String? {
        didSet {
            UserDefaults.standard.set(watchedWallet, forKey: "casepad.watchedWallet")
            Task { await refreshBalances() }
        }
    }
    private(set) var ethBalance: Double?
    private(set) var casepadBalance: Double?
    private(set) var coinBalances: [String: Double] = [:]
    private(set) var balancesUpdated: Date?

    var toast: String?

    private var loop: Task<Void, Never>?

    init() {
        watchedWallet = UserDefaults.standard.string(forKey: "casepad.watchedWallet")
    }

    var coins: [Coin] { terminal?.coins ?? [] }
    var platform: PlatformConfig? { terminal?.platform }
    var casepadCA: String { platform?.ecosystemToken ?? Chain.casepadToken }
    var xURL: URL? { platform?.xUrl.flatMap(URL.init(string:)) }

    /// Website tape filter: confirmed real-mode chain events with a tx hash.
    var chainActivity: [TickerItem] {
        let kinds: Set<String> = ["token.launched", "trade.buy", "trade.sell", "creator.buy", "creator.sell", "payout.confirmed", "vault.funded", "buyback.confirmed"]
        return tape.filter { $0.tokenInfo?.mode == "real" && $0.txHash != nil && kinds.contains($0.kind) }
    }

    /// Trending = the website's "Gainers" sort: observed move (bps since first snapshot in 24h), real coins only.
    var trending: [Coin] {
        coins.filter { $0.isReal && ($0.market?.changeBps ?? 0) > 0 && !($0.market?.stale ?? true) }
            .sorted { ($0.market?.changeBps ?? 0) > ($1.market?.changeBps ?? 0) }
    }

    func coin(_ token: String) -> Coin? { coins.first { $0.token.lowercased() == token.lowercased() } }

    func start() {
        guard loop == nil else { return }
        loop = Task { [weak self] in
            var tick = 0
            while !Task.isCancelled {
                await self?.refresh(fast: tick % 2 == 0)
                tick += 1
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }

    func stop() { loop?.cancel(); loop = nil }

    /// Fast tick refreshes the tape; every other tick refreshes markets/status too (matches web 10s/20s cadence).
    func refresh(fast: Bool = false) async {
        isRefreshing = true
        defer { isRefreshing = false }
        let api = CasepadApi.shared
        async let tapeTask = api.ticker()
        do { tape = try await tapeTask; lastError = nil } catch { lastError = error.localizedDescription }
        guard !fast || terminal == nil else { return }
        async let terminalTask = api.terminal()
        async let statusTask = api.status()
        async let casesTask = api.openCases()
        async let priceTask = api.ethPrice()
        do {
            terminal = try await terminalTask
            lastUpdated = Date()
            lastError = nil
        } catch { lastError = error.localizedDescription }
        status = try? await statusTask
        openCases = try? await casesTask
        if let price = try? await priceTask, price > 0 { ethUsd = price }
        if watchedWallet != nil, balancesUpdated == nil || Date().timeIntervalSince(balancesUpdated!) > 30 { await refreshBalances() }
    }

    func refreshBalances() async {
        guard let wallet = watchedWallet, Chain.isAddress(wallet) else {
            ethBalance = nil; casepadBalance = nil; coinBalances = [:]; balancesUpdated = nil
            return
        }
        let chain = ChainClient.shared
        ethBalance = try? await chain.ethBalance(wallet)
        casepadBalance = try? await chain.tokenBalance(token: casepadCA, owner: wallet)
        var balances: [String: Double] = [:]
        await withTaskGroup(of: (String, Double?).self) { group in
            for coin in coins where coin.isReal {
                group.addTask { (coin.token, try? await chain.tokenBalance(token: coin.token, owner: wallet)) }
            }
            for await (token, bal) in group { if let bal, bal > 0 { balances[token] = bal } }
        }
        coinBalances = balances
        balancesUpdated = Date()
    }

    func copy(_ value: String, label: String) {
        UIPasteboard.general.string = value
        Haptics.light()
        toast = "\(label) copied"
        Task { try? await Task.sleep(for: .seconds(1.6)); if toast == "\(label) copied" { toast = nil } }
    }
}

enum Haptics {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}
