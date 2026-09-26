import SwiftUI
import PhotosUI
import WebKit

/// The live studio for one scan: AI check, real 3D progress, model review, coin details and the free sponsored launch.
struct StudioView: View {
    let id: String
    @Environment(AccountStore.self) private var account
    @Environment(AppStore.self) private var store
    @Environment(Router.self) private var router

    @State private var sessionId: String = ""
    @State private var session: CaptureSession?
    @State private var loadError: String?
    @State private var modelData: Data?
    @State private var name: String = ""
    @State private var symbol: String = ""
    @State private var story: String = ""
    @State private var xUrl: String = ""
    @State private var feeWallet: String = ""
    @State private var pairToken: String = ""
    @State private var dirty: Bool = false
    @State private var busy: String?
    @State private var actionError: String?
    @State private var autoRebuilds: Int = 0
    @State private var snapKey: String = ""
    @State private var announced: String = ""
    @State private var iconItem: PhotosPickerItem?
    @State private var showAdvanced: Bool = false

    private var caller: SessionCaller { SessionCaller(id: sessionId.isEmpty ? id : sessionId, account: account) }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let s = session {
                    stage(s).enter()
                    if s.isLaunched { launched(s).enter(0.05) }
                    else if s.isTerminal || s.state == "failed" && autoRebuilds >= 3 { failure(s).enter(0.05) }
                    else if s.isCapturing { capturingCard(s).enter(0.05) }
                    else { form(s).enter(0.1) }
                } else if let loadError {
                    ContentUnavailableView("Scan unavailable", systemImage: "lock.circle", description: Text(loadError)).padding(.top, 60)
                } else { ProgressView().controlSize(.large).padding(.top, 120) }
                Color.clear.frame(height: 100)
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(Pad.page.ignoresSafeArea())
        .navigationTitle("Studio").navigationBarTitleDisplayMode(.inline)
        .task(id: id) { sessionId = id; await pollLoop() }
        .onChange(of: iconItem) { _, item in if let item { Task { await customIcon(item) } } }
    }

    // MARK: Polling

    private func pollLoop() async {
        while !Task.isCancelled {
            do { apply(try await caller.session()) }
            catch let e as ApiError { if session == nil { loadError = e.status == 404 ? "This scan belongs to another device or account. Open it where you started, or sign in with the account that owns it." : e.message } }
            catch { if session == nil { loadError = error.localizedDescription } }
            guard let s = session else { try? await Task.sleep(for: .seconds(4)); continue }
            if s.isLaunched || s.isTerminal { return }
            let wait: Double = ["screening", "reconstructing", "validating"].contains(s.state) ? 2 : s.launch != nil ? 2.5 : 3.5
            try? await Task.sleep(for: .seconds(wait))
        }
    }

    private func apply(_ s: CaptureSession) {
        if let next = s.successor {
            if let secret = account.deviceSecret(s.id) { account.saveDeviceSecret(next, secret) }
            sessionId = next; return
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { session = s }
        if !dirty {
            name = s.launchDraft?.publicName ?? s.suggestion?.name ?? name
            symbol = s.launchDraft?.symbol ?? s.suggestion?.ticker ?? symbol
            story = s.launchDraft?.story ?? s.suggestion?.story ?? story
            xUrl = s.launchDraft?.xUrl ?? xUrl
            feeWallet = s.launchDraft?.feeWallet ?? account.activeWallet ?? feeWallet
            pairToken = s.launchDraft?.pairToken ?? pairToken
        }
        if announced != s.state {
            if s.state == "model_review" { Feedback.success(.model) }
            if ["blocked", "failed"].contains(s.state) { Feedback.play(.rejected) }
            announced = s.state
        }
        if s.isLaunched, announced != "confirmed" { announced = "confirmed"; Feedback.success(.launch); UserDefaults.standard.removeObject(forKey: "lastScan") }
        if s.state == "review", s.views.count >= 6, busy == nil, s.failureCode == nil || s.failureCode == "MEDIA_VALIDATION_UNAVAILABLE" && autoRebuilds == 0 {
            if s.failureCode != nil { autoRebuilds += 1 }
            run("Checking your photos…") { apply(try await caller.reconstruct()) }
        }
        if s.state == "failed", busy == nil, autoRebuilds < 3 {
            autoRebuilds += 1
            run("Rebuilding…") { try await Task.sleep(for: .seconds(1.5)); apply(try await caller.regenerate()) }
        }
        if account.signedIn, s.guest == true, s.launch == nil { Task { if await account.adopt(sessionId: s.id) > 0, let u = try? await caller.session() { session = u } } }
        if s.isModelReady, modelData == nil, let m = s.model, !m.modelUrl.isEmpty { Task { modelData = try? await caller.download(m.modelUrl) } }
    }

    private func run(_ label: String, _ block: @escaping () async throws -> Void) {
        guard busy == nil else { return }
        busy = label; actionError = nil
        Task {
            do { try await block() } catch { withAnimation { actionError = error.localizedDescription }; Feedback.error() }
            busy = nil
        }
    }

    // MARK: Stage (3D / progress)

    private func stage(_ s: CaptureSession) -> some View {
        ZStack {
            Pad.skyGradient
            CloudDrift().opacity(0.7)
            if s.isModelReady || s.isLaunched, let modelData {
                ModelViewer(data: modelData) { web in Task { await snapshotIcon(web) } }
            } else if let thumb = s.model?.thumbnailUrl, !thumb.isEmpty {
                Color.clear.overlay { RemoteImage(url: URL(string: thumb)).allowsHitTesting(false) }.frame(width: 200, height: 200).modifier(Bob())
            } else {
                BuildingOrb(progress: s.job?.progress ?? (s.isCapturing ? Double(s.views.count) / 6 : 0.1), label: stageLabel(s))
            }
            VStack {
                HStack {
                    HStack(spacing: 6) { if !s.isLaunched && !s.isModelReady { PulseDot(color: .white, size: 6) }; Text(stageTitle(s).uppercased()).font(Typeface.mono(10.5, 800)) }
                        .foregroundStyle(.white).padding(.horizontal, 11).padding(.vertical, 7).glass(Capsule(), tint: Pad.ink.opacity(0.4))
                    Spacer()
                }
                Spacer()
            }
            .padding(14)
        }
        .frame(height: 330)
        .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
        .shadow(color: Pad.sky.opacity(0.3), radius: 20, y: 12)
    }

    private func stageTitle(_ s: CaptureSession) -> String {
        if s.isLaunched { return "Live on Robinhood Chain" }
        if s.launch != nil { return "Launching…" }
        if s.isModelReady { return "3D model ready" }
        if s.isCapturing { return "\(s.views.count)/6 angles" }
        switch s.state { case "screening": return "AI safety check"; case "reconstructing": return "Rebuilding in 3D"; case "validating": return "Validating model"; case "failed": return "Rebuilding"; default: return s.state.replacingOccurrences(of: "_", with: " ") }
    }
    private func stageLabel(_ s: CaptureSession) -> String {
        if let q = s.job?.queue, q > 0 { return "\(q) ahead in the queue" }
        return s.state == "screening" ? "Checking every photo" : s.state == "reconstructing" ? "Building your object" : "Preparing"
    }

    // MARK: Cards

    private func capturingCard(_ s: CaptureSession) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Display("\(6 - s.views.count) angles to go", size: 28)
            Text("Your accepted photos are saved on ObjectPad. Finish the remaining angles to start the 3D build.").font(Typeface.sans(14, 600)).foregroundStyle(Pad.muted)
            PadButton(title: "Continue scanning", icon: "viewfinder") { router.startScan(resume: s.id) }
        }
        .padding(18).raised(26)
    }

    private func form(_ s: CaptureSession) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) { Lab(s.isModelReady ? "Step 3 · Name it" : "While it builds · name it"); Display("Your coin", size: 30) }
                Spacer()
                iconPicker(s)
            }
            if let sug = s.suggestion, sug.compared > 0 {
                Label("Unique · compared with \(sug.compared) objects", systemImage: "checkmark.seal.fill").font(Typeface.sans(12.5, 750)).foregroundStyle(Pad.up)
            }
            PadField(label: "Name", placeholder: "Golden Mug", text: binding($name))
            PadField(label: "Ticker", placeholder: "MUG", text: Binding(get: { symbol }, set: { symbol = String($0.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(10)); dirty = true }), mono: true)
            PadField(label: "Story", placeholder: "Where it came from, why it matters…", text: binding($story), axis: .vertical)
            PairPickerCard(selection: Binding(get: { pairToken }, set: { pairToken = $0; dirty = true }), suggestion: s.suggestion?.pair, disabled: s.launch != nil)
            DisclosureGroup(isExpanded: $showAdvanced) {
                VStack(spacing: 12) {
                    PadField(label: "X link (optional)", placeholder: "https://x.com/yourcoin", text: binding($xUrl), mono: true, keyboard: .URL)
                    PadField(label: "Creator rewards wallet", placeholder: "0x… (defaults to this iPhone’s wallet)", text: binding($feeWallet), mono: true)
                }.padding(.top, 10)
            } label: { Text("Links & rewards wallet").font(Typeface.sans(14, 800)).foregroundStyle(Pad.ink) }
            .tint(Pad.ink)
            if let e = validation { Text(e).font(Typeface.sans(12.5, 700)).foregroundStyle(Pad.down) }
            if let actionError { ErrorBanner(message: actionError) }
            if s.launch != nil && !s.isLaunched {
                HStack(spacing: 10) { ProgressView(); Text(s.launch?.state == "queued" ? "Queued. It launches automatically as soon as the treasury has room." : "Sending to Robinhood Chain…").font(Typeface.sans(13.5, 700)) }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading).sunk(18)
                if s.launch?.hash == nil && s.launch?.state != "queued" { PadButton(title: "Send launch again", icon: "arrow.clockwise", kind: .ghost) { run("Launching…") { apply(try await caller.launch(nil).session) } } }
            } else {
                PadButton(title: busy ?? (s.isModelReady ? "Launch free · $\(symbol.isEmpty ? "COIN" : symbol)" : "Launch when the model is ready"), icon: "rocket.fill", kind: .sky, busy: busy != nil, enabled: validation == nil && (s.isModelReady || s.isBuilding)) { launch() }
                Text(store.treasuryOpen ? "The ObjectPad treasury pays the gas · \(store.launchesLeft) free launches left today" : "Free launches are queued · it launches automatically").font(Typeface.sans(11.5, 650)).foregroundStyle(Pad.muted).frame(maxWidth: .infinity)
            }
            HStack {
                Button("Rescan object") { run("Rescanning…") { let n = try await caller.rescan(); UserDefaults.standard.set(n.id, forKey: "lastScan"); router.startScan(resume: n.id) } }
                Spacer()
                Button("Start over", role: .destructive) { run("Resetting…") { await caller.cancel(); Feedback.play(.retry); router.paths[router.tab]?.removeLast(); router.startScan() } }
            }
            .font(Typeface.sans(13, 750)).foregroundStyle(Pad.muted)
        }
        .padding(18).raised(28)
    }

    private func binding(_ b: Binding<String>) -> Binding<String> { Binding(get: { b.wrappedValue }, set: { b.wrappedValue = $0; dirty = true }) }

    private var validation: String? {
        let n = name.trimmingCharacters(in: .whitespaces), st = story.trimmingCharacters(in: .whitespaces)
        if n.count < 2 || n.count > 32 { return "Name: 2–32 characters." }
        if symbol.count < 2 { return "Ticker: 2–10 letters or digits." }
        if st.count < 10 || st.count > 280 { return "Story: 10–280 characters." }
        if !xUrl.isEmpty, xUrl.range(of: #"^https://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/?$"#, options: .regularExpression) == nil { return "Use https://x.com/handle or leave it empty." }
        if !feeWallet.isEmpty, !Chain.isAddress(feeWallet) { return "Paste a full 0x… wallet or leave it empty." }
        return nil
    }

    private func launch() {
        run("Launching…") {
            let fee = feeWallet.trimmingCharacters(in: .whitespaces).isEmpty ? (account.activeWallet ?? (try? account.ensureLocalWallet())) : feeWallet.trimmingCharacters(in: .whitespaces)
            let draft = LaunchDraft(publicName: name.trimmingCharacters(in: .whitespaces), symbol: symbol, story: story.trimmingCharacters(in: .whitespaces), xUrl: xUrl.trimmingCharacters(in: .whitespaces), telegram: nil, feeWallet: fee, pairToken: PairCatalog.isEth(pairToken) ? nil : pairToken)
            let r = try await caller.launch(draft)
            if r.hash != nil || r.state != "queued" { Feedback.success(.seal) }
            dirty = false
            apply(r.session)
        }
    }

    private func iconPicker(_ s: CaptureSession) -> some View {
        PhotosPicker(selection: $iconItem, matching: .images) {
            ZStack(alignment: .bottomTrailing) {
                CoinAvatar(url: s.icon?.url ?? s.model?.thumbnailUrl ?? "", symbol: symbol, size: 64)
                Image(systemName: "pencil.circle.fill").font(.system(size: 20)).foregroundStyle(.white, Pad.ink).offset(x: 4, y: 4)
            }
        }
        .disabled(s.launch?.hash != nil)
    }

    private func customIcon(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else { return }
        let side = min(img.size.width, img.size.height)
        let crop = img.cgImage?.cropping(to: CGRect(x: (img.size.width - side) / 2 * img.scale, y: (img.size.height - side) / 2 * img.scale, width: side * img.scale, height: side * img.scale)).map { UIImage(cgImage: $0) } ?? img
        guard let jpeg = crop.jpeg(max: 1024) else { return }
        do { apply(try await caller.setIcon(jpeg, source: "custom", modelHash: nil)); Feedback.success() } catch { actionError = error.localizedDescription }
    }

    /// Front snapshot of the finished model becomes the coin icon (once per model), like the website.
    private func snapshotIcon(_ web: WKWebView) async {
        guard let s = session, let m = s.model, s.isModelReady, s.launch?.hash == nil else { return }
        if let icon = s.icon, !(icon.source == "snapshot" && icon.modelHash != m.optimizedHash) { return }
        let key = m.optimizedHash + (s.icon?.hash ?? "")
        guard snapKey != key else { return }
        snapKey = key
        try? await Task.sleep(for: .seconds(1.2))
        guard let png = await ModelViewer.snapshot(web) else { return }
        if let u = try? await caller.setIcon(png, source: "snapshot", modelHash: m.optimizedHash) { apply(u) }
    }

    private func launched(_ s: CaptureSession) -> some View {
        VStack(spacing: 14) {
            ZStack { Image("rocket_launch_voxel").resizable().scaledToFit().frame(height: 150).modifier(Bob()); ConfettiBurst() }
            Display("$\(symbol) is live.", size: 34).multilineTextAlignment(.center)
            Text("You earn 0.5% of every trade, forever. Claim anytime from Wallet.").font(Typeface.sans(14.5, 650)).foregroundStyle(Pad.muted).multilineTextAlignment(.center)
            if let token = s.launch?.token, let c = store.coin(token) { PadButton(title: "Open coin", icon: "chart.line.uptrend.xyaxis") { router.push(.coin(c.id)) } }
            else if let obj = s.objectId { PadButton(title: "Open coin", icon: "chart.line.uptrend.xyaxis") { router.push(.coin(obj)) } }
            HStack(spacing: 10) {
                if let hash = s.launch?.hash { Link(destination: Chain.txURL(hash)) { Label("Receipt", systemImage: "doc.text.magnifyingglass").font(Typeface.sans(14, 800)).frame(maxWidth: .infinity, minHeight: 50).sunk(25) }.foregroundStyle(Pad.ink) }
                ShareLink(item: URL(string: s.coinUrl ?? "https://www.objectpad.fun")!, message: Text("I just turned a real object into a coin on @ObjectPadFun: $\(symbol)")) { Label("Share", systemImage: "square.and.arrow.up").font(Typeface.sans(14, 800)).frame(maxWidth: .infinity, minHeight: 50).sunk(25) }.foregroundStyle(Pad.ink)
            }
            PadButton(title: "Claim my rewards", icon: "wallet.bifold.fill", kind: .ghost) { router.tab = .wallet }
        }
        .padding(20).raised(28)
    }

    private func failure(_ s: CaptureSession) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Display(s.state == "blocked" ? "This scan can’t launch" : "The rebuild didn’t work", size: 26)
            Text(ObjectPadApi.describe(s.failureCode ?? "PROVIDER_FAILED")).font(Typeface.sans(14, 600)).foregroundStyle(Pad.muted)
            if let actionError { ErrorBanner(message: actionError) }
            PadButton(title: "Rescan the object", icon: "viewfinder", busy: busy != nil) { run("Rescanning…") { let n = try await caller.rescan(); router.startScan(resume: n.id) } }
            PadButton(title: "Start a new scan", kind: .ghost) { router.startScan() }
        }
        .padding(18).raised(26)
    }
}

/// Animated build orb: a rotating voxel ring that fills with real job progress.
struct BuildingOrb: View {
    let progress: Double
    let label: String
    @State private var spin: Double = 0
    var body: some View {
        ZStack {
            VoxelField(count: 20, seed: 11)
            Circle().stroke(.white.opacity(0.25), lineWidth: 10).frame(width: 170)
            Circle().trim(from: 0, to: max(0.04, progress)).stroke(.white, style: StrokeStyle(lineWidth: 10, lineCap: .round)).frame(width: 170).rotationEffect(.degrees(-90)).animation(.spring(response: 0.9), value: progress)
            Circle().trim(from: 0, to: 0.18).stroke(Pad.skyLight, style: StrokeStyle(lineWidth: 3, lineCap: .round)).frame(width: 196).rotationEffect(.degrees(spin))
            VStack(spacing: 4) {
                RollingText(text: "\(Int(progress * 100))%", font: Typeface.display(40), color: .white)
                Text(label).font(Typeface.mono(10.5, 800)).foregroundStyle(.white.opacity(0.85))
            }
        }
        .onAppear { withAnimation(.linear(duration: 2.4).repeatForever(autoreverses: false)) { spin = 360 } }
    }
}
