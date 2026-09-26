import SwiftUI

/// One-tap sign-in: Apple, X, Google or an email code. Optional: scanning and launching never need it.
struct SignInSheet: View {
    @Environment(AccountStore.self) private var account
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var email: String = ""
    @State private var code: String = ""
    @State private var codeSent: Bool = false
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Capsule().fill(Pad.ink.opacity(0.15)).frame(width: 40, height: 5).padding(.top, 8)
                Image("rubber_duck_voxel_dissolve").resizable().scaledToFit().frame(height: 130).modifier(Bob())
                Display("Sign in to ObjectPad", size: 30).multilineTextAlignment(.center)
                Text("Same account and wallet as objectpad.fun. Needed for bounties, Post & earn and free claim gas. Launching stays free without one.").font(Typeface.sans(14, 600)).foregroundStyle(Pad.muted).multilineTextAlignment(.center)
                if !account.signInAvailable {
                    ErrorBanner(message: "Sign-in isn’t switched on in this build yet. You can still scan, launch and claim as a guest.")
                } else {
                    provider("Continue with Apple", "apple.logo", Pad.ink, .white) { try await account.loginApple() }
                    provider("Continue with X", "xmark", .white, Pad.ink) { try await account.loginX() }
                    provider("Continue with Google", "g.circle.fill", .white, Pad.ink) { try await account.loginGoogle() }
                    HStack { Rectangle().fill(Pad.ink.opacity(0.1)).frame(height: 1); Text("or email").font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted); Rectangle().fill(Pad.ink.opacity(0.1)).frame(height: 1) }
                    if codeSent {
                        PadField(label: "Code sent to \(email)", placeholder: "123456", text: $code, mono: true, keyboard: .numberPad)
                        PadButton(title: "Verify & sign in", busy: busy == "email", enabled: code.count >= 6) { go("email") { try await account.loginEmail(code: code, email: email) } }
                        Button("Use a different email") { withAnimation { codeSent = false; code = "" } }.font(Typeface.sans(13, 750)).foregroundStyle(Pad.muted)
                    } else {
                        PadField(label: "", placeholder: "you@email.com", text: $email, mono: true, keyboard: .emailAddress)
                        PadButton(title: "Email me a code", icon: "envelope.fill", kind: .ghost, busy: busy == "send", enabled: email.contains("@") && email.contains(".")) {
                            busy = "send"; error = nil
                            Task { do { try await account.sendEmailCode(email.trimmingCharacters(in: .whitespaces)); withAnimation { codeSent = true } } catch { self.error = error.localizedDescription }; busy = nil }
                        }
                    }
                }
                if let error { ErrorBanner(message: error) }
            }
            .padding(20)
        }
        .background(Pad.page.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationCornerRadius(34)
    }

    private func provider(_ title: String, _ icon: String, _ bg: Color, _ fg: Color, _ action: @escaping () async throws -> Void) -> some View {
        Button { go(title, action) } label: {
            HStack(spacing: 10) {
                if busy == title { ProgressView().tint(fg) } else { Image(systemName: icon).font(.system(size: 17, weight: .bold)) }
                Text(title).font(Typeface.sans(15.5, 800))
            }
            .foregroundStyle(fg).frame(maxWidth: .infinity, minHeight: 54)
            .background(Capsule().fill(bg).shadow(color: Pad.ink.opacity(0.08), radius: 8, y: 4))
            .overlay(Capsule().stroke(Pad.ink.opacity(bg == .white ? 0.1 : 0), lineWidth: 1))
        }
        .buttonStyle(.press)
        .disabled(busy != nil)
    }

    private func go(_ key: String, _ action: @escaping () async throws -> Void) {
        busy = key; error = nil
        Task {
            do { try await action(); Feedback.success(); store.show("Signed in"); await store.refreshRewards(); dismiss() }
            catch { self.error = error.localizedDescription; Feedback.error() }
            busy = nil
        }
    }
}

struct AccountSheet: View {
    @Environment(AccountStore.self) private var account
    @Environment(AppStore.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var alias: String = ""
    @State private var sound: Bool = Feedback.soundOn
    @State private var saving: Bool = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Image("duck_mark").resizable().frame(width: 54, height: 54).clipShape(Circle())
                        VStack(alignment: .leading, spacing: 2) { Text(account.displayName).font(Typeface.sans(18, 800)); Text(account.signedIn ? "Signed in" : "Guest · launches never need an account").font(Typeface.sans(12.5, 600)).foregroundStyle(Pad.muted) }
                    }
                    if account.signedIn {
                        HStack { TextField("Public creator name", text: $alias); Button("Save") { saving = true; Task { try? await account.setAlias(alias); saving = false; Feedback.success() } }.disabled(alias.count < 2 || saving) }
                    } else {
                        Button { dismiss(); router.signIn = true } label: { Label("Sign in or create account", systemImage: "person.crop.circle.badge.plus") }
                    }
                }
                Section("Explore") {
                    row("Buyback & burn", "flame.fill") { router.push(.burn) }
                    row("Post & earn", "dollarsign.circle.fill") { router.push(.earn) }
                    row("Your coins", "square.stack.3d.up.fill") { router.push(.launches) }
                    Link(destination: URL(string: "https://www.objectpad.fun")!) { Label("objectpad.fun", systemImage: "safari") }
                    Link(destination: URL(string: "https://x.com/ObjectPadFun")!) { Label("@ObjectPadFun on X", systemImage: "at") }
                }
                Section("Settings") {
                    Toggle(isOn: $sound) { Label("Sounds", systemImage: "speaker.wave.2.fill") }.onChange(of: sound) { _, v in Feedback.soundOn = v; if v { Feedback.play(.success) } }
                }
                Section {
                    Text("$OBJECTPAD · \(Fmt.short(Chain.objectpadToken, lead: 8, tail: 6))").font(Typeface.mono(12, 700)).foregroundStyle(Pad.muted)
                    if account.signedIn { Button("Sign out", role: .destructive) { Task { await account.logout(); dismiss() } } }
                }
            }
            .tint(Pad.ink)
            .navigationTitle("Account").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .onAppear { alias = account.profile?.alias ?? "" }
        }
    }

    private func row(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button { dismiss(); action() } label: { Label(title, systemImage: icon).foregroundStyle(Pad.ink) }
    }
}

/// Buyback & burn: every trade's protocol share buys $OBJECTPAD and burns it on a schedule.
struct BurnView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack { Lab("Buyback & burn", color: .white.opacity(0.6)); Spacer(); if store.burns?.live == true { HStack(spacing: 5) { PulseDot(color: Pad.amber, size: 6); Text("LIVE").font(Typeface.mono(10, 800)).foregroundStyle(.white) } } }
                    GlassIcon(name: "glass_burn", size: 90, float: true).frame(maxWidth: .infinity)
                    RollingText(text: "\(Fmt.compact(BigUInt(decimal: store.burns?.totalTokens ?? "0")?.toDouble() ?? 0)) burned", font: Typeface.display(36), color: .white)
                    Text("\(BigUInt(decimal: store.burns?.totalEth ?? "0")?.formatUnits(digits: 4) ?? "0") ETH of fees spent buying $OBJECTPAD · \(store.burns?.burns ?? 0) burns").font(Typeface.sans(13.5, 650)).foregroundStyle(.white.opacity(0.7))
                    if let next = store.burns?.nextAt { TimelineView(.periodic(from: .now, by: 1)) { ctx in let s = max(0, Int(next / 1000 - ctx.date.timeIntervalSince1970)); Text(String(format: "Next burn in %d:%02d", s / 60, s % 60)).font(Typeface.mono(13, 800)).foregroundStyle(Pad.amber).contentTransition(.numericText()) } }
                }
                .padding(18).smoke(28).enter()
                ForEach(Array((store.burns?.items ?? []).prefix(20).enumerated()), id: \.element.id) { i, b in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) { Text("\(Fmt.compact(BigUInt(decimal: b.tokensBurned)?.toDouble() ?? 0)) $OBJECTPAD").font(Typeface.sans(14.5, 800)); Text("\(BigUInt(decimal: b.ethIn)?.formatUnits(digits: 5) ?? "0") ETH · \(Fmt.ago(b.at))").font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted) }
                        Spacer()
                        if let h = b.hash { Link(destination: Chain.txURL(h)) { Image(systemName: "arrow.up.right.circle.fill").font(.system(size: 22)).foregroundStyle(Pad.ink) } }
                    }
                    .padding(14).raised(20).enter(Double(min(i, 8)) * 0.04)
                }
                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 16)
        }
        .background(Pad.page.ignoresSafeArea())
        .navigationTitle("Burn").navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshBurns() }
    }
}

/// Post & earn: get paid in ETH for verified X posts that include the $OBJECTPAD address.
struct EarnView: View {
    @Environment(AccountStore.self) private var account
    @Environment(Router.self) private var router
    @Environment(AppStore.self) private var store
    @State private var market: EarnMarket?
    @State private var board: Leaderboard?
    @State private var me: EarnMe?
    @State private var url: String = ""
    @State private var busy: Bool = false
    @State private var message: String?

    private var postText: String { "Scanning real objects into coins on @ObjectPadFun 🦆\n\n$OBJECTPAD \(Chain.objectpadToken)\n\nobjectpad.fun" }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    Lab("Post & earn", color: .white.opacity(0.6))
                    Display("Post about ObjectPad.\nGet paid in ETH.", size: 30, color: .white)
                    HStack(spacing: 8) {
                        StatTile(label: "Per post now", value: Fmt.usd(market?.rewardUsd ?? 0), dark: true)
                        StatTile(label: "Paid out", value: Fmt.money(board?.totals?.paidUsd ?? 0), dark: true)
                    }
                    if let m = market { VStack(alignment: .leading, spacing: 6) { Text("Next reward \(Fmt.usd(m.nextRewardUsd)) at \(Fmt.usd(m.nextMilestoneUsd)) market cap").font(Typeface.sans(12.5, 650)).foregroundStyle(.white.opacity(0.7)); ProgressBar(value: m.progress, color: Pad.gold) } }
                }
                .padding(18).smoke(28).enter()

                VStack(alignment: .leading, spacing: 12) {
                    Text("1 · Post this on X").font(Typeface.sans(15, 800))
                    Text(postText).font(Typeface.mono(12, 600)).padding(12).frame(maxWidth: .infinity, alignment: .leading).sunk(16)
                    HStack(spacing: 8) {
                        PadButton(title: "Copy", icon: "doc.on.doc", kind: .ghost, height: 46) { UIPasteboard.general.string = postText; store.show("Copied") }
                        PadButton(title: "Open X", icon: "arrow.up.right", height: 46) { if let u = URL(string: "https://x.com/intent/post?text=\(postText.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") { UIApplication.shared.open(u) } }
                    }
                    Text("2 · Paste your post link").font(Typeface.sans(15, 800)).padding(.top, 4)
                    if account.signedIn {
                        PadField(label: "", placeholder: "https://x.com/you/status/…", text: $url, mono: true, keyboard: .URL)
                        PadButton(title: "Verify my post", icon: "checkmark.seal.fill", kind: .sky, busy: busy, enabled: url.contains("/status/")) { Task { await submit() } }
                        if let message { Text(message).font(Typeface.sans(13, 700)).foregroundStyle(Pad.ink.opacity(0.8)) }
                        if let b = me?.balances { HStack { StatTile(label: "Available", value: Fmt.usd(b.availableUsd)); StatTile(label: "Pending", value: Fmt.usd(b.pendingVerificationUsd + b.pendingPayoutUsd)) } }
                    } else {
                        PadButton(title: "Sign in with X to earn", icon: "person.crop.circle") { router.signIn = true }
                    }
                }
                .padding(16).raised(26).enter(0.05)

                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader(lab: "Leaderboard", title: "Top earners")
                    ForEach(Array((board?.earners ?? []).prefix(10).enumerated()), id: \.offset) { i, e in
                        HStack(spacing: 10) {
                            Text("\(i + 1)").font(Typeface.mono(12, 800)).foregroundStyle(i < 3 ? Pad.gold : Pad.muted).frame(width: 22)
                            Color.clear.frame(width: 34, height: 34).overlay { RemoteImage(url: URL(string: e.avatar), fallback: e.handle).allowsHitTesting(false) }.clipShape(Circle())
                            Text("@\(e.handle)").font(Typeface.sans(14, 800))
                            Spacer()
                            Text(Fmt.usd(e.paidUsd + e.creditedUsd)).font(Typeface.sans(14, 800)).foregroundStyle(Pad.up)
                        }
                    }
                    if board?.earners.isEmpty ?? true { Text("Be the first on the board.").font(Typeface.sans(13.5, 650)).foregroundStyle(Pad.muted) }
                }
                .padding(16).raised(26).enter(0.1)
                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 16)
        }
        .background(Pad.page.ignoresSafeArea())
        .navigationTitle("Post & earn").navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        market = try? await ObjectPadApi.earnMarket()
        board = try? await ObjectPadApi.leaderboard()
        if let t = await account.accountToken() { me = try? await ObjectPadApi.get("/earn/me", token: t) }
    }

    private func submit() async {
        guard let t = await account.accountToken() else { return }
        busy = true; message = nil
        do {
            let data = try await ObjectPadApi.raw("/earn/submissions", method: "POST", token: t, json: ["url": url.trimmingCharacters(in: .whitespaces)], timeout: 45)
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let sub = obj?["submission"] as? [String: Any]
            let state = sub?["state"] as? String ?? ""
            let reason = ((sub?["reasons"] as? [[String: Any]])?.first?["message"] as? String)
            message = state == "approved" ? "Approved. Your reward is credited." : reason ?? "Submitted. We’ll verify it shortly."
            state == "approved" ? Feedback.success(.coins) : Feedback.tap()
            url = ""
            await load()
        } catch { message = error.localizedDescription; Feedback.error() }
        busy = false
    }
}
