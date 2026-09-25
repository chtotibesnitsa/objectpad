import SwiftUI

/// Coin page: live market, chart, treasury/inventory, cases, trades, holders, activity.
struct TokenDetailView: View {
    let token: String
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var model: TokenViewModel
    @State private var range: ChartRange = .all
    @State private var tab: Tab = .trades

    enum Tab: String, CaseIterable { case trades = "Trades", holders = "Holders", activity = "Activity", cases = "Cases" }

    init(token: String) {
        self.token = token
        _model = State(initialValue: TokenViewModel(token: token))
    }

    var body: some View {
        ScrollView {
            if model.notFound {
                EmptyState(title: "Unknown token", body: "\(Format.shortAddress(token)) is not registered on Casepad. Tokens launched here appear after their launch transaction is recorded.", systemImage: "questionmark.circle").padding(16)
            } else if let coin = model.coin {
                content(coin)
            } else if let err = model.error {
                ErrorState(message: err) { Task { await model.refresh() } }.padding(16)
            } else {
                VStack(spacing: 12) { SkeletonCard(height: 90); SkeletonCard(height: 260); SkeletonCard(height: 160) }.padding(16)
            }
        }
        .background(Theme.background)
        .navigationTitle(model.coin.map { "$\($0.ticker)" } ?? "Coin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { store.copy(token, label: "Contract") } label: { Label("Copy contract", systemImage: "doc.on.doc") }
                    Button { openURL(Chain.tokenURL(token)) } label: { Label("View on Blockscout", systemImage: "arrow.up.right.square") }
                    ShareLink(item: store.casepadCA.isEmpty ? URL(string: "https://casepad.fun")! : URL(string: "https://casepad.fun/token/\(token)")!) { Label("Share coin page", systemImage: "square.and.arrow.up") }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .refreshable { await model.refresh() }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }

    @ViewBuilder
    private func content(_ coin: Coin) -> some View {
        let curve = model.curve
        let priceUsd = (curve?.priceEth ?? 0) * store.ethUsd
        let mcapUsd = (curve?.mcapEth ?? 0) * store.ethUsd
        VStack(alignment: .leading, spacing: 16) {
            header(coin)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Eyebrow(curve?.graduated == true ? "Graduated · pool price needs a market adapter" : "Live curve price")
                    Spacer()
                    Picker("Range", selection: $range) { ForEach(ChartRange.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented).frame(width: 190)
                }
                if model.historyLoading && model.trades.isEmpty {
                    HStack { ProgressView().controlSize(.small); Text("Reading Robinhood Chain...").font(.system(size: 12)).foregroundStyle(Theme.muted) }.frame(height: 200).frame(maxWidth: .infinity)
                } else {
                    PriceChart(points: model.points(ethUsd: store.ethUsd), range: range, markers: model.markers)
                }
                HStack {
                    StatCell(label: "Price", value: Format.usd(priceUsd))
                    StatCell(label: "Market cap", value: curve?.graduated == true ? "Graduated" : Format.usd(mcapUsd, compact: true))
                    StatCell(label: "Curve", value: curve.map { String(format: "%.1f%%", $0.progress * 100) } ?? "—", alignTrailing: true)
                }
                ProgressBar(value: curve?.progress ?? 0)
                HStack {
                    StatCell(label: "Reserve", value: curve.map { Format.eth(String(Int64($0.reserveEth * 1e6)) + "000000000000", digits: 4) } ?? "—")
                    StatCell(label: "Sold", value: curve.map { Format.tokens($0.sold) } ?? "—")
                    StatCell(label: "Supply", value: "1B", alignTrailing: true)
                }
            }
            .card(padding: 14, raised: true)

            treasury(coin)
            actions(coin)

            Picker("Section", selection: $tab) { ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
            switch tab {
            case .trades: trades
            case .holders: holders
            case .activity: activity
            case .cases: cases(coin)
            }
        }
        .padding(16)
    }

    private func header(_ coin: Coin) -> some View {
        HStack(spacing: 12) {
            CoinImage(image: coin.image, ticker: coin.ticker, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) { Text(coin.name).font(.system(size: 22, weight: .heavy)).lineLimit(1); ModeBadge(mode: coin.mode) }
                HStack(spacing: 8) {
                    Text("$\(coin.ticker)").font(.system(size: 13, design: .monospaced)).foregroundStyle(Theme.muted)
                    Text("· \(Format.timeAgo(coin.createdAt))").font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
                HStack(spacing: 6) {
                    CopyChip(label: "CA", value: coin.token)
                    if !coin.website.isEmpty, let url = URL(string: coin.website) {
                        Button { openURL(url) } label: { Image(systemName: "globe").frame(width: 36, height: 36).background(Theme.secondary, in: .rect(cornerRadius: 8)) }
                    }
                }
            }
            Spacer()
        }
    }

    private func treasury(_ coin: Coin) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Eyebrow("This coin's treasury"); Spacer(); if let inv = model.inventory, let t = inv.treasury { Button { store.copy(t, label: "Treasury") } label: { Text(Format.shortAddress(t)).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) } } }
            HStack {
                StatCell(label: "Fees accrued", value: Format.eth(coin.vault.accruedWei, digits: 5))
                StatCell(label: "Coins held", value: Format.units(model.inventory?.heldUnits))
                StatCell(label: "Committed", value: Format.units(model.inventory?.committedUnits), alignTrailing: true)
            }
            HStack {
                StatCell(label: "Treasury ETH", value: Format.eth(model.inventory?.ethWei, digits: 5))
                StatCell(label: "Escrow", value: Format.eth(model.inventory?.escrowWei, digits: 5))
                StatCell(label: "Open rounds", value: "\(coin.vault.activeRounds)", alignTrailing: true)
            }
            if let ms = model.detail?.milestones, !ms.isEmpty {
                ForEach(ms) { m in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(m.label).font(.system(size: 11, weight: .semibold)); Spacer(); Text(m.reached ? "Reached" : Format.eth(m.targetWei, digits: 3)).font(.system(size: 10, design: .monospaced)).foregroundStyle(m.reached ? Theme.up : Theme.muted) }
                        ProgressBar(value: Double(m.progressBps) / 10_000, tint: Theme.gold)
                    }
                }
            }
            Text("Fees: \(Double(coin.creatorTaxBps) / 100, specifier: "%.1f")% Casepad on every trade → creator / case treasury / CASEPAD burn. Trading fee 1% Pons.")
                .font(.system(size: 10)).foregroundStyle(Theme.muted)
        }
        .card()
    }

    private func actions(_ coin: Coin) -> some View {
        VStack(spacing: 8) {
            NavigationLink(value: Route.wallet) {
                Label("Buy / sell needs a signing wallet", systemImage: "wallet.pass").frame(maxWidth: .infinity)
            }.buttonStyle(PrimaryButtonStyle())
            Text("Curve trades and burns are signed in MetaMask via the CasePad website (WalletConnect for native signing is the next slice). Nothing is submitted from this app without your signature.")
                .font(.system(size: 10)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }
    }

    private var trades: some View {
        VStack(spacing: 0) {
            if model.trades.isEmpty {
                Text(model.historyLoading ? "Reading chain..." : "No trades yet.").font(.system(size: 13)).foregroundStyle(Theme.muted).padding(.vertical, 24)
            }
            ForEach(model.trades.reversed().prefix(60)) { t in
                Button { openURL(Chain.txURL(t.txHash)) } label: {
                    HStack {
                        Text(t.isBuy ? "BUY" : "SELL").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(t.isBuy ? Theme.up : Theme.down).frame(width: 40, alignment: .leading)
                        Text(Format.shortAddress(t.sender)).font(.system(size: 11, design: .monospaced))
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Format.eth(String(Int64(t.eth * 1e9)) + "000000000", digits: 4)).font(.system(size: 12, weight: .semibold, design: .monospaced))
                            Text("\(Format.tokens(t.tokens)) tokens").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                        }
                        Text(Format.timeAgo(t.timestamp)).font(.system(size: 10)).foregroundStyle(Theme.muted).frame(width: 52, alignment: .trailing)
                    }
                    .padding(.vertical, 9).foregroundStyle(Theme.foreground)
                }
                Divider().overlay(Theme.border)
            }
        }
        .padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
    }

    private var holders: some View {
        let list = model.holders()
        return VStack(spacing: 0) {
            if list.isEmpty { Text(model.historyLoading ? "Reading chain..." : "No holders found yet.").font(.system(size: 13)).foregroundStyle(Theme.muted).padding(.vertical, 24) }
            ForEach(Array(list.prefix(40).enumerated()), id: \.offset) { i, h in
                Button { openURL(Chain.addressURL(h.address)) } label: {
                    HStack {
                        Text(String(format: "%02d", i + 1)).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                        Text(Format.shortAddress(h.address)).font(.system(size: 12, design: .monospaced))
                        if h.address.lowercased() == model.coin?.creatorAddress.lowercased() { Text("CREATOR").font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(Theme.gold) }
                        Spacer()
                        Text(Format.tokens(h.tokens)).font(.system(size: 12, weight: .semibold, design: .monospaced))
                        Text(String(format: "%.2f%%", h.tokens / Chain.totalSupply * 100)).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted).frame(width: 52, alignment: .trailing)
                    }.padding(.vertical, 9).foregroundStyle(Theme.foreground)
                }
                Divider().overlay(Theme.border)
            }
            Text("Derived from indexed curve trades since launch; transfers outside the curve are not included.").font(.system(size: 9)).foregroundStyle(Theme.muted).padding(.vertical, 8)
        }
        .padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
    }

    private var activity: some View {
        VStack(spacing: 0) {
            let events = model.detail?.events ?? []
            if events.isEmpty { Text("No activity yet.").font(.system(size: 13)).foregroundStyle(Theme.muted).padding(.vertical, 24) }
            ForEach(events.prefix(40)) { e in
                HStack {
                    Text(e.kind.replacingOccurrences(of: ".", with: " ").uppercased()).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(e.kind.contains("sell") ? Theme.down : Theme.up)
                    Spacer()
                    if let a = e.payload.amountWei ?? e.payload.notionalWei { Text(Format.eth(a, digits: 4)).font(.system(size: 11, design: .monospaced)) }
                    if let h = e.payload.txHash { Button { openURL(Chain.txURL(h)) } label: { Image(systemName: "arrow.up.right.square").font(.system(size: 11)).foregroundStyle(Theme.muted) } }
                    Text(Format.timeAgo(e.createdAt)).font(.system(size: 10)).foregroundStyle(Theme.muted).frame(width: 52, alignment: .trailing)
                }.padding(.vertical, 9)
                Divider().overlay(Theme.border)
            }
        }
        .padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
    }

    private func cases(_ coin: Coin) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            let live = store.openCases?.live ?? false
            if !live {
                Label("Live cases are switched off by the operator right now. Cases are shown for review; no burn is requested until they are switched back on.", systemImage: "lock")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted).padding(12).background(Theme.secondary, in: .rect(cornerRadius: 10))
            }
            if let designs = model.designs {
                let all = designs.platform + designs.creator
                if all.isEmpty { EmptyState(title: "No cases published", body: designs.note) }
                ForEach(Array(all.sorted { (Wei.toDouble($0.entryUnits) ?? 0) < (Wei.toDouble($1.entryUnits) ?? 0) }.enumerated()), id: \.element.id) { i, d in
                    let round = model.rounds.first { $0.designId == d.id && $0.available > 0 }
                    CaseTileView(design: d, tier: min(i, 5), ticker: coin.ticker, round: round)
                }
            } else {
                SkeletonCard(height: 120)
            }
        }
    }
}

/// Website `CaseTile`: same carbon shell, colour escalates with tier.
struct CaseTileView: View {
    let design: CaseDesign
    let tier: Int
    let ticker: String
    let round: Round?
    private static let art = ["case_slate", "case_teal", "case_blue", "case_violet", "case_crimson", "case_gold"]
    private static let glow: [Color] = [Color(white: 0.6), Color(hue: 0.5, saturation: 0.5, brightness: 0.7), Theme.cobalt, Color(hue: 0.75, saturation: 0.6, brightness: 0.7), Theme.down, Theme.gold]

    var body: some View {
        let best = design.outcomes.map { Wei.toDouble($0.units) ?? 0 }.max() ?? 0
        let entry = Wei.toDouble(design.entryUnits) ?? 1
        HStack(spacing: 12) {
            Image(Self.art[tier]).resizable().scaledToFit().frame(width: 76, height: 76).shadow(color: Self.glow[tier].opacity(0.45), radius: 14)
            VStack(alignment: .leading, spacing: 4) {
                HStack { Text(design.name).font(.system(size: 14, weight: .bold)); Spacer(); Text(design.provenance.uppercased()).font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(Theme.muted) }
                Text("Burn \(Format.units(design.entryUnits)) $\(ticker)").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    Text("Win up to \(entry > 0 ? String(format: "%.0fx", best / entry) : "—")").font(.system(size: 11, weight: .bold)).foregroundStyle(Self.glow[tier])
                    Text("\(design.profitProbabilityBps / 100)% profit odds").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                }
                Text(round.map { "\($0.available) of \($0.entries) keys left · round \($0.id.suffix(6))" } ?? "No funded round open").font(.system(size: 10, design: .monospaced)).foregroundStyle(round == nil ? Theme.down.opacity(0.8) : Theme.up)
            }
        }
        .padding(12).background(Theme.card, in: .rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Self.glow[tier].opacity(0.25)))
    }
}
