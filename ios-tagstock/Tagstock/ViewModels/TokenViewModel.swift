import Foundation

/// Coin detail: backend record + live curve state + real trade history from
/// Robinhood Chain logs, refreshed on the same cadence as the website (8s / 15s).
@Observable
final class TokenViewModel {
    let token: String
    private(set) var detail: TokenDetail?
    private(set) var inventory: Inventory?
    private(set) var designs: CaseDesigns?
    private(set) var rounds: [Round] = []
    private(set) var curve: CurveState?
    private(set) var trades: [CurveTrade] = []
    private(set) var historyLoading: Bool = true
    private(set) var error: String?
    private(set) var notFound: Bool = false
    private var loop: Task<Void, Never>?

    init(token: String) { self.token = token }

    var coin: Coin? { detail?.token }

    func holders() -> [(address: String, tokens: Double)] {
        // Holder balances derived from curve trades (buys add, sells subtract), as the website does from Transfer logs.
        var map: [String: Double] = [:]
        for t in trades { map[t.sender, default: 0] += t.isBuy ? t.tokens : -t.tokens }
        return map.filter { $0.value > 0 }.map { ($0.key, $0.value) }.sorted { $0.tokens > $1.tokens }
    }

    func points(ethUsd: Double) -> [PricePoint] {
        var list = trades.map { PricePoint(t: $0.timestamp, price: $0.priceEth * ethUsd) }
        if let c = curve, !c.graduated { list.append(PricePoint(t: Int64(Date().timeIntervalSince1970 * 1000), price: c.priceEth * ethUsd)) }
        return list
    }

    var markers: [(t: Int64, label: String)] {
        (detail?.events ?? []).compactMap { e in
            switch e.kind {
            case "vault.funded": return (e.createdAt, "Vault funded")
            case "round.published": return (e.createdAt, "Round opened")
            case "payout.confirmed", "reward.revealed": return (e.createdAt, "Reward")
            default: return nil
            }
        }
    }

    func start() {
        guard loop == nil else { return }
        loop = Task { [weak self] in
            var tick = 0
            while !Task.isCancelled {
                await self?.refresh(history: tick % 2 == 0)
                tick += 1
                try? await Task.sleep(for: .seconds(8))
            }
        }
    }
    func stop() { loop?.cancel(); loop = nil }

    func refresh(history: Bool = true) async {
        let api = CasepadApi.shared
        do {
            detail = try await api.token(token)
            error = nil
        } catch let e as ApiError {
            if case .http(404, _) = e { notFound = true }
            error = e.localizedDescription
            return
        } catch { self.error = error.localizedDescription; return }
        guard let coin, coin.isReal else { historyLoading = false; return }
        async let inv = api.inventory(token)
        async let des = api.caseDesigns(token)
        async let rds = api.liveRounds(token)
        async let state = ChainClient.shared.curveState(curve: coin.curve)
        inventory = try? await inv
        designs = try? await des
        rounds = (try? await rds) ?? []
        curve = try? await state
        if history {
            if let h = try? await ChainClient.shared.curveHistory(curve: coin.curve, fromBlock: coin.blockNumber) { trades = h }
            historyLoading = false
        }
    }
}
