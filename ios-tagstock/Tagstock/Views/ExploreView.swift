import SwiftUI

enum MarketSort: String, CaseIterable, Identifiable {
    case new = "New launches", gainers = "Gainers", volume = "Volume", mcap = "Market cap"
    var id: String { rawValue }
}

/// Explore: hero, live tape, trending, market list. Same data and sort rules as the website.
struct ExploreView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var sort: MarketSort = .new
    @State private var query: String = ""

    private var filtered: [Coin] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)
        return store.coins.filter { q.isEmpty || "\($0.name) \($0.ticker) \($0.token)".lowercased().contains(q) }
            .sorted { a, b in
                switch sort {
                case .gainers: return (a.market?.changeBps ?? Int.min) > (b.market?.changeBps ?? Int.min)
                case .mcap: return (a.market?.marketCapUsd ?? -1) > (b.market?.marketCapUsd ?? -1)
                case .volume: return (Wei.toDouble(a.market?.volumeWei ?? "0") ?? 0) > (Wei.toDouble(b.market?.volumeWei ?? "0") ?? 0)
                case .new: return a.createdAt > b.createdAt
                }
            }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                hero
                tapeStrip
                if !store.trending.isEmpty { trending }
                market
                onTheTape
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
        }
        .background(Theme.background)
        .refreshable { await store.refresh() }
        .searchable(text: $query, prompt: "Search coins or paste a contract")
        .onSubmit(of: .search) { if Chain.isAddress(query) { pasted = query.lowercased() } }
        .navigationDestination(item: $pasted) { TokenDetailView(token: $0) }
    }
    @State private var pasted: String?

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Circle().fill(Theme.gold).frame(width: 6, height: 6)
                Eyebrow("The coin-first launchpad  /  Pons V2")
            }
            (Text("Burn coins.\nOpen cases.\n").foregroundStyle(Theme.foreground) + Text("A chance to win more.").foregroundStyle(Theme.gold))
                .font(.system(size: 34, weight: .black)).tracking(-1.6).lineSpacing(-2)
            Text("Discover a coin. Burn some to open a case for a chance at more of that same coin. ")
                .foregroundStyle(Theme.muted) + Text("Never a guaranteed return.").foregroundStyle(Theme.foreground.opacity(0.85))
            Eyebrow(store.platform?.tokenRewards == "enabled" ? "Live cases open · trading uses ETH" : "Live cases open when the operator flips the switch", color: Theme.gold.opacity(0.85))
            HStack(spacing: 8) {
                CopyChip(label: "CA", value: store.casepadCA)
                if let x = store.xURL {
                    Button { openURL(x) } label: {
                        HStack(spacing: 6) { Text("𝕏").font(.system(size: 15)); Text("Follow Casepad") }
                            .font(.system(size: 12, weight: .bold)).padding(.horizontal, 12).frame(height: 36)
                            .background(Theme.secondary, in: .rect(cornerRadius: 8, style: .continuous))
                    }.buttonStyle(PressableStyle())
                }
            }
            NavigationLink(value: Route.launch) {
                Label("Launch a coin", systemImage: "plus").frame(maxWidth: .infinity)
            }.buttonStyle(PrimaryButtonStyle())
            feeStrip
        }
        .font(.system(size: 15, weight: .medium))
        .padding(.top, 8)
    }

    private var feeStrip: some View {
        let c = store.status?.contribution
        let dev = Double(c?.devBps ?? 50) / 100, crates = Double(c?.cratesBps ?? 50) / 100, burn = Double(c?.buybackBps ?? 50) / 100
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                HStack(spacing: 6) { RoundedRectangle(cornerRadius: 1).fill(Theme.up).frame(width: 6, height: 6); Text(store.status?.chain.name ?? Chain.name) }
                Text("\(store.coins.count) Casepad launches")
                Text(String(format: "%.1f%% Creator", dev))
                Text(String(format: "%.1f%% Case treasury", crates))
                Text(String(format: "%.1f%% CASEPAD burn / %d min", burn, Int((store.platform?.fees.buybackIntervalMs ?? 1_800_000) / 60_000)))
            }
            .font(.system(size: 10, weight: .medium, design: .monospaced)).textCase(.uppercase).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 10).overlay(alignment: .top) { Divider().overlay(Theme.border) }.overlay(alignment: .bottom) { Divider().overlay(Theme.border) }
    }

    private var tapeStrip: some View {
        let items = Array(store.chainActivity.prefix(14))
        return HStack(spacing: 0) {
            VStack(spacing: 2) {
                HStack(spacing: 4) { Circle().fill(Theme.up).frame(width: 6, height: 6); Text("LIVE") }
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.up)
                Text("tape").font(.system(size: 10)).foregroundStyle(Theme.muted)
            }
            .frame(width: 66).frame(maxHeight: .infinity).overlay(alignment: .trailing) { Rectangle().fill(Theme.border).frame(width: 1) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if items.isEmpty {
                        Text("No confirmed Casepad transactions yet.").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.muted).padding(.horizontal, 10)
                    }
                    ForEach(items) { item in
                        NavigationLink(value: Route.token(item.token)) {
                            HStack(spacing: 6) {
                                Text(item.label).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(item.isSell ? Theme.down : Theme.up)
                                Text("$\(item.tokenInfo?.ticker ?? "")").font(.system(size: 11, weight: .bold))
                                if let a = item.amountWei { Text(Format.eth(a, digits: 3)).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
                            }
                            .padding(.horizontal, 10).frame(height: 40)
                            .background(Theme.cardRaised, in: .rect(cornerRadius: 10, style: .continuous))
                        }.buttonStyle(PressableStyle())
                    }
                }
                .padding(.horizontal, 8)
            }
        }
        .frame(height: 56)
        .background(Color.black.opacity(0.25), in: .rect(cornerRadius: 12, style: .continuous))
    }

    private var trending: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Trending coins", systemImage: "flame.fill").font(.system(size: 17, weight: .heavy)).foregroundStyle(Theme.foreground)
                Spacer()
                Eyebrow("Observed move · 24h")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(store.trending.prefix(8)) { coin in
                        NavigationLink(value: Route.token(coin.token)) { TrendingTile(coin: coin) }.buttonStyle(PressableStyle())
                    }
                }
            }
            Text("Ranked by price move since the first snapshot within the last 24 hours, exactly as the website's Gainers sort. Stale quotes are excluded.")
                .font(.system(size: 10)).foregroundStyle(Theme.muted)
        }
    }

    private var market: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("The market").font(.system(size: 20, weight: .heavy)).tracking(-0.6)
                Eyebrow("live discovery")
                Spacer()
                if store.isRefreshing { ProgressView().controlSize(.mini) }
                Eyebrow(store.lastUpdated.map { "updated \(Format.timeAgo($0))" } ?? "connecting")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(MarketSort.allCases) { s in
                        Button { withAnimation(.snappy) { sort = s }; Haptics.light() } label: {
                            Text(s.rawValue).font(.system(size: 12, weight: .bold))
                                .padding(.horizontal, 12).frame(height: 34)
                                .background(sort == s ? Theme.foreground : Color.clear, in: .rect(cornerRadius: 8, style: .continuous))
                                .foregroundStyle(sort == s ? Theme.background : Theme.muted)
                        }
                    }
                }
            }
            if store.terminal == nil, let err = store.lastError {
                ErrorState(message: err) { Task { await store.refresh() } }
            } else if store.terminal == nil {
                ForEach(0..<3, id: \.self) { _ in SkeletonCard(height: 176) }
            } else if filtered.isEmpty {
                EmptyState(title: query.isEmpty ? "The next launch starts here." : "No matching coins", body: query.isEmpty ? "Confirmed Casepad launches appear here automatically. No demo balances or invented activity." : "Try another ticker or contract address.")
            } else {
                ForEach(filtered) { coin in
                    NavigationLink(value: Route.token(coin.token)) { CoinCard(coin: coin) }.buttonStyle(PressableStyle())
                }
            }
            Text("Price movement is measured since the first available snapshot within the last 24 hours, not an assumed 24-hour return. Volume covers indexed curve trades.")
                .font(.system(size: 10)).foregroundStyle(Theme.muted)
        }
    }

    private var onTheTape: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Text("On the tape").font(.system(size: 17, weight: .bold)); Spacer(); Eyebrow("confirmed chain activity") }
            VStack(spacing: 0) {
                let items = Array(store.chainActivity.prefix(12))
                if items.isEmpty { Text("No confirmed Casepad transactions yet.").font(.system(size: 13)).foregroundStyle(Theme.muted).padding(.vertical, 24).frame(maxWidth: .infinity) }
                ForEach(items) { TapeRow(item: $0); Divider().overlay(Theme.border) }
            }
            .padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12, style: .continuous))
        }
    }
}

struct TrendingTile: View {
    let coin: Coin
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                CoinImage(image: coin.image, ticker: coin.ticker, size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text(coin.name).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    Text("$\(coin.ticker)").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                }
            }
            HStack {
                Text(Format.bps(coin.market?.changeBps)).font(.system(size: 15, weight: .bold, design: .monospaced)).foregroundStyle(Theme.up)
                Spacer()
                Text(coin.market?.marketCapUsd.map { Format.usd($0, compact: true) } ?? "—").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
            }
        }
        .padding(12).frame(width: 178)
        .background(Theme.card, in: .rect(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.gold.opacity(0.25)))
    }
}

/// Website `CoinCard`.
struct CoinCard: View {
    let coin: Coin
    var body: some View {
        let m = coin.market
        let change = m?.changeBps
        let rising = !(m?.stale ?? true) && (change ?? 0) > 0
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                CoinImage(image: coin.image, ticker: coin.ticker)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(coin.name).font(.system(size: 15, weight: .bold)).lineLimit(1)
                        if rising { Image(systemName: "flame.fill").font(.system(size: 11)).foregroundStyle(Theme.gold) }
                        ModeBadge(mode: coin.mode)
                    }
                    HStack(spacing: 6) { Text("$\(coin.ticker)"); Text("/").foregroundStyle(.white.opacity(0.2)); Text(Format.timeAgo(coin.createdAt)) }
                        .font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                }
                Spacer()
            }
            Text(coin.description.isEmpty ? "Pons V2 launch. Open the market to view trades and this coin's treasury." : coin.description)
                .font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(2).frame(minHeight: 32, alignment: .top)
            HStack {
                StatCell(label: "Market cap", value: m?.marketCapUsd.map { Format.usd($0, compact: true) } ?? (m?.graduated == true ? "Graduated" : "Unavailable"))
                StatCell(label: "Observed move", value: change.map { Format.pct(Double($0) / 100) } ?? "—", tint: rising ? Theme.up : (change ?? 0) < 0 ? Theme.down : Theme.muted, alignTrailing: true)
            }
            VStack(spacing: 6) {
                HStack {
                    Text("VOL \(m.map { Format.eth($0.volumeWei, digits: 3) } ?? "—")")
                    Spacer()
                    Text(m?.stale == true ? "STALE" : "PONS V2")
                }.font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                ProgressBar(value: Double(m?.progressBps ?? 0) / 10_000)
                HStack {
                    Text(Format.shortAddress(coin.token)).font(.system(size: 10, design: .monospaced))
                    Spacer()
                    Text("\(coin.reference?.symbol ?? "ETH") · \(m.map { String(format: "%.1f%%", Double($0.progressBps) / 100) } ?? "—") curve").font(.system(size: 10))
                }.foregroundStyle(Theme.muted)
            }
        }
        .padding(16).background(Theme.card, in: .rect(cornerRadius: 12, style: .continuous))
        .contentShape(.rect)
    }
}
