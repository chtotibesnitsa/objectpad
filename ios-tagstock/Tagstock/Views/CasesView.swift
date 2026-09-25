import SwiftUI

/// Cases marketplace: every open live round across coins (`GET /cases`).
struct CasesView: View {
    @Environment(AppStore.self) private var store
    @State private var query: String = ""

    private var cases: [OpenCase] {
        let q = query.lowercased()
        return (store.openCases?.cases ?? []).filter { q.isEmpty || "\($0.token?.name ?? "") \($0.token?.ticker ?? "") \($0.round.crateName)".lowercased().contains(q) }
            .sorted { $0.round.createdAt > $1.round.createdAt }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                let all = store.openCases?.cases ?? []
                SectionHead(title: "Cases", eyebrow: "\(all.count) open case\(all.count == 1 ? "" : "s") across \(Set(all.map(\.round.token)).count) coin\(Set(all.map(\.round.token)).count == 1 ? "" : "s") · \(all.reduce(0) { $0 + $1.round.available }) keys left")
                if let feed = store.openCases, !feed.live {
                    Label("Live cases are switched off by the operator right now. Cases are shown for review; no burn is requested until they are switched back on.", systemImage: "lock")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted).padding(12).background(Theme.secondary, in: .rect(cornerRadius: 10))
                }
                if store.openCases == nil {
                    ForEach(0..<3, id: \.self) { _ in SkeletonCard(height: 120) }
                } else if cases.isEmpty {
                    VStack(spacing: 12) {
                        Image("feat_cases").resizable().scaledToFit().frame(height: 90)
                        Text("No funded cases open yet").font(.system(size: 17, weight: .bold))
                        Text("Creators publish a case once their coin's treasury holds enough of the coin to cover every prize. Open a coin page to see its designs and funding.").font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    }.frame(maxWidth: .infinity).padding(24).background(Theme.card, in: .rect(cornerRadius: 14))
                } else {
                    ForEach(cases) { c in
                        NavigationLink(value: Route.token(c.round.token)) { OpenCaseRow(item: c) }.buttonStyle(PressableStyle())
                    }
                }
                Text("Every case pays out in the coin that was burned to open it. Odds are fixed and published before the round; each draw carries a public RNG record.").font(.system(size: 10)).foregroundStyle(Theme.muted)
            }.padding(16)
        }
        .background(Theme.background)
        .searchable(text: $query, prompt: "Search coins or cases")
        .refreshable { await store.refresh() }
    }
}

struct OpenCaseRow: View {
    let item: OpenCase
    private static let art = ["case_slate", "case_teal", "case_blue", "case_violet", "case_crimson", "case_gold"]
    var body: some View {
        let r = item.round
        let idx = abs(r.token.hashValue) % Self.art.count
        HStack(spacing: 12) {
            Image(Self.art[idx]).resizable().scaledToFit().frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 4) {
                HStack { Text(r.crateName).font(.system(size: 14, weight: .bold)).lineLimit(1); ModeBadge(mode: r.mode); Spacer() }
                Text("$\(item.token?.ticker ?? Format.shortAddress(r.token))").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    Text("Burn \(Format.units(r.entryUnits))").font(.system(size: 11, weight: .semibold))
                    Text("Best \(Format.units(item.bestPrizeUnits))").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.gold)
                }
                HStack {
                    Text("\(r.available)/\(r.entries) keys · \(item.opened) opened").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.up)
                    Spacer()
                    Text("\(item.market.burns) burns").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(12).background(Theme.card, in: .rect(cornerRadius: 12))
    }
}

struct BattlesView: View {
    @State private var battles: [Battle]?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Live Battles", eyebrow: "same case · same round · one shared reel")
                if let battles {
                    if battles.isEmpty {
                        VStack(spacing: 12) {
                            Image("feat_battles").resizable().scaledToFit().frame(height: 90)
                            Text("No battles open").font(.system(size: 17, weight: .bold))
                            Text("Battles are hosted from a coin page once a funded round is live. Two or four players open the same case; the highest pull takes the table.").font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                        }.frame(maxWidth: .infinity).padding(24).background(Theme.card, in: .rect(cornerRadius: 14))
                    }
                    ForEach(battles) { b in
                        NavigationLink(value: Route.token(b.token)) {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack { Text(b.crateName).font(.system(size: 14, weight: .bold)); Spacer(); Text(b.state.uppercased()).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(b.state == "live" ? Theme.up : Theme.muted) }
                                Text("$\(b.tokenInfo?.ticker ?? "") · host @\(b.host.handle) · \(b.participants.count)/\(b.size) seats").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                                Text(b.rules).font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(2)
                            }.padding(12).background(Theme.card, in: .rect(cornerRadius: 12))
                        }.buttonStyle(PressableStyle())
                    }
                } else if let error { ErrorState(message: error) { Task { await load() } } } else { SkeletonCard(height: 120) }
            }.padding(16)
        }
        .background(Theme.background).task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { battles = try await CasepadApi.shared.battles(); error = nil } catch { self.error = error.localizedDescription }
    }
}

struct QuestsView: View {
    @State private var quests: [Quest]?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Quests", eyebrow: "creator tasks that pay keys")
                if let quests {
                    if quests.isEmpty {
                        VStack(spacing: 12) {
                            Image("nav_quests").resizable().scaledToFit().frame(height: 80)
                            Text("No open quests").font(.system(size: 17, weight: .bold))
                            Text("Creators post quests from Creator Studio. Approved deliverables are paid in keys for that coin's cases.").font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                        }.frame(maxWidth: .infinity).padding(24).background(Theme.card, in: .rect(cornerRadius: 14))
                    }
                    ForEach(quests) { q in
                        NavigationLink(value: Route.token(q.token)) {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack { Text(q.title).font(.system(size: 14, weight: .bold)); Spacer(); Text("\(q.allocationsLeft)/\(q.allocationsTotal) left").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.up) }
                                Text(q.description).font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(3)
                                Text("$\(q.tokenInfo?.ticker ?? "") · \(q.quantity) \(q.tier) key\(q.quantity == 1 ? "" : "s") · closes \(Date(timeIntervalSince1970: Double(q.deadline) / 1000).formatted(date: .abbreviated, time: .omitted))").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                            }.padding(12).background(Theme.card, in: .rect(cornerRadius: 12))
                        }.buttonStyle(PressableStyle())
                    }
                } else if let error { ErrorState(message: error) { Task { await load() } } } else { SkeletonCard(height: 120) }
            }.padding(16)
        }
        .background(Theme.background).task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { quests = try await CasepadApi.shared.quests(); error = nil } catch { self.error = error.localizedDescription }
    }
}

struct LeaderboardView: View {
    @State private var pnl: [PnlRow] = []
    @State private var pnlNote: String = ""
    @State private var points: [LeaderboardRow] = []
    @State private var scoring: String = ""
    @State private var loaded = false
    @State private var board = 0
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Leaderboard", eyebrow: "verified results only")
                Picker("Board", selection: $board) { Text("Net P&L").tag(0); Text("Points").tag(1) }.pickerStyle(.segmented)
                if !loaded { SkeletonCard(height: 200) }
                else if board == 0 {
                    let rows = pnl.filter { Wei.isPositive($0.wonWei) || Wei.isPositive($0.spentWei) }
                    if rows.isEmpty { EmptyState(title: "Verified results will rank here.", body: pnlNote.isEmpty ? "Opened live cases and confirmed payouts feed this board." : pnlNote, systemImage: "trophy") }
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                            HStack {
                                Text(String(format: "%02d", i + 1)).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                                Text("@\(r.user.handle)").font(.system(size: 13, weight: .semibold))
                                Spacer()
                                Text("\(r.opens) opens").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                                Text(Format.eth(r.netWei, digits: 3)).font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(r.netWei.hasPrefix("-") ? Theme.down : Theme.up)
                            }.padding(.vertical, 10)
                            Divider().overlay(Theme.border)
                        }
                    }.padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
                } else {
                    if points.isEmpty { EmptyState(title: "No scored activity yet", body: scoring, systemImage: "trophy") }
                    VStack(spacing: 0) {
                        ForEach(Array(points.enumerated()), id: \.element.id) { i, r in
                            HStack {
                                Text(String(format: "%02d", i + 1)).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                                Text("@\(r.user.handle)").font(.system(size: 13, weight: .semibold))
                                Spacer()
                                Text("\(r.score) pts").font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(Theme.gold)
                            }.padding(.vertical, 10)
                            Divider().overlay(Theme.border)
                        }
                    }.padding(.horizontal, 12).background(Theme.card, in: .rect(cornerRadius: 12))
                    if !scoring.isEmpty { Text(scoring).font(.system(size: 10)).foregroundStyle(Theme.muted) }
                }
            }.padding(16)
        }
        .background(Theme.background).task { await load() }.refreshable { await load() }
    }
    private func load() async {
        let api = CasepadApi.shared
        if let p = try? await api.pnlBoard() { pnl = p.rows; pnlNote = p.note }
        if let l = try? await api.leaderboard() { points = l.rows; scoring = l.scoring }
        loaded = true
    }
}
