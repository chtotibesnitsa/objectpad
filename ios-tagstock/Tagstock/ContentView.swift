import SwiftUI

enum Tab: String, CaseIterable, Identifiable {
    case home, market, scan, rewards, wallet
    var id: String { rawValue }
    var title: String { ["Home", "Market", "Scan", "Rewards", "Wallet"][index] }
    var icon: String { ["house.fill", "chart.line.uptrend.xyaxis", "viewfinder", "trophy.fill", "wallet.bifold.fill"][index] }
    var index: Int { Self.allCases.firstIndex(of: self) ?? 0 }
}

enum Route: Hashable {
    case coin(String)
    case reward(String)
    case studio(String)
    case burn
    case earn
    case launches
}

/// Deep links from objectpad.fun URLs.
extension Route {
    static func from(url: URL) -> Route? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard let first = parts.first else { return nil }
        switch first {
        case "objects", "coin": return parts.count > 1 ? .coin(parts[1]) : nil
        case "rewards": return parts.count > 1 ? .reward(parts[1]) : nil
        case "launch": return parts.count > 1 ? .studio(parts[1]) : nil
        case "burn": return .burn
        case "earn": return .earn
        default: return nil
        }
    }
}

/// Global sheets and covers any screen can open.
@Observable
@MainActor
final class Router {
    var tab: Tab = .home
    var paths: [Tab: [Route]] = [:]
    var scanning: Bool = false
    var resumeScan: String?
    var signIn: Bool = false
    var creatingReward: Bool = false
    var account: Bool = false

    func push(_ route: Route, on tab: Tab? = nil) {
        let t = tab ?? self.tab
        if self.tab != t { self.tab = t }
        paths[t, default: []].append(route)
    }
    func binding(_ tab: Tab) -> Binding<[Route]> { Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 }) }
    func startScan(resume: String? = nil) { resumeScan = resume; scanning = true; Feedback.play(.handoff, volume: 0.35) }
}

struct ContentView: View {
    @Environment(AppStore.self) private var store
    @Environment(AccountStore.self) private var account
    @State private var router = Router()
    @State private var splash: Bool = true

    var body: some View {
        ZStack(alignment: .bottom) {
            Pad.page.ignoresSafeArea()
            ZStack {
                ForEach(Tab.allCases.filter { $0 != .scan }) { tab in
                    NavigationStack(path: router.binding(tab)) {
                        root(tab)
                            .navigationDestination(for: Route.self) { destination($0) }
                    }
                    .opacity(router.tab == tab ? 1 : 0)
                    .allowsHitTesting(router.tab == tab)
                }
            }
            TabBar(selection: router.tab) { tab in
                if tab == .scan { router.startScan(); return }
                if router.tab == tab { router.paths[tab] = [] } else { Feedback.play(.swoosh, volume: 0.25) }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) { router.tab = tab }
            }
            if let toast = store.toast {
                Text(toast).font(Typeface.sans(14, 800)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .background(Capsule().fill(Pad.ink).shadow(color: Pad.ink.opacity(0.3), radius: 16, y: 8))
                    .frame(maxHeight: .infinity, alignment: .top).padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if splash { SplashView { withAnimation(.easeInOut(duration: 0.5)) { splash = false } }.transition(.opacity).zIndex(10) }
        }
        .environment(router)
        .fullScreenCover(isPresented: Binding(get: { router.scanning }, set: { router.scanning = $0 })) {
            ScanFlowView(resume: router.resumeScan) { id in
                router.scanning = false
                router.push(.studio(id), on: .home)
            }
            .environment(account).environment(store).environment(router)
        }
        .sheet(isPresented: Binding(get: { router.signIn }, set: { router.signIn = $0 })) { SignInSheet().environment(account).environment(store) }
        .sheet(isPresented: Binding(get: { router.account }, set: { router.account = $0 })) { AccountSheet().environment(account).environment(store).environment(router) }
        .fullScreenCover(isPresented: Binding(get: { router.creatingReward }, set: { router.creatingReward = $0 })) {
            RewardCreateView { id in router.creatingReward = false; router.push(.reward(id), on: .rewards) }
                .environment(account).environment(store).environment(router)
        }
        .onOpenURL { url in if let r = Route.from(url: url) { router.push(r) } }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { a in if let url = a.webpageURL, let r = Route.from(url: url) { router.push(r) } }
    }

    @ViewBuilder private func root(_ tab: Tab) -> some View {
        switch tab {
        case .home: HomeView()
        case .market: MarketView()
        case .rewards: RewardsView()
        case .wallet: WalletView()
        case .scan: EmptyView()
        }
    }

    @ViewBuilder private func destination(_ route: Route) -> some View {
        switch route {
        case .coin(let id): CoinDetailView(id: id)
        case .reward(let id): RewardDetailView(id: id)
        case .studio(let id): StudioView(id: id)
        case .burn: BurnView()
        case .earn: EarnView()
        case .launches: LaunchesView()
        }
    }
}

/// Floating Liquid Glass tab bar with a raised scan button and a sliding selection blob.
struct TabBar: View {
    let selection: Tab
    let onSelect: (Tab) -> Void
    @Namespace private var ns
    @State private var pulse: Bool = false

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases) { tab in
                if tab == .scan {
                    Button { onSelect(tab) } label: {
                        ZStack {
                            Circle().fill(Pad.sky.opacity(0.35)).frame(width: 66, height: 66).scaleEffect(pulse ? 1.18 : 0.95).opacity(pulse ? 0 : 0.8)
                            Circle().fill(LinearGradient(colors: [Pad.graphite, Pad.ink], startPoint: .top, endPoint: .bottom)).frame(width: 60, height: 60)
                                .overlay(Circle().stroke(.white.opacity(0.18), lineWidth: 1))
                                .shadow(color: Pad.ink.opacity(0.35), radius: 12, y: 6)
                            Image(systemName: "viewfinder").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
                            Image(systemName: "sparkle").font(.system(size: 10, weight: .black)).foregroundStyle(Pad.skyLight).offset(x: 13, y: -13)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.press)
                    .accessibilityLabel("Scan an object")
                } else {
                    let on = selection == tab
                    Button { onSelect(tab) } label: {
                        VStack(spacing: 3) {
                            Image(systemName: tab.icon).font(.system(size: 19, weight: .semibold)).symbolEffect(.bounce, value: on)
                            Text(tab.title).font(Typeface.mono(9.5, 800))
                        }
                        .foregroundStyle(on ? Pad.ink : Pad.muted)
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .background { if on { Capsule().fill(Pad.ink.opacity(0.07)).matchedGeometryEffect(id: "sel", in: ns).padding(.horizontal, 4) } }
                    }
                    .buttonStyle(.quiet)
                }
            }
        }
        .padding(.horizontal, 6).padding(.vertical, 6)
        .glass(Capsule(), interactive: true)
        .shadow(color: Pad.ink.opacity(0.14), radius: 24, y: 10)
        .padding(.horizontal, 14).padding(.bottom, 4)
        .onAppear { withAnimation(.easeOut(duration: 1.8).repeatForever(autoreverses: false)) { pulse = true } }
    }
}

/// Launch sequence: the duck rises onto its glass pedestal while the wordmark decodes from glyphs.
struct SplashView: View {
    let done: () -> Void
    @State private var phase: Int = 0
    @State private var word: String = ""
    private let target = "ObjectPad"

    var body: some View {
        ZStack {
            Pad.night.ignoresSafeArea()
            VoxelField(count: 30, seed: 5).ignoresSafeArea().opacity(phase >= 1 ? 0.9 : 0)
            VStack(spacing: 18) {
                Image("rubber_duck_voxel_dissolve").resizable().scaledToFit().frame(width: 220)
                    .scaleEffect(phase >= 1 ? 1 : 0.6).offset(y: phase >= 1 ? 0 : 60).opacity(phase >= 1 ? 1 : 0)
                    .shadow(color: Pad.sky.opacity(0.6), radius: 40)
                Text(word).font(Typeface.display(40)).foregroundStyle(.white).frame(height: 44)
                Text("SCAN ANYTHING · LAUNCH A COIN").font(Typeface.mono(11, 800)).tracking(2).foregroundStyle(.white.opacity(phase >= 2 ? 0.6 : 0))
            }
        }
        .task {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.7)) { phase = 1 }
            Feedback.play(.model, volume: 0.35)
            let glyphs = Array("01#Ξ░▒▓<>/*")
            for frame in 0...(target.count + 6) {
                word = String(target.enumerated().map { i, c in i < frame - 6 ? c : i < frame ? glyphs.randomElement()! : " " })
                try? await Task.sleep(for: .milliseconds(40))
            }
            word = target
            withAnimation(.easeOut(duration: 0.4)) { phase = 2 }
            try? await Task.sleep(for: .milliseconds(650))
            done()
        }
    }
}
