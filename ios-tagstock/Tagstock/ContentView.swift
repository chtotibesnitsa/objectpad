import SwiftUI

struct ContentView: View {
    @State private var store = AppStore()
    @State private var selectedTab: Int = 0
    @State private var explorePath = NavigationPath()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Explore", systemImage: "safari.fill", value: 0) { shell(path: $explorePath) { ExploreView() } }
            Tab("Cases", systemImage: "square.grid.2x2.fill", value: 1) { shell { CasesView() } }
            Tab("Battles", systemImage: "bolt.horizontal.fill", value: 2) { shell { BattlesView() } }
            Tab("Portfolio", systemImage: "wallet.pass.fill", value: 3) { shell { WalletView() } }
            Tab("More", systemImage: "line.3.horizontal", value: 4) { shell { MoreView() } }
        }
        .tint(Theme.gold)
        .preferredColorScheme(.dark)
        .overlay { ToastBanner() }
        .environment(store)
        .onAppear { store.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.start(); Task { await store.refresh() } } else if phase == .background { store.stop() }
        }
        .onOpenURL { url in
            guard let route = Route.from(url: url) else { return }
            selectedTab = 0
            explorePath.append(route)
        }
    }

    @ViewBuilder
    private func shell<Content: View>(path: Binding<NavigationPath>? = nil, @ViewBuilder content: () -> Content) -> some View {
        if let path {
            NavigationStack(path: path) { content().navigationBarTitleDisplayMode(.inline).toolbar { header }.navigationDestination(for: Route.self) { destination($0) } }
        } else {
            NavigationStack { content().navigationBarTitleDisplayMode(.inline).toolbar { header }.navigationDestination(for: Route.self) { destination($0) } }
        }
    }

    @ToolbarContentBuilder
    private var header: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) { Wordmark(size: 18) }
        ToolbarItem(placement: .topBarTrailing) { NetworkPill() }
    }

    @ViewBuilder
    private func destination(_ route: Route) -> some View {
        switch route {
        case .token(let t): TokenDetailView(token: t)
        case .cases: CasesView()
        case .battles: BattlesView()
        case .quests: QuestsView()
        case .leaderboard: LeaderboardView()
        case .launch: LaunchView()
        case .portfolio, .wallet: WalletView()
        case .market: WebHandoffView(title: "Market & Vault", path: "/market", body_: "Your on-site Casepad vault, swap offers and the ten closest listings from other holders.", art: "nav_market")
        case .keys: WebHandoffView(title: "Keys", path: "/keys", body_: "Usable keys, their rounds and expiry, plus key transfers.", art: "nav_keys")
        case .rewards: WebHandoffView(title: "Reward History", path: "/rewards", body_: "Every reveal you opened with its RNG proof, claim state and payout receipt.", art: "nav_history")
        case .studio: WebHandoffView(title: "Creator Studio", path: "/studio", body_: "Your launched coins, treasury claims, case publishing and quest review queue.", art: "nav_studio")
        case .settings: WebHandoffView(title: "Settings", path: "/settings", body_: "Username, privacy, notifications, motion, age confirmation and region.", art: "nav_settings")
        case .setup: WebHandoffView(title: "Platform setup", path: "/setup", body_: "Operator integration status and readiness. Visible to authorized accounts only.", art: "nav_setup")
        case .practice: WebHandoffView(title: "Practice arcade", path: "/practice", body_: "Free spins with practice credits only. Never mixed with funded cases.", art: "nav_cases")
        case .howItWorks: InfoView(page: .howItWorks)
        case .fairness: InfoView(page: .fairness)
        case .help: InfoView(page: .help)
        case .playbook: InfoView(page: .playbook)
        case .status: StatusView()
        case .transactions: TransactionsView()
        case .activity: ActivityView()
        }
    }
}

/// Header network badge, driven by the backend's reported chain and a live RPC probe.
struct NetworkPill: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        NavigationLink(value: Route.status) {
            HStack(spacing: 5) {
                Circle().fill(store.status != nil ? Theme.up : Theme.down).frame(width: 6, height: 6)
                Text(store.status?.chain.name ?? Chain.name).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 10).frame(height: 32).background(Theme.card, in: Capsule())
        }
        .accessibilityLabel("Network: \(store.status?.chain.name ?? Chain.name). Open system status")
    }
}
