import SwiftUI
import Charts

struct MarketView: View {
    @Environment(AppStore.self) private var store
    @Environment(Router.self) private var router
    @State private var sort: MarketSort = .trending
    @State private var query: String = ""
    @State private var pairFilter: String = "all"

    enum MarketSort: String, CaseIterable { case trending = "Trending", new = "New", mcap = "Market cap", volume = "Volume", watch = "Watchlist" }

    private var list: [ObjectCoin] {
        var l = store.coins
        if !query.isEmpty { l = l.filter { "\($0.name) \($0.symbol) \($0.objectName ?? "") \($0.pair?.symbol ?? "")".localizedStandardContains(query) } }
        switch pairFilter { case "all": break; case "stocks": l = l.filter { $0.pair != nil }; case "eth": l = l.filter { $0.pair == nil }; default: l = l.filter { $0.pair?.address.lowercased() == pairFilter } }
        switch sort {
        case .trending: return l.sorted { $0.trending > $1.trending }
        case .new: return l.sorted { $0.launchedAt > $1.launchedAt }
        case .mcap: return l.sorted { $0.marketCapEth > $1.marketCapEth }
        case .volume: return l.sorted { $0.volume24hEth > $1.volume24hEth }
        case .watch: return l.filter { store.watchlist.contains($0.id) }
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12, pinnedViews: [.sectionHeaders]) {
                VStack(alignment: .leading, spacing: 14) {
                    Lab("Robinhood Chain · live")
                    Display("Market", size: 42)
                    HStack(spacing: 8) {
                        StatTile(label: "Coins", value: "\(store.coins.count)", glass: "glass_coins")
                        StatTile(label: "24h volume", value: Fmt.value(store.coins.reduce(0) { $0 + $1.volume24hEth }, store.ethUsd), glass: "glass_chart")
                    }
                    if !store.recent.isEmpty { TradeTicker(trades: Array(store.recent.prefix(14)), coins: store.coins, ethUsd: store.ethUsd) }
                }
                .enter()
                Section {
                    if let err = store.coinsError { ErrorBanner(message: err) }
                    else if !store.loaded { ForEach(0..<6, id: \.self) { _ in Shimmer().frame(height: 76).clipShape(RoundedRectangle(cornerRadius: 22)) } }
                    else if list.isEmpty { Text(sort == .watch ? "Tap the star on any coin to watch it." : "No coins match.").font(Typeface.sans(14, 650)).foregroundStyle(Pad.muted).padding(.top, 30) }
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, c in
                        Button { router.push(.coin(c.id)) } label: { CoinRow(coin: c, rank: i + 1, ethUsd: store.ethUsd) }
                            .buttonStyle(.press).enter(Double(min(i, 8)) * 0.04)
                    }
                } header: {
                    VStack(spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass").foregroundStyle(Pad.muted)
                            TextField("Search objects", text: $query).font(Typeface.sans(15, 650)).autocorrectionDisabled()
                        }
                        .padding(.horizontal, 14).frame(height: 44).glass(Capsule())
                        ScrollView(.horizontal) { HStack(spacing: 6) { ForEach(MarketSort.allCases, id: \.self) { s in Pill(title: s.rawValue, icon: s == .watch ? "star.fill" : nil, on: sort == s) { withAnimation(.snappy) { sort = s } } } } }
                            .scrollIndicators(.hidden)
                        pairChips
                    }
                    .padding(.vertical, 8)
                    .background(Pad.paper.opacity(0.92))
                }
                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.refreshCoins() }
        .toolbar(.hidden, for: .navigationBar)
    }
}

extension MarketView {
    /// V2: filter the market by what coins are paired with.
    var pairChips: some View {
        let counts = Dictionary(grouping: store.coins.compactMap(\.pair), by: { $0.address.lowercased() })
        let pairs = counts.values.compactMap(\.first).sorted { (counts[$0.address.lowercased()]?.count ?? 0) > (counts[$1.address.lowercased()]?.count ?? 0) }
        return ScrollView(.horizontal) {
            HStack(spacing: 6) {
                Text("V2").font(Typeface.mono(9.5, 900)).foregroundStyle(Color(hex: 0x3A2A05)).padding(.horizontal, 6).frame(height: 18).background(Capsule().fill(Pad.goldGradient))
                ForEach([("all", "All pairs"), ("stocks", "Any stock"), ("eth", "ETH")], id: \.0) { f in Pill(title: f.1, on: pairFilter == f.0) { withAnimation(.snappy) { pairFilter = f.0 } } }
                ForEach(pairs, id: \.address) { p in
                    Button { Feedback.selection(); withAnimation(.snappy) { pairFilter = p.address.lowercased() } } label: {
                        HStack(spacing: 5) { CoinAvatar(url: p.logo, symbol: p.symbol, size: 22); Text(p.symbol).font(Typeface.sans(13, 800)); Text("\(counts[p.address.lowercased()]?.count ?? 0)").font(Typeface.mono(11, 700)).opacity(0.6) }
                            .foregroundStyle(pairFilter == p.address.lowercased() ? .white : Pad.ink)
                            .padding(.leading, 4).padding(.trailing, 12).frame(height: 38)
                            .background(Capsule().fill(pairFilter == p.address.lowercased() ? Pad.ink : .white))
                    }
                    .buttonStyle(.quiet)
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}

struct TradeTicker: View {
    let trades: [CoinTrade]
    let coins: [ObjectCoin]
    let ethUsd: Double?
    @State private var offset: CGFloat = 0
    var body: some View {
        GeometryReader { _ in
            HStack(spacing: 18) {
                ForEach(Array((trades + trades).enumerated()), id: \.offset) { _, t in
                    let sym = coins.first { $0.curve.lowercased() == t.curve.lowercased() }?.symbol ?? "COIN"
                    HStack(spacing: 5) {
                        Circle().fill(t.side == "buy" ? Pad.up : Pad.down).frame(width: 6, height: 6)
                        Text("\(t.side.uppercased()) $\(sym) · \(Fmt.value(t.eth, ethUsd))").font(Typeface.mono(11, 800)).foregroundStyle(Pad.ink.opacity(0.7))
                    }
                    .fixedSize()
                }
            }
            .offset(x: offset)
            .onAppear { withAnimation(.linear(duration: Double(trades.count) * 3.2).repeatForever(autoreverses: false)) { offset = -CGFloat(trades.count) * 190 } }
        }
        .frame(height: 34).padding(.horizontal, 12).clipped().sunk(14)
    }
}

struct CoinRow: View {
    let coin: ObjectCoin
    let rank: Int
    let ethUsd: Double?
    var body: some View {
        HStack(spacing: 12) {
            Text("\(rank)").font(Typeface.mono(11, 800)).foregroundStyle(Pad.muted).frame(width: 20)
            CoinAvatar(url: coin.logo, symbol: coin.symbol, size: 50)
            VStack(alignment: .leading, spacing: 3) {
                Text(coin.name).font(Typeface.sans(15, 800)).foregroundStyle(Pad.ink).lineLimit(1)
                HStack(spacing: 6) {
                    Text("$\(coin.symbol) · \(coin.holders) holders").font(Typeface.mono(10.5, 700)).foregroundStyle(Pad.muted).lineLimit(1)
                    if let p = coin.pair { PairBadge(pair: p) }
                }
            }
            Spacer(minLength: 6)
            Sparkline(points: coin.spark, up: coin.change24h >= 0).frame(width: 52, height: 24)
            VStack(alignment: .trailing, spacing: 3) {
                Text(Fmt.value(coin.marketCapEth, ethUsd)).font(Typeface.sans(14, 800)).foregroundStyle(Pad.ink)
                Text(Fmt.pct(coin.change24h)).font(Typeface.mono(11, 800)).foregroundStyle(coin.change24h >= 0 ? Pad.up : Pad.down)
            }
        }
        .padding(12).raised(22)
    }
}

// MARK: - Coin detail

struct CoinDetailView: View {
    let id: String
    @Environment(AppStore.self) private var store
    @Environment(AccountStore.self) private var account
    @State private var record: ObjectRecord?
    @State private var curve: CurveState?
    @State private var trades: [CoinTrade] = []
    @State private var holders: HoldersFeed?
    @State private var trading: Bool = false
    @State private var side: String = "buy"
    @State private var model3D: Bool = false

    private var coin: ObjectCoin? { store.coin(id) }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let c = coin {
                    header(c).enter()
                    chart.enter(0.05)
                    tradeButtons.enter(0.1)
                    stats(c).enter(0.15)
                    if let r = record { story(r).enter(0.2) }
                    tradesList.enter(0.25)
                    holdersList.enter(0.3)
                } else if store.loaded {
                    ContentUnavailableView("Coin not found", systemImage: "questionmark.circle", description: Text("It may still be launching. Pull to refresh."))
                } else { ProgressView().padding(.top, 80) }
                Color.clear.frame(height: 100)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .background(Pad.page.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let c = coin {
                ToolbarItem(placement: .principal) { Text("$\(c.symbol)").font(Typeface.sans(16, 800)) }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { store.toggleWatch(c.id) } label: { Image(systemName: store.watchlist.contains(c.id) ? "star.fill" : "star").foregroundStyle(store.watchlist.contains(c.id) ? Pad.gold : Pad.ink) }
                    ShareLink(item: URL(string: "https://www.objectpad.fun\(c.path.isEmpty ? "/objects/\(c.id)" : c.path)")!) { Image(systemName: "square.and.arrow.up") }
                }
            }
        }
        .task(id: id) { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $trading) { if let c = coin { TradeSheet(coin: c, initialSide: side, curve: curve) { Task { await load(); await store.refreshHoldings() } }.presentationDetents([.large]).presentationCornerRadius(34) } }
        .fullScreenCover(isPresented: $model3D) { if let url = record?.model?.modelUrl, !url.isEmpty { ModelViewerSheet(url: url, title: coin?.name ?? "") } }
    }

    private func load() async {
        guard let c = coin ?? store.coins.first(where: { $0.id == id }) else { await store.refreshCoins(); return }
        async let r = try? ObjectPadApi.record(c.id)
        async let cs = try? ChainClient.shared.curve(c.curve)
        async let t = try? ObjectPadApi.trades(c.curve)
        async let h = try? ObjectPadApi.holders(c.curve)
        let (rv, cv, tv, hv) = await (r, cs, t, h)
        withAnimation(.snappy) { record = rv; curve = cv; trades = tv?.trades.sorted { $0.at > $1.at } ?? []; holders = hv }
    }

    private func header(_ c: ObjectCoin) -> some View {
        VStack(spacing: 14) {
            ZStack {
                Pad.skyGradient
                CloudDrift().opacity(0.6)
                Color.clear.overlay { RemoteImage(url: URL(string: record?.model?.thumbnailUrl ?? c.logo), fallback: c.symbol).allowsHitTesting(false) }
                    .frame(width: 190, height: 190).clipShape(RoundedRectangle(cornerRadius: 40, style: .continuous)).shadow(color: .black.opacity(0.2), radius: 20, y: 12).modifier(Bob())
                if record?.model?.modelUrl.isEmpty == false {
                    Button { model3D = true } label: { Label("View in 3D", systemImage: "cube.transparent").font(Typeface.sans(13, 800)).foregroundStyle(Pad.ink).padding(.horizontal, 14).padding(.vertical, 9).glass(Capsule(), interactive: true) }
                        .buttonStyle(.press).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing).padding(14)
                }
            }
            .frame(height: 280).clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.name).font(Typeface.sans(15, 750)).foregroundStyle(Pad.muted)
                    if let p = c.pair { HStack(spacing: 6) { PairBadge(pair: p, showChange: true); if let u = p.priceUsd { Text("\(p.name) · \(Fmt.usd(u))").font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted).lineLimit(1) } } }
                    RollingText(text: Fmt.price(curve?.priceEth ?? c.priceEth, store.ethUsd), font: Typeface.display(36))
                }
                Spacer()
                Text(Fmt.pct(c.change24h)).font(Typeface.mono(14, 800)).foregroundStyle(.white).padding(.horizontal, 10).padding(.vertical, 6).background(Capsule().fill(c.change24h >= 0 ? Pad.up : Pad.down))
            }
        }
    }

    private var chart: some View {
        let pts = trades.filter { $0.price > 0 }.sorted { $0.at < $1.at }
        return VStack(alignment: .leading, spacing: 8) {
            if pts.count >= 2 {
                Chart(pts) { t in
                    AreaMark(x: .value("Time", Date(timeIntervalSince1970: t.at / 1000)), y: .value("Price", t.price)).foregroundStyle(LinearGradient(colors: [Pad.sky.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom)).interpolationMethod(.monotone)
                    LineMark(x: .value("Time", Date(timeIntervalSince1970: t.at / 1000)), y: .value("Price", t.price)).foregroundStyle(Pad.sky).lineStyle(StrokeStyle(lineWidth: 2.4)).interpolationMethod(.monotone)
                }
                .chartYAxis(.hidden).chartXAxis(.hidden).frame(height: 170)
            } else {
                Text("The chart fills in as trades land.").font(Typeface.sans(13, 650)).foregroundStyle(Pad.muted).frame(maxWidth: .infinity, minHeight: 120)
            }
            if let curve {
                HStack { Lab(curve.graduated ? "Graduated to DEX" : "Bonding curve"); Spacer(); Text("\(Int(curve.progress * 100))%").font(Typeface.mono(11, 800)) }
                ProgressBar(value: curve.progress, color: curve.graduated ? Pad.up : Pad.sky)
            }
        }
        .padding(16).raised(26)
    }

    private var tradeButtons: some View {
        HStack(spacing: 10) {
            PadButton(title: "Buy", icon: "arrow.down.circle.fill", kind: .up) { side = "buy"; trading = true }
            PadButton(title: "Sell", icon: "arrow.up.circle.fill", kind: .down) { side = "sell"; trading = true }
        }
    }

    private func stats(_ c: ObjectCoin) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            StatTile(label: "Market cap", value: Fmt.value(curve?.marketCapEth ?? c.marketCapEth, store.ethUsd))
            StatTile(label: "24h volume", value: Fmt.value(c.volume24hEth, store.ethUsd))
            StatTile(label: "Holders", value: "\(holders?.count ?? c.holders)")
            StatTile(label: "Trades", value: "\(c.trades)")
        }
    }

    private func story(_ r: ObjectRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Lab("The object")
            Text(r.story).font(Typeface.sans(15, 600)).foregroundStyle(Pad.ink.opacity(0.8))
            HStack(spacing: 8) {
                chip("checkmark.seal.fill", "\(r.acceptedViewCount) verified angles")
                if let m = r.model, m.triangles > 0 { chip("cube", "\(Fmt.compact(Double(m.triangles))) tris") }
            }
            Divider()
            linkRow("Token", r.tokenAddress, Chain.tokenURL(r.tokenAddress))
            if !r.launchTransactionHash.isEmpty { linkRow("Launch tx", r.launchTransactionHash, Chain.txURL(r.launchTransactionHash)) }
            if !r.creatorWallet.isEmpty { linkRow("Creator", r.creatorWallet, Chain.addressURL(r.creatorWallet)) }
        }
        .padding(16).raised(26)
    }

    private func chip(_ icon: String, _ text: String) -> some View {
        Label(text, systemImage: icon).font(Typeface.sans(12, 750)).foregroundStyle(Pad.ink.opacity(0.75)).padding(.horizontal, 10).padding(.vertical, 6).sunk(12)
    }

    private func linkRow(_ label: String, _ value: String, _ url: URL) -> some View {
        Link(destination: url) {
            HStack { Text(label).font(Typeface.sans(13, 700)).foregroundStyle(Pad.muted); Spacer(); Text(Fmt.short(value, lead: 8, tail: 6)).font(Typeface.mono(12, 700)).foregroundStyle(Pad.ink); Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Pad.muted) }
        }
    }

    private var tradesList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Lab("Latest trades")
            if trades.isEmpty { Text("No trades yet. Be the first.").font(Typeface.sans(13, 650)).foregroundStyle(Pad.muted) }
            ForEach(trades.prefix(12)) { t in
                Link(destination: Chain.txURL(t.hash)) {
                    HStack {
                        Text(t.side.uppercased()).font(Typeface.mono(10.5, 800)).foregroundStyle(.white).frame(width: 44, height: 22).background(Capsule().fill(t.side == "buy" ? Pad.up : Pad.down))
                        Text(Fmt.short(t.trader)).font(Typeface.mono(12, 700)).foregroundStyle(Pad.ink)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) { Text(Fmt.value(t.eth, store.ethUsd)).font(Typeface.sans(13, 800)).foregroundStyle(Pad.ink); Text(Fmt.ago(t.at)).font(Typeface.mono(10, 600)).foregroundStyle(Pad.muted) }
                    }
                }
            }
        }
        .padding(16).raised(26)
    }

    private var holdersList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Lab("Top holders")
            ForEach(Array((holders?.holders ?? []).prefix(8).enumerated()), id: \.offset) { i, h in
                HStack {
                    Text("\(i + 1)").font(Typeface.mono(11, 800)).foregroundStyle(Pad.muted).frame(width: 18)
                    Text(h.label ?? Fmt.short(h.address)).font(Typeface.mono(12, 700))
                    Spacer()
                    Text(String(format: "%.2f%%", h.share * (h.share <= 1 ? 100 : 1))).font(Typeface.sans(13, 800))
                }
            }
            if holders?.holders.isEmpty ?? true { Text("Loading holders…").font(Typeface.sans(13, 650)).foregroundStyle(Pad.muted) }
        }
        .padding(16).raised(26)
    }
}

// MARK: - Trade sheet

struct TradeSheet: View {
    let coin: ObjectCoin
    let initialSide: String
    let curve: CurveState?
    let onDone: () -> Void
    @Environment(AccountStore.self) private var account
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var side: String = "buy"
    @State private var amount: String = ""
    @State private var quote: BigUInt?
    @State private var ethBal: BigUInt?
    @State private var tokenBal: BigUInt?
    @State private var slippage: UInt32 = 300
    @State private var busy: String?
    @State private var error: String?
    @State private var hash: String?
    @State private var done: Bool = false

    private var units: BigUInt? { BigUInt.parse(amount) }

    var body: some View {
        VStack(spacing: 16) {
            Capsule().fill(Pad.ink.opacity(0.15)).frame(width: 40, height: 5).padding(.top, 8)
            HStack(spacing: 12) {
                CoinAvatar(url: coin.logo, symbol: coin.symbol, size: 46)
                VStack(alignment: .leading) { Text("$\(coin.symbol)").font(Typeface.sans(18, 800)); Text(Fmt.price(curve?.priceEth ?? coin.priceEth, store.ethUsd)).font(Typeface.mono(12, 700)).foregroundStyle(Pad.muted) }
                Spacer()
            }
            if let p = coin.pair {
                HStack(spacing: 8) { CoinAvatar(url: p.logo, symbol: p.symbol, size: 24); VStack(alignment: .leading, spacing: 1) { Text("Paired with \(p.symbol)").font(Typeface.sans(13, 800)); Text(side == "buy" ? "Pay with ETH · routed on-chain into \(p.symbol) (3 confirmations)" : "Sells pay out in \(p.symbol)").font(Typeface.sans(11.5, 600)).foregroundStyle(Pad.muted) }; Spacer() }
                    .padding(10).background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: 0xFFF8E6))).overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Pad.gold.opacity(0.5), lineWidth: 1))
            }
            InkSegmented(options: [("buy", "Buy"), ("sell", "Sell")], selection: $side)
            if done {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 64)).foregroundStyle(Pad.up).symbolEffect(.bounce, value: done)
                    Display(side == "buy" ? "Bought." : "Sold.", size: 34)
                    if let hash { Link("View on Blockscout", destination: Chain.txURL(hash)).font(Typeface.sans(14, 800)) }
                    PadButton(title: "Done") { dismiss() }
                }
                .frame(maxHeight: .infinity).overlay(ConfettiBurst())
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Lab(side == "buy" ? "You pay (ETH)" : "You sell ($\(coin.symbol))"); Spacer()
                        Button("Max") { amount = side == "buy" ? (ethBal.map { ($0 - BigUInt(3_000_000_000_000_000)).formatUnits(digits: 6) } ?? "") : (tokenBal?.formatUnits(digits: 4) ?? "") }.font(Typeface.mono(11, 800))
                    }
                    TextField("0.0", text: $amount).font(Typeface.display(46)).keyboardType(.decimalPad).minimumScaleFactor(0.5)
                    Text("Balance: \(side == "buy" ? (ethBal.map { "\($0.formatUnits(digits: 5)) ETH" } ?? "…") : (tokenBal.map { "\($0.formatUnits(digits: 2)) \(coin.symbol)" } ?? "…"))").font(Typeface.mono(11.5, 700)).foregroundStyle(Pad.muted)
                    HStack(spacing: 6) { ForEach(side == "buy" ? ["0.001", "0.005", "0.01", "0.05"] : [], id: \.self) { v in Pill(title: v, on: amount == v) { amount = v } } }
                }
                .padding(16).raised(24)
                VStack(spacing: 8) {
                    HStack { Text("You receive ≈").font(Typeface.sans(13, 700)).foregroundStyle(Pad.muted); Spacer(); Text(quote.map { side == "buy" ? "\(Fmt.compact($0.toDouble())) \(coin.symbol)" : "\($0.formatUnits(digits: 6)) ETH" } ?? "—").font(Typeface.sans(15, 800)).contentTransition(.numericText()) }
                    HStack { Text("Slippage").font(Typeface.sans(13, 700)).foregroundStyle(Pad.muted); Spacer(); ForEach([UInt32(100), 300, 500], id: \.self) { v in Pill(title: "\(v / 100)%", on: slippage == v) { slippage = v } } }
                }
                .padding(14).sunk(20)
                if let error { ErrorBanner(message: error) }
                Spacer()
                Text("Signed on \(account.signedIn ? "your account wallet" : "this iPhone’s wallet") · 1.5% creator tax + 1% curve fee").font(Typeface.sans(11.5, 600)).foregroundStyle(Pad.muted).multilineTextAlignment(.center)
                PadButton(title: busy ?? (side == "buy" ? "Buy $\(coin.symbol)" : "Sell $\(coin.symbol)"), kind: side == "buy" ? .up : .down, busy: busy != nil, enabled: units != nil && quote != nil) { Task { await trade() } }
            }
        }
        .padding(.horizontal, 18).padding(.bottom, 12)
        .background(Pad.page.ignoresSafeArea())
        .onAppear { side = initialSide }
        .task { await balances() }
        .task(id: "\(side)-\(amount)") { await requote() }
    }

    /// Stock-paired buy: swap ETH → pair asset on Uniswap V3, approve the curve, then buy. Each step is quoted on-chain first.
    private func pairedBuy(signer: WalletSigner, pair: CoinPair, ethIn: BigUInt) async throws {
        guard let q = store.pair(pair.address), let route = q.route else { throw ChainError.message("No on-chain ETH route to \(pair.symbol) right now.") }
        let c = ChainClient.shared; let router = store.pairs?.router?.swapRouter ?? PairTrade.fallbackRouter
        busy = "Quoting…"
        let quoted = try await PairTrade.quoteSwap(route, ethIn: ethIn, quoter: store.pairs?.router?.quoter)
        let before = try await c.tokenBalance(pair.address, owner: signer.address)
        busy = "1/3 Swapping ETH → \(pair.symbol)…"
        let h1 = try await signer.send(TxRequest(to: router, data: PairTrade.swapData(route, recipient: signer.address, amountIn: ethIn, minOut: quoted.scaled(10_000 - slippage, 10_000)), value: ethIn))
        try await c.waitForReceipt(h1)
        let received = try await c.tokenBalance(pair.address, owner: signer.address) - before
        guard !received.isZero else { throw ChainError.message("The swap to \(pair.symbol) returned nothing.") }
        if try await c.allowance(pair.address, owner: signer.address, spender: coin.curve) < received {
            busy = "2/3 Approving \(pair.symbol)…"
            let h2 = try await signer.send(TxRequest(to: pair.address, data: Abi.approveData(coin.curve, received)))
            try await c.waitForReceipt(h2)
        }
        let expected = try await PairTrade.curveBuy(curve: coin.curve, quoteIn: received)
        let minimum = expected.scaled(10_000 - slippage, 10_000)
        guard !minimum.isZero else { throw ChainError.message("The curve would return nothing for this amount.") }
        busy = "3/3 Buying $\(coin.symbol)…"
        let h3 = try await signer.send(TxRequest(to: coin.curve, data: Abi.buyData(received, minimum, signer.address)))
        hash = h3; try await c.waitForReceipt(h3)
        Feedback.success(.coins)
        withAnimation(.spring) { done = true }
        busy = nil
        onDone()
    }

    private func balances() async {
        guard let w = try? account.signer().address else { return }
        ethBal = try? await ChainClient.shared.balance(w)
        tokenBal = try? await ChainClient.shared.tokenBalance(coin.token, owner: w)
    }

    private func requote() async {
        quote = nil
        guard let u = units else { return }
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        if side == "buy", let p = coin.pair, let q = store.pair(p.address), let r = q.route {
            if let out = try? await PairTrade.quoteSwap(r, ethIn: u, quoter: store.pairs?.router?.quoter) { quote = try? await PairTrade.curveBuy(curve: coin.curve, quoteIn: out) }
        }
        else if side == "buy" { quote = try? await ChainClient.shared.quoteBuy(curve: coin.curve, quoteIn: u) }
        else if let w = try? account.signer().address { quote = try? await ChainClient.shared.quoteSell(curve: coin.curve, seller: w, tokensIn: u) }
    }

    private func trade() async {
        guard let u = units else { return }
        error = nil
        do {
            let signer = try account.signer()
            if side == "buy", let p = coin.pair { try await pairedBuy(signer: signer, pair: p, ethIn: u); return }
            busy = "Quoting…"
            let expected = side == "buy" ? try await ChainClient.shared.quoteBuy(curve: coin.curve, quoteIn: u) : try await ChainClient.shared.quoteSell(curve: coin.curve, seller: signer.address, tokensIn: u)
            let minimum = expected.scaled(10_000 - slippage, 10_000)
            guard !minimum.isZero else { throw ChainError.message("The curve would return nothing for this amount.") }
            if side == "sell", try await ChainClient.shared.allowance(coin.token, owner: signer.address, spender: coin.curve) < u {
                busy = "Approving…"
                let h = try await signer.send(TxRequest(to: coin.token, data: Abi.approveData(coin.curve, u)))
                try await ChainClient.shared.waitForReceipt(h)
            }
            busy = side == "buy" ? "Buying…" : "Selling…"
            let data = side == "buy" ? Abi.buyData(u, minimum, signer.address) : Abi.sellData(u, minimum, signer.address)
            let h = try await signer.send(TxRequest(to: coin.curve, data: data, value: side == "buy" ? u : .zero))
            hash = h; busy = "Confirming…"
            try await ChainClient.shared.waitForReceipt(h)
            Feedback.success(.coins)
            withAnimation(.spring) { done = true }
            onDone()
        } catch {
            self.error = error.localizedDescription.components(separatedBy: "\n").first
            Feedback.error()
        }
        busy = nil
    }
}
