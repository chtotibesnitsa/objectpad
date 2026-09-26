import SwiftUI

/// Four visual steps (object → reward → cover → post) with a live poster, then the cover studio and escrow.
struct RewardCreateView: View {
    let onDone: (String) -> Void
    @Environment(AccountStore.self) private var account
    @Environment(\.dismiss) private var dismiss

    @State private var step: Int = 0
    @State private var object: String = ""
    @State private var brief: String = ""
    @State private var category: String = "find"
    @State private var usd: Int = 50
    @State private var days: Int = 14
    @State private var aiCover: Bool = true
    @State private var photo: RewardPhoto?
    @State private var promo: String = ""
    @State private var adult: Bool = false
    @State private var busy: Bool = false
    @State private var error: String?
    @State private var draft: Reward?

    private let cats: [(String, String, String, String, [Color])] = [
        ("find", "Find it", "Track it down IRL", "magnifyingglass", [Pad.sky, Pad.skyLight]), ("scan", "Scan it", "Scan it in 3D", "cube.transparent", [Pad.graphite, Color(hex: 0x3A3E48)]),
        ("promo", "Promote", "Promote my coin", "megaphone.fill", [Pad.amber, Color(hex: 0xFBBF24)]), ("meme", "Meme IRL", "Meme made real", "face.smiling.inverse", [Color(hex: 0x10B981), Color(hex: 0x34D399)]),
        ("art", "Art", "Art & merch", "paintpalette.fill", [Color(hex: 0xEC4899), Color(hex: 0xF472B6)]), ("other", "Other", "Anything else", "diamond.fill", [Color(hex: 0x6366F1), Color(hex: 0x818CF8)]),
    ]
    private var auto: String { "Find a real \(object.trimmingCharacters(in: .whitespaces).isEmpty ? "object" : object.trimmingCharacters(in: .whitespaces)) in the wild, scan it on ObjectPad and launch its coin. First approved proof takes the reward." }
    private var valid: Bool { [object.trimmingCharacters(in: .whitespaces).count >= 2, (5...10_000).contains(usd), aiCover || photo != nil, true][step] }
    private var preview: Reward {
        var r = draft ?? (try! ObjectPadApi.decoder.decode(Reward.self, from: Data("{}".utf8)))
        if draft == nil { r.id = "preview"; r.object = object.isEmpty ? "your object" : object; r.title = "First \(r.object) scan"; r.rewardUsd = Double(usd); r.image = aiCover ? "" : (photo?.url ?? "") }
        return r
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let d = draft {
                        CoverStudioCard(reward: d) { draft = $0 }
                        FundCard(reward: d) { r in Feedback.success(.coins); onDone(r.id) }
                        Button("Fund later from the bounty page") { onDone(d.id) }.font(Typeface.sans(14, 750)).foregroundStyle(Pad.muted).frame(maxWidth: .infinity)
                    } else {
                        Group {
                            switch step {
                            case 0: stepObject
                            case 1: stepReward
                            case 2: stepCover
                            default: stepPost
                            }
                        }
                        .id(step)
                        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))
                        if let error { ErrorBanner(message: error) }
                    }
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            if draft == nil { footer }
        }
        .background(Pad.page.ignoresSafeArea())
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Lab(draft != nil ? "Step 5 · Your poster & escrow" : "Step \(step + 1) of 4", color: .white.opacity(0.55))
                    Text(draft != nil ? "Looking good." : ["What’s the hunt?", "Put money on it", "Pick a cover", "Ready to post"][step]).font(Typeface.display(26)).foregroundStyle(.white).contentTransition(.opacity)
                }
                Spacer()
                CircleIconButton(icon: "xmark", dark: true) { dismiss() }
            }
            HStack(spacing: 6) { ForEach(0..<5, id: \.self) { i in Capsule().fill(i <= (draft != nil ? 4 : step) ? .white : .white.opacity(0.15)).frame(height: 6) } }
                .animation(.spring, value: step)
        }
        .padding(18).padding(.top, 4)
        .background(ZStack { Pad.night; VoxelField(count: 14, seed: 7).opacity(0.6) }.ignoresSafeArea(edges: .top))
    }

    private var posterPreview: some View {
        Color.clear.aspectRatio(16 / 8, contentMode: .fit).overlay { SkyPoster(reward: preview).allowsHitTesting(false) }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous)).shadow(color: Pad.sky.opacity(0.3), radius: 16, y: 10)
    }

    private var stepObject: some View {
        VStack(alignment: .leading, spacing: 14) {
            posterPreview
            Text("Name the object").font(Typeface.sans(14, 800))
            TextField("Rotary phone, Pepe plush…", text: $object).font(Typeface.display(26)).padding(16)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.white)).overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Pad.ink.opacity(0.12), lineWidth: 1.5))
                .onChange(of: object) { _, v in if v.count > 60 { object = String(v.prefix(60)) } }
            ScrollView(.horizontal) { HStack(spacing: 6) { ForEach(["Rotary phone", "Pepe plush", "Singing fish", "Gold Nokia", "Vintage Game Boy"], id: \.self) { i in Pill(title: i, on: object == i) { object = i } } } }.scrollIndicators(.hidden)
            Text("What kind of hunt?").font(Typeface.sans(14, 800)).padding(.top, 4)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                ForEach(cats, id: \.0) { c in
                    let on = category == c.0
                    Button { Feedback.selection(); withAnimation(.spring(response: 0.3)) { category = c.0 } } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack { Image(systemName: c.3).font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 42, height: 42).background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(LinearGradient(colors: c.4, startPoint: .topLeading, endPoint: .bottomTrailing))); Spacer(); if on { Image(systemName: "checkmark.circle.fill").foregroundStyle(.white) } }
                            VStack(alignment: .leading, spacing: 1) { Text(c.1).font(Typeface.sans(15, 800)); Text(c.2).font(Typeface.sans(11.5, 600)).opacity(0.6) }
                        }
                        .foregroundStyle(on ? .white : Pad.ink).padding(13).frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(on ? Pad.ink : .white).shadow(color: Pad.ink.opacity(on ? 0.3 : 0.05), radius: on ? 14 : 4, y: on ? 8 : 2))
                        .scaleEffect(on ? 1.02 : 1)
                    }
                    .buttonStyle(.quiet)
                }
            }
            PadField(label: "The ask (optional)", placeholder: auto, text: $brief, axis: .vertical)
        }
    }

    private var stepReward: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 12) {
                Lab("Reward · paid in ETH", color: .white.opacity(0.55))
                HStack(spacing: 14) {
                    stepper("minus") { usd = max(5, usd - (usd > 100 ? 50 : 5)) }
                    RollingText(text: Fmt.money(Double(usd)), font: Typeface.display(50), color: .white).frame(minWidth: 150)
                    stepper("plus") { usd = min(10_000, usd + (usd >= 100 ? 50 : 5)) }
                }
                Text("$5 – $10,000 · locked at the live ETH rate").font(Typeface.mono(11, 700)).foregroundStyle(.white.opacity(0.5))
                ScrollView(.horizontal) { HStack(spacing: 6) { ForEach([10, 25, 50, 100, 250, 500, 1000], id: \.self) { v in
                    Button { Feedback.selection(); withAnimation(.snappy) { usd = v } } label: { Text(Fmt.money(Double(v))).font(Typeface.sans(14, 800)).foregroundStyle(usd == v ? Pad.ink : .white).padding(.horizontal, 14).frame(height: 40).background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(usd == v ? .white : .white.opacity(0.1))) }.buttonStyle(.quiet)
                } } }.scrollIndicators(.hidden)
            }
            .padding(18).frame(maxWidth: .infinity).smoke(28)
            Label("Runs for", systemImage: "timer").font(Typeface.sans(14, 800))
            HStack(spacing: 8) {
                ForEach([3, 7, 14, 30, 0], id: \.self) { d in
                    let on = days == d
                    Button { Feedback.selection(); withAnimation(.snappy) { days = d } } label: {
                        VStack(spacing: 3) { if d == 0 { Image(systemName: "infinity").font(.system(size: 22, weight: .bold)) } else { Text("\(d)").font(Typeface.display(24)) }; Text(d == 0 ? "until won" : "days").font(Typeface.sans(11, 650)).opacity(0.6) }
                            .foregroundStyle(on ? .white : Pad.ink).frame(maxWidth: .infinity, minHeight: 76)
                            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(on ? Pad.ink : .white).shadow(color: Pad.ink.opacity(on ? 0.3 : 0.04), radius: on ? 12 : 3, y: on ? 6 : 1))
                    }.buttonStyle(.quiet)
                }
            }
            Text("A live countdown shows on your bounty. Shorter deadlines rank higher in “Best right now”.").font(Typeface.sans(12.5, 600)).foregroundStyle(Pad.muted)
        }
    }

    private func stepper(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button { Feedback.selection(); withAnimation(.snappy) { action() } } label: { Image(systemName: icon).font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 48, height: 48).background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.12))) }.buttonStyle(.press)
    }

    private var stepCover: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                modeTile("AI sky poster", "Painted for you in the ObjectPad style", "wand.and.stars", aiCover, Pad.sky) { aiCover = true }
                modeTile("My own photo", "Upload the exact cover you want", "camera.fill", !aiCover, Pad.ink) { aiCover = false }
            }
            posterPreview
            PhotoDrop(photo: photo, busy: busy, title: aiCover ? "Inspire the AI (optional)" : "Upload your cover", subtitle: aiCover ? "Add a photo of the object and the AI paints the poster to match it. You can regenerate after posting." : "JPG or PNG. Location data is stripped on upload.", onImage: upload, onClear: { photo = nil })
        }
    }

    private func modeTile(_ title: String, _ sub: String, _ icon: String, _ on: Bool, _ accent: Color, _ action: @escaping () -> Void) -> some View {
        Button { Feedback.selection(); withAnimation(.spring(response: 0.3)) { action() } } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack { Image(systemName: icon).font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44).background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(on ? .white.opacity(0.2) : Pad.ink)); Spacer(); if on { Image(systemName: "checkmark.circle.fill") } }
                VStack(alignment: .leading, spacing: 2) { Text(title).font(Typeface.sans(15, 800)); Text(sub).font(Typeface.sans(11.5, 600)).opacity(0.7).multilineTextAlignment(.leading) }
            }
            .foregroundStyle(on ? .white : Pad.ink).padding(14).frame(maxWidth: .infinity, minHeight: 130, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(on ? accent : .white).shadow(color: on ? accent.opacity(0.45) : Pad.ink.opacity(0.05), radius: on ? 16 : 4, y: on ? 8 : 2))
        }
        .buttonStyle(.quiet)
    }

    private var stepPost: some View {
        VStack(alignment: .leading, spacing: 14) {
            posterPreview
            HStack(spacing: 8) {
                StatTile(label: "Reward", value: Fmt.money(Double(usd)))
                StatTile(label: "Runs", value: days == 0 ? "Until won" : "\(days) days")
                StatTile(label: "Cover", value: aiCover ? (photo == nil ? "AI" : "AI+photo") : "Photo")
            }
            PadField(label: "Your link (optional)", placeholder: "https://x.com/yourcoin", text: $promo, mono: true, keyboard: .URL)
            Button { Feedback.selection(); adult.toggle() } label: {
                HStack(spacing: 12) {
                    Image(systemName: adult ? "checkmark.square.fill" : "square").font(.system(size: 20))
                    Text("18+ object · cover blurred until tapped").font(Typeface.sans(13.5, 750))
                    Spacer()
                }
                .foregroundStyle(adult ? .white : Pad.ink).padding(14).background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(adult ? Pad.ink : .white))
            }.buttonStyle(.quiet)
            Text("Hunters submit photo proofs. You pick the winner and the escrow pays them in one tap. Bounties must follow the safety rules; ObjectPad can remove abusive ones (funded ones are refunded).").font(Typeface.sans(12, 600)).foregroundStyle(Pad.muted)
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if step > 0 { CircleIconButton(icon: "arrow.left", size: 56) { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { step -= 1 } } }
            PadButton(title: step == 3 ? "Post bounty · \(Fmt.money(Double(usd)))" : "Continue", icon: step == 3 ? "sparkles" : "arrow.right", kind: step == 3 ? .sky : .ink, busy: busy && step == 3, enabled: valid && !busy) {
                if step < 3 { withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { step += 1 } } else { post() }
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
    }

    private func upload(_ img: UIImage) {
        guard let jpeg = img.jpeg() else { return }
        busy = true; error = nil
        Task { do { photo = try await RewardsApi(account: account).upload(jpeg) } catch { self.error = error.localizedDescription }; busy = false }
    }

    private func post() {
        busy = true; error = nil
        Task {
            do {
                let o = object.trimmingCharacters(in: .whitespaces)
                let b = brief.trimmingCharacters(in: .whitespaces)
                let r = try await RewardsApi(account: account).create(object: o, brief: String((b.count >= 10 ? b : auto).prefix(280)), category: category, usd: usd, days: days, promo: promo.trimmingCharacters(in: .whitespaces), adult: adult,
                    rules: ["Real object, found in person", "Clear photo proof", "First approved proof wins"], cover: aiCover ? "" : (photo?.hash ?? ""), inspire: aiCover ? (photo?.hash ?? "") : "")
                Feedback.success(.seal)
                withAnimation(.spring) { draft = r }
            } catch { self.error = error.localizedDescription; Feedback.error() }
            busy = false
        }
    }
}
