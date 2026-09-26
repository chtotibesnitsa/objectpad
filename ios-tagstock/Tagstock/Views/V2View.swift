import SwiftUI
import AVKit

/// ObjectPad V2 release notes and developer log, opened from the gold V2 pill.
struct V2View: View {
    @Environment(AppStore.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    private let notes: [(String, String, String)] = [
        ("New", "Stock pairing at launch", "Pair your coin with any tokenized stock, ETF, commodity or asset Pons V2 approves: NVDA, TSLA, AAPL, SPCX, GME, SPY, GLD, USDG, cbBTC and more. ETH is still the default."),
        ("New", "AI pair suggestion", "After your scan, the AI suggests the stock whose story fits your object. One tap to use it, or keep ETH."),
        ("New", "Pay with ETH for paired coins", "Buying a stock-paired coin routes your ETH through Uniswap V3 on Robinhood Chain into the pair asset, then into the curve."),
        ("New", "Pairs across the market", "Every coin shows what it's paired with, with the company logo and the asset's live move."),
        ("Shipped", "ObjectPad for iPhone", "Native iOS app in TestFlight and submitted for App Store review."),
    ]
    private let status: [(String, Color, String)] = [
        ("Web app", Pad.up, "V2 live"), ("Android", Pad.up, "V2 pairing"), ("iOS", Pad.gold, "App Store review"), ("Launch engine", Pad.up, "ETH & stock pairs"),
    ]
    private let roadmap: [(String, String)] = [
        ("iOS on the App Store", "Public release once Apple review clears."),
        ("One-signature paired buys", "Swap, approve and buy in a single confirmation."),
        ("Pair performance leaderboard", "Which stocks carry the strongest object coins."),
        ("Crafting Table", "Combine object coins into new, rarer objects."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Lab("Release · 26 Sep 2026 · V2.0")
                        HStack(alignment: .firstTextBaseline, spacing: 8) { Display("ObjectPad", size: 38); Text("V2").font(Typeface.display(38)).foregroundStyle(Pad.goldGradient) }
                        Text("Real objects, now backed by real markets. Pair any scanned object with a tokenized stock and launch it on Robinhood Chain.").font(Typeface.sans(15.5, 650)).foregroundStyle(Pad.ink.opacity(0.75))
                    }
                    trailer
                    VStack(alignment: .leading, spacing: 10) {
                        Lab("How pairing works")
                        MergeAnimation().frame(height: 210).padding(10).background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Pad.paper))
                    }
                    PadButton(title: "Launch a paired coin", icon: "viewfinder", kind: .ink) { dismiss(); router.startScan() }
                    card("Release notes") {
                        ForEach(notes, id: \.1) { n in
                            HStack(alignment: .top, spacing: 10) {
                                Text(n.0.uppercased()).font(Typeface.mono(9.5, 900)).foregroundStyle(n.0 == "New" ? Color(hex: 0x3A2A05) : Pad.up)
                                    .padding(.horizontal, 6).frame(height: 18).background(Capsule().fill(n.0 == "New" ? AnyShapeStyle(Pad.goldGradient) : AnyShapeStyle(Pad.up.opacity(0.12))))
                                VStack(alignment: .leading, spacing: 3) { Text(n.1).font(Typeface.sans(15, 800)); Text(n.2).font(Typeface.sans(13, 600)).foregroundStyle(Pad.muted) }
                            }
                        }
                    }
                    card("Platform status") {
                        ForEach(status, id: \.0) { s in HStack { Circle().fill(s.1).frame(width: 8, height: 8); Text(s.0).font(Typeface.sans(14.5, 800)); Spacer(); Text(s.2).font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted) } }
                    }
                    card("Next few days") {
                        ForEach(roadmap, id: \.0) { r in HStack(alignment: .top, spacing: 10) { Image(systemName: "clock").foregroundStyle(Pad.ink); VStack(alignment: .leading, spacing: 2) { Text(r.0).font(Typeface.sans(14.5, 800)); Text(r.1).font(Typeface.sans(12.5, 600)).foregroundStyle(Pad.muted) } } }
                    }
                    movers
                    VStack(alignment: .leading, spacing: 10) {
                        Lab("From the build")
                        ScrollView(.horizontal) {
                            HStack(spacing: 10) {
                                ForEach(["duck_stock_chart_collision", "duck_stock_coin_fusion", "duck_coin_chart_pedestal"], id: \.self) { n in
                                    Color.clear.frame(width: 260, height: 174).overlay { Image(n).resizable().scaledToFill().allowsHitTesting(false) }.clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                    }
                    Text("Tokenized stocks on Robinhood Chain are issued by third parties. Pairing a coin with an asset gives holders no claim on that asset or company. Not affiliated with Robinhood Markets, Inc., Pons, or any listed company. Not financial advice.").font(Typeface.sans(11, 600)).foregroundStyle(Pad.muted)
                }
                .padding(.horizontal, 18).padding(.vertical, 12)
            }
            .background(Pad.page.ignoresSafeArea())
            .navigationTitle("What's new").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { if store.pairs == nil { await store.refreshPairs() } }
            .onDisappear { player?.pause() }
        }
    }

    private var trailer: some View {
        Color.black.aspectRatio(16 / 9, contentMode: .fit)
            .overlay {
                if let player { VideoPlayer(player: player) }
                else { Image("duck_stock_chart_collision").resizable().scaledToFill().allowsHitTesting(false) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .onAppear {
                guard player == nil, let url = URL(string: "\(ObjectPadApi.site)/trailers/objectpad-v2-launch.mp4") else { return }
                let p = AVPlayer(url: url); p.isMuted = true; player = p; p.play()
            }
    }

    private var movers: some View {
        let list = (store.pairs?.assets ?? []).filter { ["stock", "etf", "commodity"].contains($0.kind) && $0.priceUsd != nil }.prefix(9)
        return VStack(alignment: .leading, spacing: 10) {
            Lab("Pair assets · priced on-chain")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(Array(list)) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 5) { CoinAvatar(url: a.logo, symbol: a.symbol, size: 20); Text(a.symbol).font(Typeface.sans(13, 800)).lineLimit(1) }
                        Text(Fmt.usd(a.priceUsd)).font(Typeface.mono(11.5, 800))
                        if let c = a.change24h { Text(Fmt.pct(c)).font(Typeface.mono(10.5, 800)).foregroundStyle(c >= 0 ? Pad.up : Pad.down) }
                    }
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading).background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white))
                }
            }
            if list.isEmpty { Text("Reading pair prices from Robinhood Chain…").font(Typeface.sans(13, 650)).foregroundStyle(Pad.muted) }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) { Text(title).font(Typeface.sans(17, 800)); content() }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading).raised(24)
    }
}
