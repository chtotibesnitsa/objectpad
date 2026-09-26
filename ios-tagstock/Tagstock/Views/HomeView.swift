import SwiftUI

struct HomeView: View {
    @Environment(AppStore.self) private var store
    @Environment(AccountStore.self) private var account
    @Environment(Router.self) private var router
    @State private var lastScan: String? = UserDefaults.standard.string(forKey: "lastScan")

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                hero
                if let id = lastScan { resumeCard(id).enter(0.1) }
                howItWorks.enter(0.15)
                if !store.building.isEmpty { buildingStrip.enter(0.2) }
                trending.enter(0.25)
                bountyTeaser.enter(0.3)
                burnCard.enter(0.35)
                earnCard.enter(0.4)
                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.refreshAll() }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { lastScan = UserDefaults.standard.string(forKey: "lastScan") }
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Color.clear.frame(height: 470)
                .overlay { Image("glass_pedestal_voxel_cubes").resizable().scaledToFill().allowsHitTesting(false) }
                .overlay { CloudDrift().opacity(0.6) }
                .overlay(alignment: .center) {
                    Image("rubber_duck_voxel_dissolve").resizable().scaledToFit().frame(width: 230)
                        .offset(y: 40).modifier(Bob())
                        .shadow(color: .black.opacity(0.18), radius: 20, y: 14)
                }
                .overlay { LinearGradient(colors: [.clear, .clear, Pad.ink.opacity(0.55)], startPoint: .top, endPoint: .bottom) }
                .clipShape(RoundedRectangle(cornerRadius: 34, style: .continuous))

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    PulseDot()
                    Text("\(store.market?.objectpad?.launched ?? store.coins.count) OBJECTS LIVE ON-CHAIN").font(Typeface.mono(10.5, 800)).foregroundStyle(.white)
                }
                .padding(.horizontal, 11).padding(.vertical, 7).glass(Capsule(), tint: Pad.ink.opacity(0.4))
                Button { router.v2 = true } label: {
                    HStack(spacing: 6) { Text("V2 LIVE").font(Typeface.mono(9.5, 900)).foregroundStyle(Color(hex: 0x3A2A05)).padding(.horizontal, 6).frame(height: 18).background(Capsule().fill(Pad.goldGradient)); Text("Pair any object with a stock").font(Typeface.sans(12.5, 800)).foregroundStyle(.white); Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(.white) }
                        .padding(.leading, 4).padding(.trailing, 10).frame(height: 28).glass(Capsule(), tint: Pad.ink.opacity(0.5))
                }
                .buttonStyle(.press)
                Display("Real objects.\nReal markets.", size: 42, color: .white)
                Text("Scan any object, pair it with a tokenized stock, and launch its coin free on Robinhood Chain.")
                    .font(Typeface.sans(15, 650)).foregroundStyle(.white.opacity(0.85))
                HStack(spacing: 10) {
                    PadButton(title: "Scan an object", icon: "viewfinder", kind: .pearl) { router.startScan() }
                    CircleIconButton(icon: "person.crop.circle", dark: true, size: 56) { router.account = true }
                }
            }
            .padding(20)
        }
        .overlay(alignment: .topLeading) {
            HStack(spacing: 8) {
                Image("duck_mark").resizable().frame(width: 30, height: 30).clipShape(Circle())
                Text("ObjectPad").font(Typeface.display(19)).foregroundStyle(.white)
                V2Pill(small: true)
                Spacer()
                treasuryChip
            }
            .padding(16)
        }
        .padding(.top, 6)
        .enter()
    }

    private var treasuryChip: some View {
        HStack(spacing: 6) {
            Circle().fill(store.treasuryOpen ? Pad.up : Pad.amber).frame(width: 7, height: 7)
            Text(store.status == nil ? "…" : store.treasuryOpen ? "\(store.launchesLeft) FREE LAUNCHES" : "QUEUE OPEN").font(Typeface.mono(10, 800))
        }
        .foregroundStyle(.white).padding(.horizontal, 10).padding(.vertical, 7).glass(Capsule(), tint: Pad.ink.opacity(0.35))
    }

    private func resumeCard(_ id: String) -> some View {
        Button { router.push(.studio(id)) } label: {
            HStack(spacing: 14) {
                GlassIcon(name: "glass_mesh", size: 46, float: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Continue your scan").font(Typeface.sans(16, 800)).foregroundStyle(Pad.ink)
                    Text("Your photos are saved. Pick up where you left off.").font(Typeface.sans(13, 600)).foregroundStyle(Pad.muted)
                }
                Spacer()
                Image(systemName: "arrow.right.circle.fill").font(.system(size: 26)).foregroundStyle(Pad.ink)
            }
            .padding(16).raised(24)
        }
        .buttonStyle(.press)
    }

    private var howItWorks: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(lab: "How it works", title: "Real object → real coin")
            ScrollView(.horizontal) {
                HStack(spacing: 10) {
                    step("1", "Six photos", "Walk around it. The guide tells you where.", "smartphone_camera_mug")
                    step("2", "AI rebuilds it", "A real 3D model, checked for duplicates.", "rubber_duck_voxel_dissolve")
                    step("3", "Launch free", "Name it. The treasury pays the gas.", "rocket_launch_voxel")
                    step("4", "Earn forever", "0.5% of every trade, claimable anytime.", "gold_coins_vault_box")
                }
            }
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, 0)
        }
    }

    private func step(_ n: String, _ title: String, _ body: String, _ image: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Color.clear.frame(height: 110).overlay { Image(image).resizable().scaledToFit().allowsHitTesting(false) }
            Text(n).font(Typeface.mono(11, 800)).foregroundStyle(Pad.muted)
            Text(title).font(Typeface.sans(16, 800)).foregroundStyle(Pad.ink)
            Text(body).font(Typeface.sans(12.5, 600)).foregroundStyle(Pad.muted).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14).frame(width: 178, alignment: .leading).raised(24)
    }

    private var buildingStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) { PulseDot(color: Pad.sky); Lab("Being built right now") }
            ForEach(store.building.prefix(3)) { b in
                HStack(spacing: 12) {
                    Text(b.symbol.isEmpty ? "···" : "$\(b.symbol)").font(Typeface.mono(12, 800)).frame(width: 70, alignment: .leading)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(b.name.isEmpty ? "New object" : b.name).font(Typeface.sans(13.5, 750)).lineLimit(1)
                        ProgressBar(value: b.progress, color: Pad.sky)
                    }
                    Text(b.stage.capitalized).font(Typeface.mono(10, 700)).foregroundStyle(Pad.muted)
                }
            }
        }
        .padding(16).raised(24)
    }

    private var trending: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(lab: "Market · live", title: "Trending objects", action: "All") { router.tab = .market }
            if let err = store.coinsError { ErrorBanner(message: err) }
            else if !store.loaded { ForEach(0..<3, id: \.self) { _ in Shimmer().frame(height: 72).clipShape(RoundedRectangle(cornerRadius: 20)) } }
            else {
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(store.coins.sorted { $0.trending > $1.trending }.prefix(8)) { c in
                            Button { router.push(.coin(c.id)) } label: { CoinTile(coin: c, ethUsd: store.ethUsd) }.buttonStyle(.press)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private var bountyTeaser: some View {
        let open = (store.rewards?.bounties ?? []).filter { $0.status == "open" }.ranked(by: .best)
        return Button { router.tab = .rewards } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Lab("Paid Rewards", color: .white.opacity(0.7))
                    Spacer()
                    Text(Fmt.money(store.rewards?.stats?.openUsd ?? 0) + " OPEN").font(Typeface.mono(11, 800)).foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 5).background(Capsule().fill(.white.opacity(0.18)))
                }
                Display("Find it. Scan it.\nGet paid.", size: 30, color: .white)
                if let top = open.first {
                    HStack(spacing: 10) {
                        Color.clear.frame(width: 84, height: 54).overlay { SkyPoster(reward: top).allowsHitTesting(false) }.clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(top.title).font(Typeface.sans(14, 800)).foregroundStyle(.white).lineLimit(1)
                            CountdownPill(deadline: top.deadline)
                        }
                        Spacer()
                        Text(Fmt.money(top.rewardUsd)).font(Typeface.display(22)).foregroundStyle(.white)
                    }
                    .padding(10).background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.white.opacity(0.14)))
                }
            }
            .padding(18)
            .background {
                ZStack { Pad.skyGradient; CloudDrift().opacity(0.8); VoxelField(count: 16, seed: 9) }
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .shadow(color: Pad.sky.opacity(0.4), radius: 20, y: 12)
            }
        }
        .buttonStyle(.press)
    }

    private var burnCard: some View {
        Button { router.push(.burn) } label: {
            HStack(spacing: 14) {
                GlassIcon(name: "glass_burn", size: 54, float: true)
                VStack(alignment: .leading, spacing: 3) {
                    Lab("Buyback & burn", color: .white.opacity(0.55))
                    Text("\(Fmt.compact(BigUInt(decimal: store.burns?.totalTokens ?? "0")?.toDouble() ?? 0)) $OBJECTPAD burned").font(Typeface.sans(16, 800)).foregroundStyle(.white)
                    Text("\(store.burns?.burns ?? 0) burns · every trade feeds the fire").font(Typeface.sans(12.5, 600)).foregroundStyle(.white.opacity(0.6))
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.5))
            }
            .padding(16).smoke(24)
        }
        .buttonStyle(.press)
    }

    private var earnCard: some View {
        Button { router.push(.earn) } label: {
            HStack(spacing: 14) {
                GlassIcon(name: "glass_coins", size: 50)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Post & earn").font(Typeface.sans(16, 800)).foregroundStyle(Pad.ink)
                    Text("Get paid for verified X posts about ObjectPad.").font(Typeface.sans(13, 600)).foregroundStyle(Pad.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Pad.muted)
            }
            .padding(16).raised(24)
        }
        .buttonStyle(.press)
    }
}

struct Bob: ViewModifier {
    @State private var up: Bool = false
    func body(content: Content) -> some View {
        content.offset(y: up ? -8 : 4).rotationEffect(.degrees(up ? -2 : 2))
            .onAppear { withAnimation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true)) { up = true } }
    }
}

struct ProgressBar: View {
    let value: Double
    var color: Color = Pad.ink
    var height: CGFloat = 7
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Pad.ink.opacity(0.08))
                Capsule().fill(color).frame(width: max(height, geo.size.width * min(1, max(0, value))))
                    .animation(.spring(response: 0.8, dampingFraction: 0.85), value: value)
            }
        }
        .frame(height: height)
    }
}

struct CoinTile: View {
    let coin: ObjectCoin
    let ethUsd: Double?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                CoinAvatar(url: coin.logo, symbol: coin.symbol, size: 44)
                Spacer()
                Text(Fmt.pct(coin.change24h)).font(Typeface.mono(11, 800)).foregroundStyle(coin.change24h >= 0 ? Pad.up : Pad.down)
            }
            Text("$\(coin.symbol)").font(Typeface.sans(15, 800)).foregroundStyle(Pad.ink).lineLimit(1)
            Text(Fmt.value(coin.marketCapEth, ethUsd) + " mcap").font(Typeface.mono(10.5, 700)).foregroundStyle(Pad.muted).lineLimit(1)
            Sparkline(points: coin.spark, up: coin.change24h >= 0).frame(height: 26)
        }
        .padding(12).frame(width: 150).raised(22)
    }
}
