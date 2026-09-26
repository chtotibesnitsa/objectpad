import SwiftUI
import UIKit

/// Guided six-angle scanner: pairs this phone to a scan, shoots each angle and uploads it through a single-use ticket.
struct ScanFlowView: View {
    let resume: String?
    let onDone: (String) -> Void
    @Environment(AccountStore.self) private var account
    @Environment(\.dismiss) private var dismiss

    enum Phase { case intro, opening, camera, denied, noCamera, failed(String) }
    enum ShotState: Equatable { case uploading, accepted, rejected(String) }

    @State private var phase: Phase = .intro
    @State private var session: CaptureSession?
    @State private var shots: [ScanAngle: ShotState] = [:]
    @State private var previews: [ScanAngle: UIImage] = [:]
    @State private var flash: Bool = false
    @State private var busy: Bool = false
    @State private var camera = CameraService()
    @State private var celebrate: Bool = false

    private var accepted: Set<String> { Set(session?.views.map(\.view) ?? []) }
    private var target: ScanAngle? { ScanAngle.allCases.first { a in !accepted.contains(a.rawValue) && shots[a] != .uploading && shots[a] != .accepted } }
    private var rejected: (ScanAngle, String)? { for a in ScanAngle.allCases { if case .rejected(let m) = shots[a] { return (a, m) } }; return nil }
    private var doneCount: Int { ScanAngle.allCases.filter { accepted.contains($0.rawValue) || shots[$0] == .accepted }.count }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch phase {
            case .intro: intro
            case .opening: VStack(spacing: 14) { ProgressView().tint(.white).controlSize(.large); Text("Opening your scan…").font(Typeface.sans(15, 700)).foregroundStyle(.white.opacity(0.7)) }
            case .camera: cameraView
            case .denied: message("Camera access is off", "Allow the camera in Settings to scan objects.", "Open Settings") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
            case .noCamera: message("No camera found", "This device has no camera available. Scan from an iPhone.", "Close") { dismiss() }
            case .failed(let m): message("Couldn’t open the scan", m, "Try again") { Task { await open() } }
            }
            VStack { HStack { CircleIconButton(icon: "xmark", dark: true) { camera.stop(); dismiss() }; Spacer() }.padding(.horizontal, 16); Spacer() }
        }
        .statusBarHidden()
        .onDisappear { camera.stop() }
        .task { if resume != nil { await open() } }
    }

    // MARK: Intro

    private var intro: some View {
        ZStack {
            Pad.night.ignoresSafeArea()
            VoxelField(count: 24, seed: 3).ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                Image("smartphone_camera_mug").resizable().scaledToFit().frame(height: 250).modifier(Bob())
                Display("Six photos.\nOne coin.", size: 40, color: .white).multilineTextAlignment(.center)
                VStack(alignment: .leading, spacing: 10) {
                    tip("sun.max.fill", "Even light, plain background")
                    tip("circle.dashed", "Walk around it. The ring shows where")
                    tip("person.fill.xmark", "No people, screens or documents")
                }
                .padding(18).frame(maxWidth: .infinity, alignment: .leading).background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(.white.opacity(0.07)))
                Spacer()
                PadButton(title: "Start scanning", icon: "viewfinder", kind: .pearl) { Task { await open() } }
                Text("No account needed. By scanning you confirm you own or may photograph this object.").font(Typeface.sans(11.5, 600)).foregroundStyle(.white.opacity(0.5)).multilineTextAlignment(.center)
            }
            .padding(24)
        }
    }

    private func tip(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 12) { Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(Pad.skyLight).frame(width: 24); Text(text).font(Typeface.sans(14.5, 700)).foregroundStyle(.white) }
    }

    private func message(_ title: String, _ body: String, _ cta: String, _ action: @escaping () -> Void) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "camera.metering.unknown").font(.system(size: 48)).foregroundStyle(.white.opacity(0.7))
            Display(title, size: 28, color: .white).multilineTextAlignment(.center)
            Text(body).font(Typeface.sans(14.5, 600)).foregroundStyle(.white.opacity(0.7)).multilineTextAlignment(.center)
            PadButton(title: cta, kind: .pearl, action: action).padding(.top, 8)
        }
        .padding(30)
    }

    // MARK: Session

    private func open() async {
        phase = .opening
        do {
            let s: CaptureSession
            if let resume { s = try await SessionCaller(id: resume, account: account).session() }
            else {
                let created: SessionCreated = try await ObjectPadApi.send("/sessions", json: ["draftId": UUID().uuidString.lowercased(), "rights": true], token: try await account.token())
                s = created.session
                if let url = created.handoffUrl, let token = url.components(separatedBy: "token=").dropFirst().first?.components(separatedBy: "&").first, !token.isEmpty {
                    let claimed: SessionClaimed = try await ObjectPadApi.send("/sessions/\(s.id)/claim", json: ["token": token])
                    account.saveDeviceSecret(s.id, claimed.claimSecret)
                }
            }
            session = s
            UserDefaults.standard.set(s.id, forKey: "lastScan")
            if s.views.count >= 6 || !s.isCapturing { onDone(s.id); return }
            guard await CameraService.authorize() else { phase = .denied; return }
            guard await camera.start() else { phase = .noCamera; return }
            withAnimation(.easeOut) { phase = .camera }
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func shoot() {
        guard let angle = target, !busy, let s = session else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                let jpeg = try await camera.capture()
                Feedback.play(.capture, volume: 0.5); Feedback.thud()
                withAnimation(.easeOut(duration: 0.08)) { flash = true }
                withAnimation(.easeOut(duration: 0.35).delay(0.08)) { flash = false }
                previews[angle] = UIImage(data: jpeg)
                withAnimation(.spring) { shots[angle] = .uploading }
                await upload(angle, jpeg, caller: SessionCaller(id: s.id, account: account))
            } catch { withAnimation { shots[angle] = .rejected(error.localizedDescription) } }
        }
    }

    private func upload(_ angle: ScanAngle, _ jpeg: Data, caller: SessionCaller, tries: Int = 0) async {
        do {
            let ticket = try await caller.ticket(angle)
            let updated = try await caller.upload(ticket, jpeg: jpeg)
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { session = updated; shots[angle] = .accepted }
            Feedback.play(.orbit, volume: 0.45); Feedback.softImpact()
            if updated.views.count >= 6 {
                Feedback.success(.seal); celebrate = true
                try? await Task.sleep(for: .milliseconds(900))
                camera.stop(); onDone(updated.id)
            }
        } catch let e as ApiError {
            let frameCodes: Set<String> = ["IMAGE_QUALITY", "IMAGE_RESOLUTION", "IMAGE_NOT_VALIDATED", "DUPLICATE_VIEW", "DUPLICATE_ARCHIVE_FRAME", "NO_OBJECT", "OBJECT_OR_BACKGROUND_QUALITY", "UNSUPPORTED_IMAGE", "RETAKE_REQUIRED", "PEOPLE_IN_FRAME", "DOCUMENT_IN_FRAME", "SCREEN_IN_FRAME"]
            if !frameCodes.contains(e.code), tries < 3 { try? await Task.sleep(for: .seconds(1.5 * Double(tries + 1))); await upload(angle, jpeg, caller: caller, tries: tries + 1); return }
            withAnimation { shots[angle] = .rejected(e.message) }
            Feedback.play(.rejected); Feedback.warning()
        } catch {
            if tries < 3 { try? await Task.sleep(for: .seconds(2)); await upload(angle, jpeg, caller: caller, tries: tries + 1); return }
            withAnimation { shots[angle] = .rejected("The upload failed. Retake this angle.") }
        }
    }

    private func retake(_ angle: ScanAngle) {
        withAnimation { shots[angle] = nil; previews[angle] = nil }
        if accepted.contains(angle.rawValue), let s = session { Task { if let u = try? await SessionCaller(id: s.id, account: account).removeView(angle) { session = u } } }
    }

    // MARK: Camera UI

    private var cameraView: some View {
        ZStack {
            CameraPreview(session: camera.session).ignoresSafeArea()
            Color.white.opacity(flash ? 0.85 : 0).ignoresSafeArea().allowsHitTesting(false)
            OrbitGuide(target: target, done: Set(ScanAngle.allCases.filter { accepted.contains($0.rawValue) || shots[$0] == .accepted }), uploading: Set(ScanAngle.allCases.filter { shots[$0] == .uploading }))
                .frame(width: 290, height: 290).allowsHitTesting(false)
            if celebrate { ConfettiBurst() }
            VStack(spacing: 12) {
                HStack {
                    Spacer()
                    Text("\(doneCount)/6").font(Typeface.mono(13, 800)).foregroundStyle(.white).contentTransition(.numericText()).padding(.horizontal, 12).padding(.vertical, 8).glass(Capsule(), tint: Pad.ink.opacity(0.5))
                }
                .padding(.horizontal, 16).padding(.top, 4)
                if let t = target {
                    VStack(spacing: 4) {
                        Text(t.title.uppercased()).font(Typeface.mono(12, 800)).tracking(1.5).foregroundStyle(Pad.skyLight)
                        Text(t.hint).font(Typeface.sans(16, 750)).foregroundStyle(.white).multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 18).padding(.vertical, 12).glass(RoundedRectangle(cornerRadius: 20, style: .continuous), tint: Pad.ink.opacity(0.45))
                    .id(t).transition(.push(from: .trailing))
                }
                if let (a, m) = rejected {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.counterclockwise.circle.fill").font(.system(size: 22)).foregroundStyle(Pad.amber)
                        VStack(alignment: .leading, spacing: 2) { Text("Retake \(a.short)").font(Typeface.sans(14, 800)); Text(m).font(Typeface.sans(12, 600)).opacity(0.85) }
                        Spacer()
                        Button("Retake") { retake(a) }.font(Typeface.sans(13, 800)).padding(.horizontal, 12).padding(.vertical, 8).background(Capsule().fill(.white)).foregroundStyle(Pad.ink)
                    }
                    .foregroundStyle(.white).padding(12).background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Pad.ink.opacity(0.85)))
                    .padding(.horizontal, 16).transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
                thumbStrip
                Button(action: shoot) {
                    ZStack {
                        Circle().stroke(.white, lineWidth: 5).frame(width: 82, height: 82)
                        Circle().fill(.white).frame(width: 66, height: 66).scaleEffect(busy ? 0.85 : 1)
                        if busy { ProgressView().tint(Pad.ink) }
                    }
                }
                .buttonStyle(PressStyle(scale: 0.9, sound: false))
                .disabled(target == nil || busy)
                .opacity(target == nil ? 0.4 : 1)
                .padding(.bottom, 20)
                .accessibilityLabel("Take photo")
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.82), value: target)
    }

    private var thumbStrip: some View {
        HStack(spacing: 8) {
            ForEach(ScanAngle.allCases) { a in
                let state = accepted.contains(a.rawValue) ? .accepted : shots[a]
                Button { if case .rejected = state { retake(a) } } label: {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.white.opacity(0.12))
                        if let img = previews[a] { Color.clear.overlay { Image(uiImage: img).resizable().scaledToFill().allowsHitTesting(false) }.clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)) }
                        switch state {
                        case .accepted: Image(systemName: "checkmark.circle.fill").font(.system(size: 18)).foregroundStyle(.white, Pad.up)
                        case .uploading: ProgressView().tint(.white)
                        case .rejected: Image(systemName: "exclamationmark.circle.fill").font(.system(size: 18)).foregroundStyle(.white, Pad.down)
                        case nil: Text(a.short).font(Typeface.mono(9, 800)).foregroundStyle(.white.opacity(0.7))
                        }
                    }
                    .frame(width: 48, height: 48)
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(a == target ? Pad.skyLight : .clear, lineWidth: 2))
                    .scaleEffect(a == target ? 1.08 : 1)
                }
                .buttonStyle(.quiet)
            }
        }
    }
}

/// Ring of six stations around the object; the current one pulses, finished ones glow green.
struct OrbitGuide: View {
    let target: ScanAngle?
    let done: Set<ScanAngle>
    let uploading: Set<ScanAngle>
    @State private var spin: Double = 0
    var body: some View {
        GeometryReader { geo in
            let r = min(geo.size.width, geo.size.height) / 2 - 14
            ZStack {
                Circle().stroke(.white.opacity(0.25), style: StrokeStyle(lineWidth: 1.5, dash: [4, 7])).rotationEffect(.degrees(spin))
                Circle().trim(from: 0, to: Double(done.count) / 6).stroke(Pad.up, style: StrokeStyle(lineWidth: 3, lineCap: .round)).rotationEffect(.degrees(-90)).animation(.spring, value: done.count)
                ForEach(ScanAngle.allCases) { a in
                    let rad = (a.degrees - 90) * .pi / 180
                    let isTarget = a == target
                    ZStack {
                        if isTarget { Circle().fill(Pad.skyLight.opacity(0.35)).frame(width: 40, height: 40).modifier(Pulse()) }
                        Circle().fill(done.contains(a) ? Pad.up : isTarget ? Pad.sky : .white.opacity(0.3)).frame(width: isTarget ? 22 : 14, height: isTarget ? 22 : 14)
                        if done.contains(a) { Image(systemName: "checkmark").font(.system(size: 8, weight: .black)).foregroundStyle(.white) }
                        if uploading.contains(a) { ProgressView().tint(.white).controlSize(.mini) }
                    }
                    .offset(x: cos(rad) * r * (a.index >= 4 ? 0.6 : 1), y: sin(rad) * r * (a.index >= 4 ? 0.6 : 1))
                }
                Image(systemName: "viewfinder").font(.system(size: 64, weight: .ultraLight)).foregroundStyle(.white.opacity(0.55))
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .onAppear { withAnimation(.linear(duration: 30).repeatForever(autoreverses: false)) { spin = 360 } }
    }
}

struct Pulse: ViewModifier {
    @State private var on: Bool = false
    func body(content: Content) -> some View {
        content.scaleEffect(on ? 1.5 : 0.8).opacity(on ? 0 : 1)
            .onAppear { withAnimation(.easeOut(duration: 1.2).repeatForever(autoreverses: false)) { on = true } }
    }
}
