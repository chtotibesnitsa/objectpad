import SwiftUI
import PhotosUI

/// Paid Rewards board: who posted (ObjectPad / users), status, "best right now" ranking and live countdowns.
struct RewardsView: View {
    @Environment(AppStore.self) private var store
    @Environment(AccountStore.self) private var account
    @Environment(Router.self) private var router
    @State private var source: String = "all"
    @State private var status: String = "open"
    @State private var sort: RewardSort = .best
    @State private var query: String = ""

    private var all: [Reward] { store.rewards?.bounties ?? [] }
    private var list: [Reward] {
        all.filter { b in
            switch status { case "open": b.status == "open"; case "paid": b.status == "paid"; case "mine": b.mine || b.submissions.contains { $0.mine }; default: b.status != "cancelled" }
        }
        .filter { source == "all" || (source == "objectpad") == $0.isPlatform }
        .filter { query.isEmpty || "\($0.title) \($0.object) \($0.tagline)".localizedStandardContains(query) }
        .ranked(by: sort)
    }
    private func openCount(_ src: String) -> Int { all.filter { $0.status == "open" && (src == "all" || (src == "objectpad") == $0.isPlatform) }.count }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14, pinnedViews: [.sectionHeaders]) {
                hero.enter()
                Section {
                    if store.rewards == nil { ForEach(0..<3, id: \.self) { _ in Shimmer().frame(height: 300).clipShape(RoundedRectangle(cornerRadius: 28)) } }
                    else if list.isEmpty { empty }
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, r in
                        Button { router.push(.reward(r.id)) } label: { RewardCard(reward: r) }.buttonStyle(.press).enter(Double(min(i, 6)) * 0.05)
                    }
                    postTile
                } header: { filters }
                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.refreshRewards() }
        .toolbar(.hidden, for: .navigationBar)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Lab("ObjectPad · Paid Rewards", color: .white.opacity(0.75)); Spacer(); HStack(spacing: 5) { PulseDot(color: .white, size: 6); Text("LIVE").font(Typeface.mono(10, 800)) }.foregroundStyle(.white) }
            Display("Scan it first.\nGet paid.", size: 40, color: .white)
            Text("Cash bounties for finding, scanning and tokenizing real objects. Rewards only go up.").font(Typeface.sans(14.5, 650)).foregroundStyle(.white.opacity(0.85))
            HStack(spacing: 8) {
                StatTile(label: "Open", value: Fmt.money(store.rewards?.stats?.openUsd ?? 0), dark: true)
                StatTile(label: "Paid", value: Fmt.money(store.rewards?.stats?.paidUsd ?? 0), dark: true)
                StatTile(label: "Escrow", value: String(format: "%.3f Ξ", store.rewards?.stats?.escrowEth ?? 0), dark: true)
            }
            PadButton(title: "Post a bounty", icon: "plus", kind: .pearl) { account.signedIn ? (router.creatingReward = true) : (router.signIn = true) }
        }
        .padding(20)
        .background {
            ZStack { Pad.skyGradient; CloudDrift(); VoxelField(count: 22, seed: 4).mask(LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)); LinearGradient(colors: [.clear, Pad.ink.opacity(0.35)], startPoint: .top, endPoint: .bottom) }
                .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous)).shadow(color: Pad.sky.opacity(0.35), radius: 22, y: 12)
        }
        .padding(.top, 6)
    }

    private var filters: some View {
        VStack(spacing: 9) {
            InkSegmented(options: [("all", "Everyone · \(openCount("all"))"), ("objectpad", "ObjectPad · \(openCount("objectpad"))"), ("community", "Users · \(openCount("community"))")], selection: $source)
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    ForEach([("open", "Open now"), ("all", "All"), ("paid", "Paid out"), ("mine", "Mine")], id: \.0) { id, l in Pill(title: l, on: status == id) { withAnimation(.snappy) { status = id } } }
                    Rectangle().fill(Pad.ink.opacity(0.15)).frame(width: 1, height: 22)
                    ForEach(RewardSort.allCases) { s in Pill(title: s.rawValue, icon: s == .best ? "sparkles" : s == .ending ? "timer" : s == .biggest ? "banknote" : "clock", on: sort == s, accent: Pad.sky) { withAnimation(.snappy) { sort = s } } }
                }
            }
            .scrollIndicators(.hidden)
        }
        .padding(.vertical, 8)
        .background(Pad.paper.opacity(0.94))
    }

    private var empty: some View {
        VStack(spacing: 8) {
            GlassIcon(name: "glass_diamond", size: 70, float: true)
            Text(status == "mine" ? (account.signedIn ? "Nothing yet. Post a bounty or send a proof." : "Sign in to see your bounties and proofs.") : "No bounties match.").font(Typeface.sans(14.5, 700)).foregroundStyle(Pad.muted).multilineTextAlignment(.center)
        }
        .padding(.vertical, 30)
    }

    private var postTile: some View {
        Button { account.signedIn ? (router.creatingReward = true) : (router.signIn = true) } label: {
            VStack(spacing: 10) {
                Image(systemName: "plus").font(.system(size: 26, weight: .bold)).foregroundStyle(.white).frame(width: 60, height: 60).background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Pad.ink))
                Display("Your bounty here", size: 22)
                Text("Name an object, lock the reward in escrow, watch hunters go find it.").font(Typeface.sans(13, 600)).foregroundStyle(Pad.muted).multilineTextAlignment(.center)
            }
            .padding(24).frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Pad.ink.opacity(0.15), style: StrokeStyle(lineWidth: 2, dash: [8, 6])))
        }
        .buttonStyle(.press)
    }
}

struct RewardCard: View {
    let reward: Reward
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.aspectRatio(16 / 9, contentMode: .fit)
                .overlay { SkyPoster(reward: reward, reveal: !reward.adult).allowsHitTesting(false) }
                .overlay(alignment: .topLeading) { RewardStatusPill(reward: reward).padding(10) }
                .overlay(alignment: .topTrailing) { Text(Fmt.money(reward.rewardUsd)).font(Typeface.display(22)).foregroundStyle(.white).padding(.horizontal, 12).padding(.vertical, 6).background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Pad.ink.opacity(0.85))).padding(10) }
                .overlay(alignment: .bottomLeading) { if reward.status == "open" { CountdownPill(deadline: reward.deadline).padding(10) } }
                .overlay(alignment: .bottomTrailing) {
                    if !reward.isPlatform && reward.status == "open" { Label("ESCROWED", systemImage: "lock.fill").font(Typeface.mono(10, 800)).foregroundStyle(Pad.ink).padding(.horizontal, 9).padding(.vertical, 5).background(Capsule().fill(.white.opacity(0.92))).padding(10) }
                }
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Lab("\(reward.categoryLabel) · \(reward.isPlatform ? "ObjectPad" : "Community")")
                Text(reward.title).font(Typeface.display(22)).foregroundStyle(Pad.ink).multilineTextAlignment(.leading)
                if !reward.tagline.isEmpty { Text(reward.tagline).font(Typeface.sans(13.5, 600)).foregroundStyle(Pad.muted).lineLimit(2).multilineTextAlignment(.leading) }
                HStack {
                    Text(reward.poster.map { $0.handle.isEmpty ? ($0.name.isEmpty ? "Anonymous" : $0.name) : "@\($0.handle)" } ?? "ObjectPad").font(Typeface.sans(13, 750)).foregroundStyle(Pad.ink.opacity(0.7))
                    Spacer()
                    Text("\(reward.submissions.count) proofs").font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted)
                    Image(systemName: "arrow.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Pad.muted)
                }
                .padding(.top, 4)
            }
            .padding(16)
        }
        .raised(26)
    }
}

// MARK: - Detail

struct RewardDetailView: View {
    let id: String
    @Environment(AccountStore.self) private var account
    @Environment(AppStore.self) private var store
    @Environment(Router.self) private var router
    @State private var reward: Reward?
    @State private var error: String?
    @State private var reveal: Bool = false
    @State private var confirmCancel: Bool = false
    @State private var busy: Bool = false

    private var api: RewardsApi { RewardsApi(account: account) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let r = reward {
                    poster(r).enter()
                    info(r).enter(0.05)
                    if let w = winnerView(r) { w.enter(0.08) }
                    if r.mine && !r.isPlatform && (r.status == "draft" || r.status == "open") { CoverStudioCard(reward: r) { reward = $0 }.enter(0.1) }
                    if r.mine && r.status == "draft" { FundCard(reward: r) { reward = $0; Feedback.success(.seal) }.enter(0.12) }
                    if r.status == "open" && !r.mine { ProofForm(reward: r) { Task { await load() } }.enter(0.12) }
                    proofs(r).enter(0.15)
                    if !r.isPlatform, r.status != "draft", let e = r.escrow { escrow(r, e).enter(0.18) }
                    if r.mine && !r.isPlatform && (r.status == "open" || r.status == "draft") { cancelCard(r) }
                    if !r.audit.isEmpty { audit(r).enter(0.2) }
                } else if let error { ContentUnavailableView("Bounty not found", systemImage: "questionmark.circle", description: Text(error)).padding(.top, 60) }
                else { ProgressView().frame(maxWidth: .infinity).padding(.top, 120) }
                Color.clear.frame(height: 100)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(Pad.page.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if let r = reward { ToolbarItem(placement: .topBarTrailing) { ShareLink(item: URL(string: "https://objectpad.fun/rewards/\(r.id)")!, message: Text(r.status == "paid" ? "Winner paid: \(r.title) · \(Fmt.money(r.rewardUsd)) on @ObjectPadFun" : "\(r.title) · \(Fmt.money(r.rewardUsd)) bounty on @ObjectPadFun. First real scan wins.")) { Image(systemName: "square.and.arrow.up") } } } }
        .task(id: id) { while !Task.isCancelled { await load(); try? await Task.sleep(for: .seconds(reward?.painting == true || reward?.status == "paying" ? 4 : 15)) } }
        .refreshable { await load() }
    }

    private func load() async {
        do { let r = try await api.detail(id); withAnimation(.snappy) { reward = r }; error = nil }
        catch { if reward == nil { self.error = error.localizedDescription } }
    }

    private func poster(_ r: Reward) -> some View {
        Button { if r.adult { withAnimation { reveal = true } } } label: {
            Color.clear.aspectRatio(16 / 10, contentMode: .fit)
                .overlay { SkyPoster(reward: r, big: true, reveal: !r.adult || reveal).allowsHitTesting(false) }
                .overlay(alignment: .topLeading) { RewardStatusPill(reward: r).padding(12) }
                .overlay(alignment: .topTrailing) { Text(Fmt.money(r.rewardUsd)).font(Typeface.display(28)).foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 7).background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Pad.ink.opacity(0.85))).padding(12) }
                .overlay(alignment: .bottomLeading) { if r.status == "open" { CountdownPill(deadline: r.deadline, big: true).padding(12) } }
                .overlay { if r.status == "paid" { ConfettiBurst() } }
                .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                .shadow(color: Pad.sky.opacity(0.3), radius: 18, y: 10)
        }
        .buttonStyle(.quiet)
    }

    private func info(_ r: Reward) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Lab("\(r.categoryLabel) · \(r.isPlatform ? "ObjectPad bounty" : "Community bounty") · posted \(r.postedAt)")
            Display(r.title, size: 32)
            if !r.tagline.isEmpty { Text(r.tagline).font(Typeface.sans(16, 650)).foregroundStyle(Pad.ink.opacity(0.75)) }
            ScrollView(.horizontal) { HStack(spacing: 6) { ForEach(r.rules, id: \.self) { rule in Label(rule, systemImage: "checkmark").font(Typeface.sans(12.5, 750)).padding(.horizontal, 11).padding(.vertical, 7).sunk(14) } } }.scrollIndicators(.hidden)
            if let promo = r.promoUrl, let u = URL(string: promo), !promo.isEmpty { Link(destination: u) { Label(u.host() ?? promo, systemImage: "link").font(Typeface.mono(12, 700)) }.foregroundStyle(Pad.ink) }
        }
    }

    private func winnerView(_ r: Reward) -> AnyView? {
        let win = r.submissions.first { $0.state == "paid" || $0.state == "winner" }
        guard win != nil || r.winner != nil else { return nil }
        let tx = win?.payoutTx ?? r.payoutTx
        return AnyView(VStack(alignment: .leading, spacing: 8) {
            Label(r.status == "paid" ? "Winner paid · confirmed" : "Payout sending…", systemImage: "crown.fill").font(Typeface.mono(11, 800)).foregroundStyle(Pad.up)
            Text(win?.who ?? r.winner.map { $0.handle.map { "@\($0)" } ?? "\($0.coinName) · \(Fmt.short($0.creatorWallet))" } ?? "Winner").font(Typeface.sans(17, 800))
            if let tx { Link("View payout ↗", destination: Chain.txURL(tx)).font(Typeface.sans(13.5, 800)).foregroundStyle(Pad.up) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).raised(24)
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Pad.up, lineWidth: 2)))
    }

    private func proofs(_ r: Reward) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom) { Display("Proofs", size: 26); Spacer(); Text("\(r.submissions.count) total").font(Typeface.mono(12, 700)).foregroundStyle(Pad.muted) }
            if r.submissions.isEmpty {
                VStack(spacing: 8) { Image(systemName: "camera.viewfinder").font(.system(size: 30)).foregroundStyle(Pad.muted); Text(r.status == "paid" ? "Settled by the ObjectPad team." : "No proofs yet. The first real one takes it.").font(Typeface.sans(14, 750)) }
                    .frame(maxWidth: .infinity).padding(24).sunk(24)
            }
            ForEach(r.submissions) { p in ProofCard(proof: p, reward: r) { reward = $0 } }
        }
    }

    private func escrow(_ r: Reward, _ e: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Escrow", systemImage: "lock.shield.fill").font(Typeface.sans(15, 800))
            row("Locked", String(format: "%.6f ETH", r.rewardEth ?? 0), nil)
            row("Wallet", Fmt.short(e), Chain.addressURL(e))
            if let f = r.fundTx { row("Deposit", Fmt.short(f, lead: 8, tail: 6), Chain.txURL(f)) }
            if let f = r.refundTx { row("Refund", Fmt.short(f, lead: 8, tail: 6), Chain.txURL(f)) }
        }
        .padding(16).raised(24)
    }

    @ViewBuilder private func row(_ k: String, _ v: String, _ url: URL?) -> some View {
        HStack { Text(k).font(Typeface.sans(13, 650)).foregroundStyle(Pad.muted); Spacer()
            if let url { Link(v, destination: url).font(Typeface.mono(12, 700)).foregroundStyle(Pad.ink) } else { Text(v).font(Typeface.mono(12, 700)) } }
    }

    private func cancelCard(_ r: Reward) -> some View {
        let pending = r.submissions.filter { $0.state == "submitted" }.count
        return VStack(spacing: 10) {
            if confirmCancel {
                Text(r.status == "draft" ? "Delete this draft?" : pending > 0 ? "Pick a winner or reject the waiting proofs first." : String(format: "Refund %.5f ETH to the funding wallet and close the bounty?", r.rewardEth ?? 0)).font(Typeface.sans(13.5, 700)).multilineTextAlignment(.center)
                HStack { PadButton(title: "Keep it", kind: .ghost, height: 46) { confirmCancel = false }
                    PadButton(title: "Confirm", kind: .down, busy: busy, enabled: !(pending > 0 && r.status == "open"), height: 46) { Task { busy = true; if let u = try? await api.cancel(r.id) { reward = u; Feedback.success() } else { Feedback.error() }; busy = false; confirmCancel = false } } }
            } else {
                Button { confirmCancel = true } label: { Label(r.status == "draft" ? "Delete draft" : "Cancel & refund", systemImage: "trash").font(Typeface.sans(14, 800)).foregroundStyle(Pad.down).frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.press)
            }
        }
        .padding(14).sunk(22)
    }

    private func audit(_ r: Reward) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Lab("Public audit log", color: .white.opacity(0.55))
            ForEach(Array(r.audit.enumerated()), id: \.offset) { _, a in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(a.event.replacingOccurrences(of: "_", with: " ").uppercased()) · \(Fmt.ago(a.at))").font(Typeface.mono(10, 700)).foregroundStyle(.white.opacity(0.45))
                    Text(a.detail).font(Typeface.sans(13, 600)).foregroundStyle(.white.opacity(0.88))
                    if let tx = a.tx { Link(Fmt.short(tx, lead: 8, tail: 6), destination: Chain.txURL(tx)).font(Typeface.mono(11, 700)).foregroundStyle(.white.opacity(0.65)) }
                }
                .padding(.leading, 10).overlay(alignment: .leading) { Rectangle().fill(.white.opacity(0.15)).frame(width: 1) }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).smoke(24)
    }
}

// MARK: - Photo picking

/// Big tappable photo drop: pick from Photos, see it full-width, replace or remove.
struct PhotoDrop: View {
    let photo: RewardPhoto?
    let busy: Bool
    let title: String
    let subtitle: String
    let onImage: (UIImage) -> Void
    let onClear: () -> Void
    @State private var item: PhotosPickerItem?
    var body: some View {
        PhotosPicker(selection: $item, matching: .images) {
            ZStack {
                if let photo, let url = URL(string: photo.url) {
                    Color.clear.aspectRatio(16 / 10, contentMode: .fit).overlay { RemoteImage(url: url).allowsHitTesting(false) }
                        .overlay(alignment: .bottom) {
                            HStack { Label("Replace", systemImage: "arrow.triangle.2.circlepath").font(Typeface.sans(13, 800)).foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 9).background(Capsule().fill(Pad.ink.opacity(0.85)))
                                Spacer()
                                Button(action: onClear) { Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Pad.ink).frame(width: 36, height: 36).background(Circle().fill(.white)) } }
                            .padding(10)
                        }
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: busy ? "hourglass" : "photo.badge.plus").font(.system(size: 22, weight: .bold)).foregroundStyle(.white).frame(width: 56, height: 56).background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Pad.ink)).symbolEffect(.pulse, isActive: busy)
                        Text(busy ? "Uploading…" : title).font(Typeface.sans(15, 800)).foregroundStyle(Pad.ink)
                        Text(subtitle).font(Typeface.sans(12.5, 600)).foregroundStyle(Pad.muted).multilineTextAlignment(.center)
                    }
                    .padding(22).frame(maxWidth: .infinity, minHeight: 160)
                }
                if busy && photo != nil { Color.black.opacity(0.35); ProgressView().tint(.white) }
            }
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(.white))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Pad.ink.opacity(0.18), style: StrokeStyle(lineWidth: 2, dash: photo == nil ? [8, 6] : [])))
        }
        .buttonStyle(.press)
        .onChange(of: item) { _, i in
            guard let i else { return }
            Task { if let d = try? await i.loadTransferable(type: Data.self), let img = UIImage(data: d) { onImage(img) }; item = nil }
        }
    }
}

/// Poster tools after posting: regenerate the AI cover, repaint from a photo, or use the photo itself.
struct CoverStudioCard: View {
    let reward: Reward
    let onUpdate: (Reward) -> Void
    @Environment(AccountStore.self) private var account
    @State private var photo: RewardPhoto?
    @State private var busy: Bool = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Cover studio", systemImage: "wand.and.stars").font(Typeface.sans(16, 800))
            HStack(spacing: 8) {
                PadButton(title: reward.painting ? "Painting…" : photo != nil ? "Repaint from photo" : "Regenerate", icon: "sparkles", kind: .sky, busy: reward.painting, enabled: !busy, height: 50) { act("ai") }
                PadButton(title: "Use as cover", icon: "photo", kind: .ink, enabled: photo != nil && !busy, height: 50) { act("upload") }
            }
            PhotoDrop(photo: photo, busy: busy, title: "Add a photo", subtitle: "Use it as the cover, or let the AI repaint the poster inspired by it.", onImage: upload, onClear: { photo = nil })
            if let error { ErrorBanner(message: error) }
        }
        .padding(16).raised(26)
    }
    private func upload(_ img: UIImage) {
        guard let jpeg = img.jpeg() else { return }
        busy = true
        Task { do { photo = try await RewardsApi(account: account).upload(jpeg) } catch { self.error = error.localizedDescription }; busy = false }
    }
    private func act(_ mode: String) {
        busy = true; error = nil
        Task {
            do { onUpdate(try await RewardsApi(account: account).cover(reward.id, mode: mode, photo: photo?.hash ?? "")); Feedback.success() }
            catch { self.error = error.localizedDescription; Feedback.error() }
            busy = false
        }
    }
}

/// Lock the reward in escrow: one tap from this device's wallet, or paste a hash from any wallet.
struct FundCard: View {
    let reward: Reward
    let onFunded: (Reward) -> Void
    @Environment(AccountStore.self) private var account
    @Environment(AppStore.self) private var store
    @State private var hash: String = ""
    @State private var busy: String?
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Lab("Lock in escrow", color: .white.opacity(0.55))
            Text(String(format: "%.6f ETH", reward.rewardEth ?? 0)).font(Typeface.display(32)).foregroundStyle(.white)
            Text("= \(Fmt.money(reward.rewardUsd)) · Robinhood Chain (4663)").font(Typeface.mono(11.5, 700)).foregroundStyle(.white.opacity(0.55))
            if let e = reward.escrow {
                Button { UIPasteboard.general.string = e; store.show("Escrow address copied") } label: {
                    HStack { Text(e).font(Typeface.mono(11.5, 700)).lineLimit(1).minimumScaleFactor(0.7); Spacer(); Image(systemName: "doc.on.doc") }.foregroundStyle(.white).padding(12).background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.1)))
                }.buttonStyle(.press)
            }
            PadButton(title: busy ?? "Fund from my wallet", icon: "wallet.bifold.fill", kind: .pearl, busy: busy != nil) { Task { await payFromWallet() } }
            Text("Or send from any wallet and paste the tx hash").font(Typeface.sans(12.5, 650)).foregroundStyle(.white.opacity(0.6))
            HStack {
                TextField("0x…", text: $hash).font(Typeface.mono(12.5, 600)).foregroundStyle(.white).autocorrectionDisabled().textInputAutocapitalization(.never).padding(12).background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.1)))
                Button("Verify") { Task { await verify(hash) } }.font(Typeface.sans(13.5, 800)).foregroundStyle(Pad.ink).padding(.horizontal, 14).frame(height: 44).background(Capsule().fill(.white)).disabled(!Chain.isHash(hash)).opacity(Chain.isHash(hash) ? 1 : 0.4)
            }
            if let error { Text(error).font(Typeface.sans(12.5, 700)).foregroundStyle(Color(hex: 0xFF8A8E)) }
            Text("Goes live the moment the deposit is confirmed. Cancel before anyone submits proof for a full refund (minus network fee).").font(Typeface.sans(11.5, 600)).foregroundStyle(.white.opacity(0.5))
        }
        .padding(18).smoke(26)
    }
    private func payFromWallet() async {
        error = nil
        do {
            let signer = try account.signer()
            busy = "Sending…"
            let h = try await signer.send(TxRequest(to: reward.escrow ?? "", value: BigUInt(decimal: reward.rewardWei ?? "0") ?? .zero))
            hash = h; busy = "Confirming…"
            try await ChainClient.shared.waitForReceipt(h)
            await verify(h)
        } catch { self.error = error.localizedDescription; Feedback.error() }
        busy = nil
    }
    private func verify(_ h: String) async {
        busy = "Verifying…"
        do { onFunded(try await RewardsApi(account: account).fund(reward.id, hash: h)) } catch { self.error = error.localizedDescription; Feedback.error() }
        busy = nil
    }
}

struct ProofForm: View {
    let reward: Reward
    let onSent: () -> Void
    @Environment(AccountStore.self) private var account
    @Environment(Router.self) private var router
    @State private var photo: RewardPhoto?
    @State private var coin: String = ""
    @State private var note: String = ""
    @State private var busy: Bool = false
    @State private var error: String?
    @State private var sent: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(sent ? "Proof sent" : "Send your proof", systemImage: sent ? "checkmark.seal.fill" : "camera.fill").font(Typeface.sans(16, 800)).foregroundStyle(sent ? Pad.up : Pad.ink)
            if sent { Text("The poster reviews proofs in order. You’re paid straight to your wallet if you win.").font(Typeface.sans(13.5, 600)).foregroundStyle(Pad.muted) }
            else if !account.signedIn {
                Text("Sign in so the reward can be paid to your wallet.").font(Typeface.sans(13.5, 600)).foregroundStyle(Pad.muted)
                PadButton(title: "Sign in to hunt", icon: "person.crop.circle") { router.signIn = true }
            } else {
                PhotoDrop(photo: photo, busy: busy, title: "Photo of the real object", subtitle: "Location data is stripped on upload.", onImage: upload, onClear: { photo = nil })
                PadField(label: "Your ObjectPad coin (optional)", placeholder: "0x… or objectpad.fun link", text: $coin, mono: true)
                PadField(label: "Note (optional)", placeholder: "Where you found it…", text: $note)
                if let error { ErrorBanner(message: error) }
                PadButton(title: "Submit proof", icon: "paperplane.fill", busy: busy, enabled: photo != nil || !coin.isEmpty) { submit() }
            }
        }
        .padding(16).raised(26)
    }
    private func upload(_ img: UIImage) {
        guard let jpeg = img.jpeg() else { return }
        busy = true
        Task { do { photo = try await RewardsApi(account: account).upload(jpeg) } catch { self.error = error.localizedDescription }; busy = false }
    }
    private func submit() {
        busy = true; error = nil
        Task {
            do { _ = try await RewardsApi(account: account).submit(reward.id, photo: photo?.hash ?? "", coin: coin.trimmingCharacters(in: .whitespaces), note: note.trimmingCharacters(in: .whitespaces)); withAnimation(.spring) { sent = true }; Feedback.success(.seal); onSent() }
            catch { self.error = error.localizedDescription; Feedback.error() }
            busy = false
        }
    }
}

struct ProofCard: View {
    let proof: RewardProof
    let reward: Reward
    let onUpdate: (Reward) -> Void
    @Environment(AccountStore.self) private var account
    @State private var rejecting: Bool = false
    @State private var reason: String = ""
    @State private var busy: Bool = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let u = URL(string: proof.photo), !proof.photo.isEmpty {
                Color.clear.aspectRatio(4 / 3, contentMode: .fit).overlay { RemoteImage(url: u).allowsHitTesting(false) }.clipped()
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(proof.who).font(Typeface.sans(14.5, 800)).lineLimit(1)
                    Spacer()
                    let (l, c): (String, Color) = proof.state == "paid" ? ("PAID", Pad.up) : proof.state == "winner" ? ("WINNER", Pad.up) : proof.state == "rejected" ? ("NOT ACCEPTED", Pad.down) : ("IN REVIEW", Pad.muted)
                    Text(l).font(Typeface.mono(10, 800)).foregroundStyle(c)
                }
                if !proof.coinSymbol.isEmpty { Text("Coin $\(proof.coinSymbol) · \(proof.coinName)").font(Typeface.mono(11.5, 700)) }
                if !proof.note.isEmpty { Text(proof.note).font(Typeface.sans(13, 600)).foregroundStyle(Pad.muted) }
                if !proof.reviewNote.isEmpty { Text("“\(proof.reviewNote)”").font(Typeface.sans(13, 650)).foregroundStyle(Pad.down) }
                Text(Fmt.ago(proof.createdAt)).font(Typeface.mono(10.5, 600)).foregroundStyle(Pad.muted)
                if reward.mine && !reward.isPlatform && reward.status == "open" && proof.state == "submitted" {
                    if rejecting {
                        PadField(label: "Public reason", placeholder: "Not the right object…", text: $reason)
                        HStack { PadButton(title: "Cancel", kind: .ghost, height: 44) { rejecting = false }
                            PadButton(title: "Reject", kind: .down, busy: busy, enabled: reason.count >= 3, height: 44) { act { try await RewardsApi(account: account).reject(proof.id, note: reason) } } }
                    } else {
                        HStack { PadButton(title: "Pay winner", icon: "crown.fill", kind: .up, busy: busy, height: 46) { act { try await RewardsApi(account: account).payout(proof.id) } }
                            PadButton(title: "Reject", kind: .ghost, height: 46) { rejecting = true } }
                    }
                }
                if let error { Text(error).font(Typeface.sans(12, 700)).foregroundStyle(Pad.down) }
            }
            .padding(14)
        }
        .raised(24)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
    private func act(_ block: @escaping () async throws -> Reward) {
        busy = true; error = nil
        Task { do { onUpdate(try await block()); Feedback.success(.coins) } catch { self.error = error.localizedDescription; Feedback.error() }; busy = false }
    }
}
