import SwiftUI

/// Gold "V2" pill that sits next to the ObjectPad wordmark. Opens the V2 release notes.
struct V2Pill: View {
    var small: Bool = false
    @Environment(Router.self) private var router
    @State private var shine: Bool = false
    var body: some View {
        Button { Feedback.tap(); router.v2 = true } label: {
            HStack(spacing: 4) {
                Text("V2").font(Typeface.mono(small ? 10 : 11.5, 900))
                Circle().fill(Color(hex: 0x3A2A05).opacity(0.7)).frame(width: 5, height: 5)
            }
            .foregroundStyle(Color(hex: 0x3A2A05))
            .padding(.horizontal, small ? 7 : 9).frame(height: small ? 20 : 24)
            .background(Capsule().fill(Pad.goldGradient))
            .overlay(Capsule().stroke(Color(hex: 0x96690A).opacity(0.5), lineWidth: 1))
            .overlay {
                LinearGradient(colors: [.clear, .white.opacity(0.8), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: 18).offset(x: shine ? 30 : -30).clipShape(Capsule()).allowsHitTesting(false)
            }
            .clipShape(Capsule())
            .shadow(color: Pad.gold.opacity(0.6), radius: 6, y: 3)
        }
        .buttonStyle(.press)
        .accessibilityLabel("ObjectPad V2: what's new")
        .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false).delay(1)) { shine = true } }
    }
}

/// "Paired with NVDA" capsule used on coin rows and coin pages.
struct PairBadge: View {
    let pair: CoinPair
    var showChange: Bool = false
    var body: some View {
        HStack(spacing: 4) {
            CoinAvatar(url: pair.logo, symbol: pair.symbol, size: 16)
            Text(pair.symbol).font(Typeface.mono(10.5, 800)).foregroundStyle(Pad.ink)
            if showChange, let c = pair.change24h { Text(Fmt.pct(c)).font(Typeface.mono(10, 800)).foregroundStyle(c >= 0 ? Pad.up : Pad.down) }
        }
        .padding(.leading, 2).padding(.trailing, 7).padding(.vertical, 2)
        .background(Capsule().fill(.white))
        .overlay(Capsule().stroke(Pad.ink.opacity(0.12), lineWidth: 1))
    }
}

/// V2 pair selector for the coin form: ETH by default, the AI pick as a one-tap suggestion, and every approved Pons V2 asset.
struct PairPickerCard: View {
    @Binding var selection: String
    let suggestion: PairSuggestion?
    var disabled: Bool = false
    @Environment(AppStore.self) private var store
    @State private var browsing: Bool = false

    private var selected: PairQuote? { store.pair(selection) }
    private var suggested: PairQuote? { suggestion.flatMap { s in store.pairs?.assets.first { $0.address.lowercased() == s.address.lowercased() && $0.approved } } }
    private var paired: Bool { !PairCatalog.isEth(selection) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Pair with a stock").font(Typeface.sans(14.5, 800))
                Text("V2").font(Typeface.mono(9.5, 900)).foregroundStyle(Color(hex: 0x3A2A05)).padding(.horizontal, 6).frame(height: 17).background(Capsule().fill(Pad.goldGradient))
                Spacer()
                Text("\(store.pairs?.assets.filter(\.approved).count ?? 0) LIVE").font(Typeface.mono(10, 800)).foregroundStyle(Pad.muted)
            }
            Button { browsing = true } label: {
                HStack(spacing: 12) {
                    CoinAvatar(url: selected?.logo ?? "", symbol: selected?.symbol ?? "ETH", size: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(selected.map { "\($0.symbol) · \($0.name)" } ?? "ETH · Ether").font(Typeface.sans(15, 800)).foregroundStyle(Pad.ink).lineLimit(1)
                        Text(paired ? "Coin trades against this asset" : "Default · coin trades against ETH").font(Typeface.sans(12, 650)).foregroundStyle(Pad.muted)
                    }
                    Spacer()
                    if let p = selected?.priceUsd, paired { Text(Fmt.usd(p)).font(Typeface.mono(12, 800)).foregroundStyle(Pad.ink) }
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(Pad.muted)
                }
                .padding(12).sunk(18)
            }
            .buttonStyle(.press).disabled(disabled)
            if let s = suggestion, let q = suggested, q.address.lowercased() != selection.lowercased(), !disabled {
                Button { Feedback.success(); withAnimation(.snappy) { selection = q.address.lowercased() } } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles").foregroundStyle(Pad.gold)
                        CoinAvatar(url: q.logo, symbol: q.symbol, size: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("AI suggests \(q.symbol)").font(Typeface.sans(13.5, 800)).foregroundStyle(.white)
                            Text(s.reason).font(Typeface.sans(11.5, 600)).foregroundStyle(.white.opacity(0.7)).lineLimit(2)
                        }
                        Spacer()
                        Text("Use").font(Typeface.sans(12, 800)).foregroundStyle(Pad.ink).padding(.horizontal, 12).frame(height: 28).background(Capsule().fill(.white))
                    }
                    .padding(12).background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Pad.ink))
                }
                .buttonStyle(.press).transition(.scale.combined(with: .opacity))
            }
            if paired && !disabled { Button("Switch back to ETH") { withAnimation(.snappy) { selection = "" } }.font(Typeface.sans(12.5, 800)).foregroundStyle(Pad.muted) }
            Text("Buyers pay in ETH; it routes on-chain into the pair asset. Pairing gives no claim on the company or asset.").font(Typeface.sans(11, 600)).foregroundStyle(Pad.muted)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(paired ? Color(hex: 0xFFF8E6) : .white))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(paired ? Pad.gold.opacity(0.6) : Pad.ink.opacity(0.08), lineWidth: 1.5))
        .sheet(isPresented: $browsing) { PairBrowser(selection: $selection, suggestion: suggestion).presentationDetents([.large]).presentationCornerRadius(30) }
        .task { if store.pairs == nil { await store.refreshPairs() } }
    }
}

/// Searchable list of every approved pair asset with company logos and live on-chain prices.
struct PairBrowser: View {
    @Binding var selection: String
    let suggestion: PairSuggestion?
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var query: String = ""
    @State private var kind: String = "popular"

    private var list: [PairQuote] {
        let all = (store.pairs?.assets ?? []).filter(\.approved)
        if !query.isEmpty { return all.filter { "\($0.symbol) \($0.name) \($0.sector ?? "")".localizedStandardContains(query) } }
        switch kind {
        case "popular": return PairCatalog.popular.compactMap { s in all.first { $0.symbol == s } }
        case "all": return all
        default: return all.filter { $0.kind == kind }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ScrollView(.horizontal) { HStack(spacing: 6) { ForEach(PairCatalog.kinds, id: \.0) { k in Pill(title: k.1, on: kind == k.0) { kind = k.0 } } } }
                        .scrollIndicators(.hidden).listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)).listRowBackground(Color.clear)
                }
                Section {
                    ForEach(list) { a in
                        Button { Feedback.selection(); selection = a.isEth ? "" : a.address.lowercased(); dismiss() } label: { row(a) }
                    }
                    if list.isEmpty { Text(store.pairs == nil ? "Reading prices from Robinhood Chain…" : "No matching asset.").font(Typeface.sans(14, 650)).foregroundStyle(Pad.muted) }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $query, prompt: "Search NVDA, Tesla, gold…")
            .navigationTitle("Pair with").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .refreshable { await store.refreshPairs() }
        }
    }

    private func row(_ a: PairQuote) -> some View {
        let on = PairCatalog.isEth(selection) ? a.isEth : a.address.lowercased() == selection.lowercased()
        return HStack(spacing: 12) {
            CoinAvatar(url: a.logo, symbol: a.symbol, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) { Text(a.symbol).font(Typeface.sans(15, 800)).foregroundStyle(Pad.ink); if suggestion?.address.lowercased() == a.address.lowercased() { Image(systemName: "sparkles").font(.system(size: 11)).foregroundStyle(Pad.gold) } }
                Text([a.name, a.sector].compactMap { $0 }.joined(separator: " · ")).font(Typeface.sans(12, 600)).foregroundStyle(Pad.muted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(a.priceUsd.map { Fmt.usd($0) } ?? "—").font(Typeface.mono(12.5, 800)).foregroundStyle(Pad.ink)
                if let c = a.change24h { Text(Fmt.pct(c)).font(Typeface.mono(11, 800)).foregroundStyle(c >= 0 ? Pad.up : Pad.down) }
            }
            if on { Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Pad.ink) }
        }
        .contentShape(Rectangle())
    }
}

/// Looping visual: an object and a stock chart slam together and become one paired coin.
struct MergeAnimation: View {
    @State private var phase: Int = 0
    @Environment(AppStore.self) private var store
    private let nvda = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"
    var body: some View {
        let q = store.pair(nvda)
        GeometryReader { geo in
            let w = geo.size.width
            ZStack {
                if phase < 2 {
                    Image("duck_mark").resizable().scaledToFit().frame(width: w * 0.26)
                        .padding(10).background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.white))
                        .offset(x: phase == 0 ? -w * 0.28 : -w * 0.04)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 5) { CoinAvatar(url: q?.logo ?? "", symbol: "NVDA", size: 18); Text("NVDA").font(Typeface.sans(12, 800)) }
                        Sparkline(points: [1, 1.2, 1.1, 1.5, 1.4, 1.9, 1.8, 2.4], up: true).frame(height: 30)
                        Text(q?.priceUsd.map { Fmt.usd($0) } ?? "—").font(Typeface.mono(11, 800))
                    }
                    .padding(10).frame(width: w * 0.3).background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.white))
                    .offset(x: phase == 0 ? w * 0.28 : w * 0.04)
                }
                if phase == 2 { Circle().fill(RadialGradient(colors: [Pad.up.opacity(0.5), .clear], center: .center, startRadius: 0, endRadius: w * 0.3)).frame(width: w * 0.6).transition(.scale(scale: 0.2).combined(with: .opacity)) }
                if phase >= 2 {
                    VStack(spacing: 6) {
                        Image("duck_stock_coin_fusion").resizable().scaledToFill().frame(width: w * 0.42, height: w * 0.28).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        Text("$DUCK · paired with NVDA").font(Typeface.sans(12.5, 800)).foregroundStyle(Pad.ink)
                    }
                    .padding(8).background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.white)).overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Pad.up, lineWidth: 2))
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
                }
            }
            .frame(width: w, height: geo.size.height)
        }
        .task {
            while !Task.isCancelled {
                withAnimation(.easeInOut(duration: 0.3)) { phase = 0 }
                try? await Task.sleep(for: .seconds(1.2))
                withAnimation(.easeIn(duration: 0.45)) { phase = 1 }
                try? await Task.sleep(for: .seconds(0.45))
                Feedback.softImpact()
                withAnimation(.spring(response: 0.45, dampingFraction: 0.6)) { phase = 2 }
                try? await Task.sleep(for: .seconds(0.4))
                withAnimation(.spring) { phase = 3 }
                try? await Task.sleep(for: .seconds(2.4))
            }
        }
    }
}
