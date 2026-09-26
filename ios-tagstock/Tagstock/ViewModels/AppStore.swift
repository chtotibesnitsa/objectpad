import Foundation
import Observation
import SwiftUI

/// Live market state shared by every screen. Polls on the website's intervals and never invents numbers.
@Observable
@MainActor
final class AppStore {
    var coins: [ObjectCoin] = []
    var recent: [CoinTrade] = []
    var market: MarketSnapshot?
    var status: Readiness?
    var burns: BurnFeed?
    var building: [BuildingCoin] = []
    var rewards: RewardBoard?
    var pairs: PairBoard?
    var coinsError: String?
    var loaded: Bool = false
    var ethBalance: BigUInt?
    var balances: [String: BigUInt] = [:]
    var balanceWallet: String?
    var toast: String?
    var watchlist: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "watchlist") ?? [])

    private var started = false
    let account: AccountStore

    init(account: AccountStore) { self.account = account }

    var ethUsd: Double? { market?.ethUsd }

    /// Free-launch treasury: how many sponsored launches are left today.
    var launchesLeft: Int {
        guard let s = status?.sponsor else { return 0 }
        return max(0, min(s.launchesAffordable, s.perPersonDaily ?? 5, s.dailyLimit - s.usedToday))
    }
    var treasuryOpen: Bool { (status?.sponsor?.launchesAffordable ?? 0) >= 1 && (status?.sponsor.map { $0.usedToday < $0.dailyLimit } ?? false) }

    func coin(_ id: String) -> ObjectCoin? { coins.first { $0.id == id || $0.token.lowercased() == id.lowercased() } }

    func start() {
        guard !started else { return }
        started = true
        poll(10) { await self.refreshCoins() }
        poll(15) { await self.refreshMarket() }
        poll(30) { await self.refreshStatus() }
        poll(30) { await self.refreshBurns() }
        poll(20) { await self.refreshRewards() }
        poll(30) { await self.refreshPairs() }
        poll(6) { if let b = try? await ObjectPadApi.building() { self.building = b.items } }
    }

    private func poll(_ seconds: Double, _ block: @escaping @MainActor () async -> Void) {
        Task { while !Task.isCancelled { await block(); try? await Task.sleep(for: .seconds(seconds)) } }
    }

    func refreshCoins() async {
        do { let f = try await ObjectPadApi.coins(); coins = f.items; recent = f.recent; coinsError = nil; loaded = true; if balanceWallet != account.activeWallet { await refreshHoldings() } }
        catch { if coins.isEmpty { coinsError = error.localizedDescription }; loaded = true }
    }
    func refreshMarket() async { if let m = try? await ObjectPadApi.market() { market = m } }
    func refreshStatus() async { if let s = try? await ObjectPadApi.status() { status = s } }
    func refreshBurns() async { if let b = try? await ObjectPadApi.burns() { burns = b } }
    func refreshPairs() async { if let p = try? await ObjectPadApi.pairs() { pairs = p } }
    /// Live quote for a pair address (ETH when empty).
    func pair(_ address: String?) -> PairQuote? { pairs?.assets.first { PairCatalog.isEth(address) ? $0.isEth : $0.address.lowercased() == address?.lowercased() } }
    func refreshRewards() async { if let r = try? await RewardsApi(account: account).board() { rewards = r } }

    func refreshAll() async {
        async let a: Void = refreshCoins(); async let b: Void = refreshMarket(); async let c: Void = refreshStatus(); async let d: Void = refreshBurns(); async let e: Void = refreshRewards()
        _ = await (a, b, c, d, e)
        await refreshHoldings()
    }

    /// Live ETH and coin balances of the active wallet, read straight from Robinhood Chain.
    func refreshHoldings() async {
        guard let wallet = account.activeWallet else { return }
        balanceWallet = wallet
        ethBalance = try? await ChainClient.shared.balance(wallet)
        let tokens = coins.map(\.token)
        var out: [String: BigUInt] = [:]
        await withTaskGroup(of: (String, BigUInt?).self) { group in
            for t in tokens { group.addTask { (t, try? await ChainClient.shared.tokenBalance(t, owner: wallet)) } }
            for await (t, b) in group { if let b, !b.isZero { out[t.lowercased()] = b } }
        }
        balances = out
    }

    func toggleWatch(_ id: String) {
        if watchlist.contains(id) { watchlist.remove(id); show("Removed from watchlist") } else { watchlist.insert(id); show("Added to watchlist") }
        UserDefaults.standard.set(Array(watchlist), forKey: "watchlist")
        Feedback.selection()
    }

    func show(_ message: String) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { toast = message }
        Task { try? await Task.sleep(for: .seconds(2)); withAnimation(.easeOut(duration: 0.25)) { if toast == message { toast = nil } } }
    }
}
