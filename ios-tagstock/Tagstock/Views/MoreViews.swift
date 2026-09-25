import SwiftUI

/// "More" tab: every website utility route, grouped exactly as the web rail.
struct MoreView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL

    private struct Item { let route: Route; let label: String; let art: String }
    private let terminal: [Item] = [
        .init(route: .battles, label: "Live Battles", art: "nav_battles"), .init(route: .quests, label: "Quests", art: "nav_quests"),
        .init(route: .leaderboard, label: "Leaderboard", art: "nav_leaderboard"), .init(route: .launch, label: "Launch coin", art: "nav_launch"),
    ]
    private let account: [Item] = [
        .init(route: .market, label: "Market & Vault", art: "nav_market"), .init(route: .keys, label: "Keys", art: "nav_keys"),
        .init(route: .rewards, label: "Reward History", art: "nav_history"), .init(route: .studio, label: "Creator Studio", art: "nav_studio"),
    ]
    private let utility: [Item] = [
        .init(route: .howItWorks, label: "How It Works", art: "nav_book"), .init(route: .fairness, label: "Fairness & Proof", art: "nav_shield"),
        .init(route: .help, label: "Help", art: "nav_help"), .init(route: .settings, label: "Settings", art: "nav_settings"),
        .init(route: .setup, label: "Platform setup", art: "nav_setup"), .init(route: .playbook, label: "Launch playbook", art: "nav_book"),
        .init(route: .practice, label: "Practice arcade", art: "nav_cases"), .init(route: .status, label: "System status", art: "nav_shield"),
        .init(route: .transactions, label: "Transactions", art: "nav_history"), .init(route: .activity, label: "Activity", art: "nav_history"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack { Wordmark(); Spacer(); if let x = store.xURL { Button { openURL(x) } label: { Text("𝕏 @CasePadFun").font(.system(size: 12, weight: .bold)).padding(.horizontal, 12).frame(height: 36).background(Theme.secondary, in: .rect(cornerRadius: 8)) } } }
                CopyChip(label: "Official CA", value: store.casepadCA)
                group("Terminal", terminal); group("Account", account); group("More", utility)
                Text("PONS V2 / CHAIN \(Chain.id)\nYour wallet. Your trades.").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
            }.padding(16)
        }.background(Theme.background)
    }

    private func group(_ title: String, _ items: [Item]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Eyebrow(title)
            VStack(spacing: 0) {
                ForEach(items, id: \.label) { item in
                    NavigationLink(value: item.route) {
                        HStack(spacing: 12) {
                            Image(item.art).resizable().scaledToFit().frame(width: 30, height: 30)
                            Text(item.label).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.foreground)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.muted)
                        }.padding(.vertical, 10).padding(.horizontal, 12)
                    }
                    if item.label != items.last?.label { Divider().overlay(Theme.border).padding(.leading, 54) }
                }
            }.background(Theme.card, in: .rect(cornerRadius: 12))
        }
    }
}

/// Sitewide treasury transactions (`GET /transactions`).
struct TransactionsView: View {
    @Environment(\.openURL) private var openURL
    @State private var feed: TransactionsFeed?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Transactions", eyebrow: feed?.scope ?? "sitewide treasury operations")
                if let feed {
                    if !feed.totals.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 10) { ForEach(feed.totals.sorted { $0.key < $1.key }, id: \.key) { k, v in VStack(alignment: .leading, spacing: 3) { Eyebrow(k.replacingOccurrences(of: "_", with: " ")); Text(Format.eth(v, digits: 5)).font(.system(size: 13, weight: .bold, design: .monospaced)) }.padding(10).background(Theme.card, in: .rect(cornerRadius: 10)) } } }
                    }
                    if feed.items.isEmpty { EmptyState(title: "No treasury operations yet", body: "Dev payouts, case funding and CASEPAD buybacks appear here with their receipts.", systemImage: "clock") }
                    VStack(spacing: 0) {
                        ForEach(feed.items) { tx in
                            Button { if let h = tx.tx_hash { openURL(Chain.txURL(h)) } } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(tx.kind.replacingOccurrences(of: "_", with: " ").uppercased()).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(tx.kind.contains("buyback") || tx.kind.contains("burn") ? Theme.gold : Theme.up)
                                        Text("$\(tx.tokenInfo?.ticker ?? Format.shortAddress(tx.token))").font(.system(size: 12, weight: .semibold))
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 3) {
                                        Text(Format.eth(tx.amount_wei, digits: 5)).font(.system(size: 12, weight: .semibold, design: .monospaced))
                                        HStack(spacing: 4) { Circle().fill(tx.state == "confirmed" ? Theme.up : tx.state == "failed" ? Theme.down : Theme.gold).frame(width: 5, height: 5); Text(tx.state).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
                                    }
                                    Text(Format.timeAgo(tx.confirmed_at ?? tx.created_at)).font(.system(size: 10)).foregroundStyle(Theme.muted).frame(width: 52, alignment: .trailing)
                                }.padding(.vertical, 10).foregroundStyle(Theme.foreground)
                            }
                            Divider().overlay(Theme.border)
                        }
                    }.padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
                } else if let error { ErrorState(message: error) { Task { await load() } } } else { SkeletonCard(height: 240) }
            }.padding(16)
        }.background(Theme.background).task { await load() }.refreshable { await load() }
    }
    private func load() async { do { feed = try await CasepadApi.shared.transactions(); error = nil } catch { self.error = error.localizedDescription } }
}

/// Unified public activity (`GET /activity`): launches, treasury moves, opened cases.
struct ActivityView: View {
    @Environment(\.openURL) private var openURL
    @State private var items: [ActivityItem]?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Activity", eyebrow: "newest 50 public actions sitewide")
                if let items {
                    if items.isEmpty { EmptyState(title: "Nothing yet", body: "Launches, treasury movements and opened cases land here.", systemImage: "bolt") }
                    VStack(spacing: 0) {
                        ForEach(items) { a in
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(a.label.uppercased()).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(a.type == "draw" ? Theme.gold : Theme.up)
                                    HStack(spacing: 4) { Text("$\(a.tokenInfo?.ticker ?? "")").font(.system(size: 12, weight: .semibold)); if let u = a.user { Text("@\(u.handle)").font(.system(size: 11)).foregroundStyle(Theme.muted) } }
                                }
                                Spacer()
                                if let amt = a.amountWei { Text(a.asset == nil || a.asset == "ETH" ? Format.eth(amt, digits: 5) : Format.units(amt)).font(.system(size: 12, weight: .semibold, design: .monospaced)) }
                                if let h = a.txHash { Button { openURL(Chain.txURL(h)) } label: { Image(systemName: "arrow.up.right.square").font(.system(size: 12)).foregroundStyle(Theme.muted) } }
                                Text(Format.timeAgo(a.at)).font(.system(size: 10)).foregroundStyle(Theme.muted).frame(width: 52, alignment: .trailing)
                            }.padding(.vertical, 10)
                            Divider().overlay(Theme.border)
                        }
                    }.padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
                } else if let error { ErrorState(message: error) { Task { await load() } } } else { SkeletonCard(height: 240) }
            }.padding(16)
        }.background(Theme.background).task { await load() }.refreshable { await load() }
    }
    private func load() async { do { items = try await CasepadApi.shared.activity(); error = nil } catch { self.error = error.localizedDescription } }
}

/// System status from real service/chain health: backend `/status`, `/platform` readiness, live RPC probe.
struct StatusView: View {
    @Environment(AppStore.self) private var store
    @State private var platform: PlatformConfig?
    @State private var rpcBlock: Int?
    @State private var rpcChain: Int?
    @State private var rpcError: String?
    @State private var burns: BurnFeed?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "System status", eyebrow: "live checks · nothing is hardcoded green")
                VStack(alignment: .leading, spacing: 10) {
                    row("Casepad backend", ok: store.status != nil, detail: store.status.map { "\($0.name) · \($0.paused ? "paused" : "running")\($0.maintenance ? " · maintenance" : "")" } ?? (store.lastError ?? "unreachable"))
                    row("Robinhood Chain RPC", ok: rpcChain == Chain.id, detail: rpcError ?? (rpcBlock.map { "chain \(rpcChain ?? 0) · block \($0)" } ?? "probing…"))
                    row("Live cases", ok: store.openCases?.live ?? false, detail: store.openCases?.live == true ? "operator switch on" : "switched off by operator")
                    row("Real value payouts", ok: store.status?.realValue == "enabled", detail: store.status?.realValue ?? "—")
                    row("Fee routing", ok: store.status?.feeRouting != "unavailable", detail: store.status?.feeRouting ?? "—")
                    row("CASEPAD buyback", ok: platform?.buyback.status == "enabled", detail: platform.map { "\($0.buyback.status) · \($0.buyback.reason)" } ?? "—")
                }.card(raised: true)
                if let p = platform {
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow("readiness checks")
                        ForEach(p.readiness.checks) { c in row(c.id.replacingOccurrences(of: "-", with: " "), ok: c.ok, detail: c.detail) }
                        if !p.blockers.isEmpty { Eyebrow("blockers", color: Theme.down); ForEach(p.blockers, id: \.self) { Text("· \($0)").font(.system(size: 11)).foregroundStyle(Theme.muted) } }
                    }.card()
                }
                if let b = burns {
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow("CASEPAD buyback & burn")
                        HStack { StatCell(label: "Burned total", value: Format.eth(b.totalBurnedWei, digits: 5)); StatCell(label: "Next cycle", value: Format.timeAgo(b.nextCycleAt).replacingOccurrences(of: " ago", with: ""), alignTrailing: true) }
                        Text("Target \(Format.shortAddress(b.target ?? Chain.casepadToken)) → \(Format.shortAddress(Chain.burnAddress)) every \(Int(b.intervalMs / 60_000)) min").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                    }.card()
                }
                if let s = store.status {
                    VStack(alignment: .leading, spacing: 6) {
                        Eyebrow("randomness")
                        Text(s.randomness.method).font(.system(size: 12, weight: .semibold))
                        Text(s.randomness.note).font(.system(size: 11)).foregroundStyle(Theme.muted)
                    }.card()
                }
            }.padding(16)
        }.background(Theme.background).task { await load() }.refreshable { await load() }
    }
    private func row(_ label: String, ok: Bool, detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle().fill(ok ? Theme.up : Theme.down).frame(width: 8, height: 8).padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) { Text(label).font(.system(size: 13, weight: .semibold)); Text(detail).font(.system(size: 11)).foregroundStyle(Theme.muted) }
        }
    }
    private func load() async {
        platform = try? await CasepadApi.shared.platform()
        burns = try? await CasepadApi.shared.burns()
        do { rpcChain = try await ChainClient.shared.chainId(); rpcBlock = try await ChainClient.shared.blockNumber(); rpcError = nil } catch { rpcError = error.localizedDescription }
    }
}

/// Website info pages, rendered natively with the site's real microcopy and live fee values.
struct InfoView: View {
    enum Page { case howItWorks, fairness, help, playbook }
    let page: Page
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL

    var body: some View {
        let c = store.status?.contribution
        let dev = Double(c?.devBps ?? 50) / 100, crates = Double(c?.cratesBps ?? 50) / 100, burn = Double(c?.buybackBps ?? 50) / 100
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                switch page {
                case .howItWorks:
                    SectionHead(title: "How It Works", eyebrow: "a coin. a treasury. its own cases.")
                    block("Launch and trade", "Launch a coin on Pons V2 with a fixed 1B supply and an ETH bonding curve. It graduates into a Uniswap v4 pool at 4.2 ETH. Trades happen in your own wallet.")
                    block("Where fees go", String(format: "Every curve trade carries a 1%% Pons fee plus %.1f%% Casepad: %.1f%% to the creator, %.1f%% to that coin's case treasury, %.1f%% buys and burns CASEPAD every %d minutes.", dev + crates + burn, dev, crates, burn, Int((store.platform?.fees.buybackIntervalMs ?? 1_800_000) / 60_000)))
                    block("Burn coins for a chance at more", "Burn the coin to mint a key, then open one of its cases. Every outcome is paid in the same coin from the treasury. Outcomes are fixed odds published before the round and never a guaranteed return.")
                    block("After you win", "Rewards are claimable to your wallet or into your Casepad vault, where you can swap them with other holders on the Market.")
                    block("Platform presets vs creator designs", "Casepad ships tuned case tables (0.1x to 100x). Creators can also design their own tables; both are published with return and profit odds.")
                case .fairness:
                    SectionHead(title: "Fairness & Proof", eyebrow: "proof, not promises.")
                    block("How a live draw works", store.status?.randomness.note ?? "Each round commits a server seed hash before any key is sold. Your client seed plus a future block hash are mixed in at reveal; the server seed is published when the round closes.")
                    block("What you can check yourself", "Every reveal page shows the seed commit, your client seed, the block hash and the draw hash. `GET /draws` lists every settled draw publicly so anyone can recompute the result.")
                    block("On-chain vs off-chain", "Burns, payouts, dev payouts and buybacks are on Robinhood Chain with receipts. Draw selection is off-chain but committed and verifiable.")
                    block("Inventory and solvency", "A case can only be published when the treasury holds every prize. Held, committed and claimable units are shown on each coin page and must satisfy the invariant.")
                    Button { openURL(URL(string: "https://casepad.fun/fairness")!) } label: { Label("Open the public draw record", systemImage: "arrow.up.right").frame(maxWidth: .infinity) }.buttonStyle(SecondaryButtonStyle())
                case .help:
                    SectionHead(title: "Help", eyebrow: "get unstuck.")
                    block("Why can I not launch?", "Launches need a wallet on Robinhood Chain (id 4663) with enough ETH for the factory launch fee and gas. Bridge via the Arbitrum portal or Relay.")
                    block("Why is the burn button disabled?", "Either live cases are switched off by the operator, the round has no keys left, you have not confirmed age/region in Settings, or your wallet is on the wrong network.")
                    block("My payout says failed", "Failed payouts are retried automatically and shown on the Transactions page. Nothing is lost; the reward stays claimable.")
                    block("Can I win a real car or watch?", "No. Case art is themed; every prize is an amount of the coin you burned.")
                    block("Contact", "Reach the team on X @CasePadFun.")
                    if let x = store.xURL { Button { openURL(x) } label: { Label("Message on X", systemImage: "arrow.up.right").frame(maxWidth: .infinity) }.buttonStyle(SecondaryButtonStyle()) }
                case .playbook:
                    SectionHead(title: "Launch playbook", eyebrow: "from launch to first funded case")
                    block("1. Launch", "Pick a name, ticker and image. Sign `launchAndBuy` in MetaMask. Your coin appears on Explore once the launch is indexed.")
                    block("2. Let fees accrue", String(format: "Each trade routes %.1f%% of notional to your coin's treasury. Auto-claim sweeps escrow into the treasury as it accrues.", crates))
                    block("3. Publish a case", "In Creator Studio, choose a platform preset or design your own table. A round publishes only when the treasury covers every prize.")
                    block("4. Grow", "Post quests that pay keys, host battles, and watch reveals land on the live tape.")
                }
            }.padding(16)
        }.background(Theme.background)
    }
    private func block(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) { Text(title).font(.system(size: 15, weight: .bold)); Text(body).font(.system(size: 13)).foregroundStyle(Theme.muted) }.card()
    }
}

/// Account-gated web features: honest handoff to the authenticated website session.
struct WebHandoffView: View {
    let title: String
    let path: String
    let body_: String
    let art: String
    @Environment(\.openURL) private var openURL
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: title)
                VStack(spacing: 12) {
                    Image(art).resizable().scaledToFit().frame(height: 96)
                    Text(body_).font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    Button { openURL(URL(string: "https://metamask.app.link/dapp/casepad.fun\(path)")!) } label: { Label("Open in MetaMask", systemImage: "arrow.up.right").frame(maxWidth: .infinity) }.buttonStyle(PrimaryButtonStyle())
                    Button { openURL(URL(string: "https://casepad.fun\(path)")!) } label: { Label("Open in Safari", systemImage: "safari").frame(maxWidth: .infinity) }.buttonStyle(SecondaryButtonStyle())
                }.frame(maxWidth: .infinity).card(padding: 20, raised: true)
                Text("This screen needs your signed-in Casepad account (X or MetaMask via Privy). The native session is the next slice; until then the same account, keys and balances are shown on casepad.fun.").font(.system(size: 10)).foregroundStyle(Theme.muted)
            }.padding(16)
        }.background(Theme.background)
    }
}
