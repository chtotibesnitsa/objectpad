import SwiftUI
import LocalAuthentication

/// Wallets this iPhone controls, creator rewards waiting in the Pons fee escrow, and every coin launched from here.
struct WalletView: View {
    @Environment(AppStore.self) private var store
    @Environment(AccountStore.self) private var account
    @Environment(Router.self) private var router
    @State private var claimable: [String: BigUInt] = [:]
    @State private var gas: [String: BigUInt] = [:]
    @State private var scans: [CaptureSession] = []
    @State private var claiming: String?
    @State private var step: String?
    @State private var error: String?
    @State private var claimedHash: String?
    @State private var showKey: Bool = false
    @State private var importing: Bool = false
    @State private var importText: String = ""

    private var wallets: [(address: String, label: String)] {
        var out: [(String, String)] = []
        if let a = account.accountWallet { out.append((a, "Account wallet · same as objectpad.fun")) }
        if let l = account.localWallet, l.lowercased() != account.accountWallet?.lowercased() { out.append((l, "This iPhone’s wallet · key in Keychain")) }
        return out
    }
    private var totalClaimable: BigUInt { claimable.values.reduce(.zero, +) }
    private var launched: [CaptureSession] { scans.filter { $0.launch?.recordState == "confirmed" || $0.launch?.hash != nil } }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header.enter()
                claimCard.enter(0.05)
                walletsSection.enter(0.1)
                holdingsSection.enter(0.15)
                launchesSection.enter(0.2)
                Color.clear.frame(height: 90)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .refreshable { await refresh() }
        .toolbar(.hidden, for: .navigationBar)
        .task(id: "\(account.accountWallet ?? "")-\(account.localWallet ?? "")") { await refresh() }
        .sheet(isPresented: $showKey) { KeySheet().presentationDetents([.medium]).environment(account) }
        .alert("Import a wallet", isPresented: $importing) {
            SecureField("64-character private key", text: $importText)
            Button("Import") { do { try account.importLocalWallet(importText); importText = ""; Feedback.success(); Task { await refresh() } } catch { self.error = error.localizedDescription; Feedback.error() } }
            Button("Cancel", role: .cancel) { importText = "" }
        } message: { Text("It replaces this iPhone’s wallet. Back up the current key first.") }
    }

    private func refresh() async {
        if account.localWallet == nil && !account.signedIn { try? account.ensureLocalWallet() }
        var c: [String: BigUInt] = [:], g: [String: BigUInt] = [:]
        for w in wallets {
            c[w.address] = (try? await ChainClient.shared.escrowBalance(w.address)) ?? .zero
            g[w.address] = (try? await ChainClient.shared.balance(w.address)) ?? .zero
        }
        withAnimation(.snappy) { claimable = c; gas = g }
        scans = (try? await account.myScans()) ?? scans
        await store.refreshHoldings()
        await account.refreshMe()
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) { Lab(account.signedIn ? account.displayName : "Guest · no account needed"); Display("Wallet", size: 42) }
            Spacer()
            CircleIconButton(icon: account.signedIn ? "person.crop.circle.fill" : "person.crop.circle.badge.plus", size: 50) { account.signedIn ? (router.account = true) : (router.signIn = true) }
        }
        .padding(.top, 8)
    }

    private var claimCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Lab("Creator rewards to claim", color: .white.opacity(0.6))
                    RollingText(text: "\(totalClaimable.formatUnits(digits: 6)) ETH", font: Typeface.display(36), color: .white)
                    Text(store.ethUsd.map { Fmt.usd(totalClaimable.toDouble() * $0) } ?? " ").font(Typeface.mono(13, 700)).foregroundStyle(.white.opacity(0.6))
                }
                Spacer()
                Image("gold_coins_vault_box").resizable().scaledToFit().frame(width: 104).modifier(Bob()).offset(y: -8)
            }
            Text("You keep 0.5% of every trade on coins you launched. Claim it straight from the on-chain fee escrow whenever you like.").font(Typeface.sans(13, 600)).foregroundStyle(.white.opacity(0.7))
            if let error { Text(error).font(Typeface.sans(12.5, 700)).foregroundStyle(Color(hex: 0xFF8A8E)) }
            if let claimedHash {
                HStack { Image(systemName: "checkmark.seal.fill").foregroundStyle(Pad.up); Text("Claimed").font(Typeface.sans(14, 800)).foregroundStyle(.white); Spacer(); Link("Receipt ↗", destination: Chain.txURL(claimedHash)).font(Typeface.sans(13, 800)).foregroundStyle(.white) }
                    .padding(12).background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.1)))
            }
            ForEach(wallets, id: \.address) { w in
                let amount = claimable[w.address] ?? .zero
                if !amount.isZero {
                    PadButton(title: claiming == w.address ? (step ?? "Claiming…") : "Claim \(amount.formatUnits(digits: 5)) ETH · \(Fmt.short(w.address))", icon: "arrow.down.to.line.circle.fill", kind: .pearl, busy: claiming == w.address, enabled: claiming == nil) { Task { await claim(w.address, amount) } }
                }
            }
            if totalClaimable.isZero { Text(launched.isEmpty ? "Launch a coin and its trading fees start landing here." : "Nothing waiting right now. Fees arrive with every trade.").font(Typeface.sans(12.5, 650)).foregroundStyle(.white.opacity(0.55)) }
        }
        .padding(18)
        .background { ZStack { Pad.night; VoxelField(count: 14, seed: 21, color: Pad.gold).opacity(0.5) }.clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous)).shadow(color: Pad.ink.opacity(0.35), radius: 22, y: 14) }
        .overlay { if claimedHash != nil { ConfettiBurst() } }
    }

    /// Claims from the escrow, then returns the protocol's two thirds (burn + holders) to the treasury, exactly like objectpad.fun.
    private func claim(_ address: String, _ amount: BigUInt) async {
        claiming = address; error = nil; claimedHash = nil
        do {
            let signer = try account.signer(for: address)
            let balance = (try? await ChainClient.shared.balance(address)) ?? .zero
            let price = (try? await ChainClient.shared.gasPrice()) ?? .zero
            let needed = price * BigUInt(260_000)
            if balance < needed {
                guard account.signedIn else { throw ChainError.message("This wallet needs a little ETH on Robinhood Chain for gas. Sign in and ObjectPad tops it up for free, or send a few cents of ETH to \(Fmt.short(address)).") }
                step = "Linking wallet…"
                if case .device = signer { try await account.linkLocalWallet() }
                step = "Getting free gas…"
                try await account.claimGas(for: address)
            }
            step = "Claiming…"
            let hash = try await signer.send(TxRequest(to: Chain.feeEscrow, data: Abi.claim))
            step = "Confirming…"
            try await ChainClient.shared.waitForReceipt(hash)
            let protocolShare = amount - amount.scaled(Chain.creatorShareBps, 10_000)
            let treasury = account.me?.treasury ?? store.status?.sponsor?.address ?? ""
            if !protocolShare.isZero, Chain.isAddress(treasury) {
                step = "Sharing with burn & holders…"
                let share = try await signer.send(TxRequest(to: treasury, value: protocolShare))
                try await ChainClient.shared.waitForReceipt(share)
            }
            if account.signedIn, let t = await account.accountToken() { _ = try? await ObjectPadApi.raw("/account/activity", method: "POST", token: t, json: ["hash": hash], timeout: 45) }
            withAnimation(.spring) { claimedHash = hash }
            Feedback.success(.coins)
            await refresh()
        } catch {
            self.error = error.localizedDescription
            Feedback.error()
        }
        claiming = nil; step = nil
    }

    private var walletsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(lab: "Robinhood Chain", title: "Your wallets")
            if wallets.isEmpty {
                PadButton(title: "Create this iPhone’s wallet", icon: "plus.circle.fill") { try? account.ensureLocalWallet(); Feedback.success(); Task { await refresh() } }
            }
            ForEach(wallets, id: \.address) { w in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        GlassIcon(name: w.label.hasPrefix("Account") ? "glass_shield" : "glass_wallet", size: 38)
                        VStack(alignment: .leading, spacing: 2) { Text(w.label).font(Typeface.sans(13, 750)).foregroundStyle(Pad.muted); Text(Fmt.short(w.address, lead: 8, tail: 6)).font(Typeface.mono(14, 800)) }
                        Spacer()
                        Button { UIPasteboard.general.string = w.address; store.show("Address copied") } label: { Image(systemName: "doc.on.doc").foregroundStyle(Pad.ink) }.buttonStyle(.press)
                    }
                    HStack {
                        Text("\((gas[w.address] ?? .zero).formatUnits(digits: 5)) ETH").font(Typeface.sans(15, 800))
                        Spacer()
                        Link(destination: Chain.addressURL(w.address)) { Text("Blockscout ↗").font(Typeface.sans(12.5, 750)) }.foregroundStyle(Pad.muted)
                    }
                }
                .padding(14).raised(22)
            }
            if account.localWallet != nil {
                HStack(spacing: 10) {
                    PadButton(title: "Back up key", icon: "key.fill", kind: .ghost, height: 46) { reveal() }
                    PadButton(title: "Import", icon: "square.and.arrow.down", kind: .ghost, height: 46) { importing = true }
                }
            }
            if account.signedIn, account.localWallet != nil, !(account.me?.wallets.contains { $0.address.lowercased() == account.localWallet?.lowercased() } ?? false) {
                PadButton(title: "Link this iPhone’s wallet to my account", icon: "link", kind: .pearl) { Task { do { try await account.linkLocalWallet(); Feedback.success(); store.show("Wallet linked") } catch { self.error = error.localizedDescription } } }
            }
        }
    }

    private func reveal() {
        let ctx = LAContext()
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { showKey = true; return }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Show your wallet key") { ok, _ in Task { @MainActor in if ok { showKey = true } } }
    }

    private var holdingsSection: some View {
        let held = store.coins.filter { store.balances[$0.token.lowercased()] != nil }
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader(lab: "Portfolio", title: "Coins you hold")
            if held.isEmpty { Text("Buy any object coin and it shows up here.").font(Typeface.sans(13.5, 650)).foregroundStyle(Pad.muted) }
            ForEach(held) { c in
                let bal = store.balances[c.token.lowercased()] ?? .zero
                Button { router.push(.coin(c.id)) } label: {
                    HStack(spacing: 12) {
                        CoinAvatar(url: c.logo, symbol: c.symbol, size: 44)
                        VStack(alignment: .leading, spacing: 2) { Text("$\(c.symbol)").font(Typeface.sans(15, 800)); Text("\(Fmt.compact(bal.toDouble())) tokens").font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted) }
                        Spacer()
                        Text(Fmt.value(bal.toDouble() * c.priceEth, store.ethUsd)).font(Typeface.sans(15, 800))
                    }
                    .padding(12).raised(20)
                }
                .buttonStyle(.press)
            }
        }
    }

    private var launchesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(lab: "Launched from this iPhone", title: "Your coins", action: launched.isEmpty ? nil : "All") { router.push(.launches) }
            if launched.isEmpty && scans.isEmpty {
                Button { router.startScan() } label: {
                    HStack(spacing: 14) { Image("rocket_launch_voxel").resizable().scaledToFit().frame(width: 64); VStack(alignment: .leading, spacing: 2) { Text("Launch your first coin").font(Typeface.sans(15, 800)); Text("Scan any object. It’s free.").font(Typeface.sans(12.5, 600)).foregroundStyle(Pad.muted) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(Pad.muted) }
                        .padding(14).raised(22)
                }.buttonStyle(.press)
            }
            ForEach(launched.prefix(4)) { s in LaunchRow(session: s) }
            if let open = scans.first(where: { $0.launch == nil && !$0.isTerminal }) {
                Button { router.push(.studio(open.id)) } label: {
                    HStack { Image(systemName: "hourglass").foregroundStyle(Pad.sky); Text(open.isCapturing ? "Unfinished scan · \(open.views.count)/6 angles" : "Scan ready to launch").font(Typeface.sans(14, 800)); Spacer(); Image(systemName: "chevron.right").foregroundStyle(Pad.muted) }
                        .foregroundStyle(Pad.ink).padding(14).raised(20)
                }.buttonStyle(.press)
            }
        }
    }
}

struct LaunchRow: View {
    let session: CaptureSession
    @Environment(AppStore.self) private var store
    @Environment(Router.self) private var router
    var body: some View {
        let coin = session.launch?.token.flatMap { store.coin($0) }
        Button { if let c = coin { router.push(.coin(c.id)) } else { router.push(.studio(session.id)) } } label: {
            HStack(spacing: 12) {
                CoinAvatar(url: session.icon?.url ?? session.model?.thumbnailUrl ?? coin?.logo ?? "", symbol: session.launchDraft?.symbol ?? "", size: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.launchDraft?.publicName ?? coin?.name ?? "Object").font(Typeface.sans(15, 800)).lineLimit(1)
                    Text("$\(session.launchDraft?.symbol ?? coin?.symbol ?? "") · \(session.isLaunched ? "live" : session.launch?.state ?? "")").font(Typeface.mono(11, 700)).foregroundStyle(Pad.muted)
                }
                Spacer()
                if let c = coin { VStack(alignment: .trailing, spacing: 2) { Text(Fmt.value(c.marketCapEth, store.ethUsd)).font(Typeface.sans(14, 800)); Text(Fmt.pct(c.change24h)).font(Typeface.mono(10.5, 800)).foregroundStyle(c.change24h >= 0 ? Pad.up : Pad.down) } }
            }
            .foregroundStyle(Pad.ink).padding(12).raised(20)
        }
        .buttonStyle(.press)
    }
}

struct LaunchesView: View {
    @Environment(AccountStore.self) private var account
    @State private var scans: [CaptureSession] = []
    @State private var loading: Bool = true
    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if loading { ProgressView().padding(.top, 60) }
                ForEach(scans.filter { $0.launch != nil }) { s in LaunchRow(session: s) }
                if !loading && scans.filter({ $0.launch != nil }).isEmpty { Text("No launches from this identity yet.").font(Typeface.sans(14, 650)).foregroundStyle(Pad.muted).padding(.top, 40) }
            }
            .padding(16)
        }
        .background(Pad.page.ignoresSafeArea())
        .navigationTitle("Your coins")
        .task { scans = (try? await account.myScans()) ?? []; loading = false }
    }
}

/// Shows this iPhone's wallet key after device authentication, with copy.
struct KeySheet: View {
    @Environment(AccountStore.self) private var account
    @State private var copied: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Display("Your wallet key", size: 28)
            Text("Anyone with this key controls the wallet and its creator rewards. Store it somewhere safe. Never share it.").font(Typeface.sans(13.5, 600)).foregroundStyle(Pad.down)
            Text(account.localPrivateKeyHex() ?? "No key on this iPhone").font(Typeface.mono(13, 700)).textSelection(.enabled).padding(14).frame(maxWidth: .infinity, alignment: .leading).sunk(16)
            PadButton(title: copied ? "Copied" : "Copy key", icon: copied ? "checkmark" : "doc.on.doc") { UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: account.localPrivateKeyHex() ?? ""]], options: [.expirationDate: Date().addingTimeInterval(120)]); copied = true; Feedback.success() }
        }
        .padding(20)
    }
}
