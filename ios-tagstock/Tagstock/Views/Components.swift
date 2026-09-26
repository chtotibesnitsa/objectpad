import SwiftUI
import UIKit

// MARK: - Text styles

struct Lab: View {
    let text: String
    var color: Color = Pad.ink.opacity(0.55)
    init(_ text: String, color: Color = Pad.ink.opacity(0.55)) { self.text = text; self.color = color }
    var body: some View { Text(text.uppercased()).font(Typeface.mono(10.5, 800)).tracking(1.2).foregroundStyle(color) }
}

struct Display: View {
    let text: String
    var size: CGFloat = 34
    var color: Color = Pad.ink
    init(_ text: String, size: CGFloat = 34, color: Color = Pad.ink) { self.text = text; self.size = size; self.color = color }
    var body: some View { Text(text).font(Typeface.display(size)).tracking(-size * 0.03).foregroundStyle(color).lineSpacing(-size * 0.12) }
}

// MARK: - Buttons

enum PadButtonKind { case ink, pearl, sky, up, down, ghost }

struct PadButton: View {
    let title: String
    var icon: String? = nil
    var kind: PadButtonKind = .ink
    var busy: Bool = false
    var enabled: Bool = true
    var height: CGFloat = 56
    let action: () -> Void

    private var colors: (Color, Color) {
        switch kind {
        case .ink: return (Pad.ink, .white)
        case .pearl: return (.white, Pad.ink)
        case .sky: return (Pad.sky, .white)
        case .up: return (Pad.up, .white)
        case .down: return (Pad.down, .white)
        case .ghost: return (Pad.ink.opacity(0.07), Pad.ink)
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(colors.1) } else if let icon { Image(systemName: icon).font(.system(size: 16, weight: .bold)) }
                Text(title).font(Typeface.sans(15.5, 800)).lineLimit(1)
            }
            .foregroundStyle(colors.1)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(Capsule().fill(colors.0).shadow(color: kind == .sky ? Pad.sky.opacity(0.45) : kind == .ink ? Pad.ink.opacity(0.25) : .clear, radius: 14, y: 8))
            .overlay(Capsule().stroke(kind == .pearl ? Pad.ink.opacity(0.1) : .white.opacity(kind == .ghost ? 0 : 0.12), lineWidth: 1))
            .opacity(enabled ? 1 : 0.4)
        }
        .buttonStyle(.press)
        .disabled(!enabled || busy)
    }
}

struct CircleIconButton: View {
    let icon: String
    var dark: Bool = false
    var size: CGFloat = 44
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(dark ? .white : Pad.ink)
                .frame(width: size, height: size)
                .glass(Circle(), tint: dark ? Pad.ink.opacity(0.6) : nil, interactive: true)
        }
        .buttonStyle(.press)
    }
}

/// Selectable pill used for filters and sorts.
struct Pill: View {
    let title: String
    var icon: String? = nil
    let on: Bool
    var accent: Color = Pad.ink
    let action: () -> Void
    var body: some View {
        Button { Feedback.selection(); action() } label: {
            HStack(spacing: 5) {
                if let icon { Image(systemName: icon).font(.system(size: 11, weight: .bold)) }
                Text(title).font(Typeface.sans(13, 800))
            }
            .padding(.horizontal, 15).frame(height: 38)
            .foregroundStyle(on ? .white : Pad.ink.opacity(0.7))
            .background(Capsule().fill(on ? accent : .white).shadow(color: on ? accent.opacity(0.35) : Pad.ink.opacity(0.05), radius: on ? 10 : 2, y: on ? 6 : 1))
        }
        .buttonStyle(.quiet)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: on)
    }
}

/// Segmented control on an ink track with a sliding white thumb.
struct InkSegmented<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selection: T
    @Namespace private var ns
    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.0) { value, label in
                let on = value == selection
                Button { Feedback.selection(); withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { selection = value } } label: {
                    Text(label).font(Typeface.sans(13, 800)).lineLimit(1).minimumScaleFactor(0.8)
                        .foregroundStyle(on ? Pad.ink : .white.opacity(0.72))
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background { if on { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white).matchedGeometryEffect(id: "thumb", in: ns) } }
                }
                .buttonStyle(.quiet)
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Pad.ink))
    }
}

// MARK: - Live bits

struct PulseDot: View {
    var color: Color = Pad.up
    var size: CGFloat = 7
    @State private var on: Bool = false
    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
            .background(Circle().fill(color.opacity(0.45)).scaleEffect(on ? 2.4 : 1).opacity(on ? 0 : 1))
            .onAppear { withAnimation(.easeOut(duration: 1.3).repeatForever(autoreverses: false)) { on = true } }
    }
}

/// Deadline pill that ticks every second; urgent (< 24h) pulses red, soon (< 3d) is amber.
struct CountdownPill: View {
    let deadline: Double?
    var big: Bool = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let c = Countdown.of(deadline, now: ctx.date)
            let bg: Color = c.tier == .urgent ? Pad.down : c.tier == .soon ? Pad.amber : Pad.ink.opacity(c.tier == .ended ? 0.6 : 0.8)
            let fg: Color = c.tier == .soon ? Pad.ink : .white
            HStack(spacing: 5) {
                if c.tier == .urgent { PulseDot(color: .white, size: 6) } else { Image(systemName: "timer").font(.system(size: big ? 13 : 10, weight: .heavy)) }
                Text(c.label.uppercased()).font(Typeface.mono(big ? 13 : 10.5, 800)).monospacedDigit().contentTransition(.numericText(countsDown: true))
            }
            .foregroundStyle(fg)
            .padding(.horizontal, big ? 12 : 9).padding(.vertical, big ? 7 : 5)
            .background(Capsule().fill(bg).shadow(color: c.tier == .urgent ? Pad.down.opacity(0.6) : .clear, radius: 12))
        }
    }
}

/// Numbers that roll to their new value.
struct RollingText: View {
    let text: String
    var font: Font = Typeface.display(28)
    var color: Color = Pad.ink
    var body: some View {
        Text(text).font(font).foregroundStyle(color).monospacedDigit()
            .contentTransition(.numericText())
            .animation(.spring(response: 0.6, dampingFraction: 0.85), value: text)
    }
}

// MARK: - Imagery

/// Remote image with a soft shimmer placeholder.
struct RemoteImage: View {
    let url: URL?
    var fallback: String = ""
    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.35))) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill().transition(.opacity)
            case .failure: ZStack { LinearGradient(colors: [Pad.line, Pad.paper], startPoint: .top, endPoint: .bottom); Text(fallback.prefix(3).uppercased()).font(Typeface.mono(12, 800)).foregroundStyle(Pad.muted) }
            default: Shimmer()
            }
        }
    }
}

struct Shimmer: View {
    @State private var x: CGFloat = -1
    var body: some View {
        GeometryReader { geo in
            Pad.ink.opacity(0.06).overlay(
                LinearGradient(colors: [.clear, .white.opacity(0.55), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: geo.size.width * 0.6).offset(x: x * geo.size.width)
            ).clipped()
        }
        .onAppear { withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { x = 1.4 } }
    }
}

struct CoinAvatar: View {
    let url: String
    var symbol: String = ""
    var size: CGFloat = 48
    var body: some View {
        Color.white.frame(width: size, height: size)
            .overlay { RemoteImage(url: URL(string: url), fallback: symbol).allowsHitTesting(false) }
            .clipShape(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous).stroke(Pad.ink.opacity(0.08), lineWidth: 1))
    }
}

/// Floating glass icon (the website's glass object set) with a gentle bob.
struct GlassIcon: View {
    let name: String
    var size: CGFloat = 44
    var float: Bool = false
    @State private var up: Bool = false
    var body: some View {
        Image(name).resizable().scaledToFit().frame(width: size, height: size)
            .offset(y: float && up ? -5 : 0)
            .onAppear { if float { withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) { up = true } } }
    }
}

/// Drifting voxel cubes with binary glyphs: the "object dissolving into data" motif, drawn natively on Canvas.
struct VoxelField: View {
    var count: Int = 22
    var seed: Int = 1
    var color: Color = .white
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
            Canvas { gc, size in
                let t = ctx.date.timeIntervalSinceReferenceDate
                var s = UInt64(seed * 9301 + 49297)
                func rnd() -> Double { s = (s &* 6364136223846793005 &+ 1442695040888963407); return Double(s >> 33) / Double(1 << 31) }
                for _ in 0..<count {
                    let x = rnd() * size.width, base = rnd() * size.height, side = 6 + rnd() * 14, speed = 6 + rnd() * 14, phase = rnd() * 10
                    let y = (base - (t * speed).truncatingRemainder(dividingBy: size.height + 40) + size.height + 40).truncatingRemainder(dividingBy: size.height + 40) - 20
                    let alpha = 0.25 + 0.55 * (0.5 + 0.5 * sin(t * 1.3 + phase))
                    let rect = CGRect(x: x, y: y, width: side, height: side)
                    gc.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(color.opacity(alpha * 0.55)))
                    gc.stroke(Path(roundedRect: rect, cornerRadius: 2), with: .color(color.opacity(alpha)), lineWidth: 0.8)
                    if side > 12 {
                        let glyph = ["0", "1", "#"][Int(phase * 10) % 3]
                        gc.draw(Text(glyph).font(.system(size: side * 0.6, weight: .black, design: .monospaced)).foregroundStyle(color.opacity(alpha)), at: CGPoint(x: rect.midX, y: rect.midY))
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// Drifting cloud blobs for sky backgrounds.
struct CloudDrift: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { ctx in
            Canvas { gc, size in
                let t = ctx.date.timeIntervalSinceReferenceDate
                gc.addFilter(.blur(radius: 18))
                for i in 0..<6 {
                    let d = Double(i)
                    let x = (d * 97 + t * (6 + d * 2)).truncatingRemainder(dividingBy: size.width + 200) - 100
                    let y = size.height * (0.15 + 0.13 * d)
                    gc.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 150 + d * 20, height: 50 + d * 6)), with: .color(.white.opacity(0.55)))
                }
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Rewards imagery

/// A bounty's cover: the real image (ObjectPad art, AI cover or the poster's upload), or a live-drawn sky poster.
struct SkyPoster: View {
    let reward: Reward
    var big: Bool = false
    var reveal: Bool = true
    var body: some View {
        ZStack {
            Pad.skyGradient
            if let url = reward.imageURL {
                RemoteImage(url: url).blur(radius: reveal ? 0 : 30).allowsHitTesting(false)
            } else {
                CloudDrift()
                VoxelField(count: big ? 26 : 14, seed: abs(reward.id.hashValue % 999)).frame(maxWidth: .infinity, alignment: .trailing).mask(LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing))
                HStack {
                    VStack(alignment: .leading, spacing: big ? 8 : 4) {
                        Text("FIRST \(reward.object.uppercased()) SCAN: \(Fmt.money(reward.rewardUsd))").font(Typeface.display(big ? 30 : 18)).foregroundStyle(.white).shadow(color: .blue.opacity(0.4), radius: 8, y: 3).lineLimit(3)
                        Text("REWARDS ONLY GO UP.").font(Typeface.mono(big ? 12 : 9, 800)).foregroundStyle(.white.opacity(0.95))
                        Text("objectpad.fun").font(Typeface.display(big ? 22 : 14)).foregroundStyle(.white)
                    }
                    .padding(.leading, big ? 20 : 14)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                if reward.painting {
                    HStack(spacing: 6) { ProgressView().tint(.white).controlSize(.mini); Text("AI PAINTING").font(Typeface.mono(10, 800)) }
                        .foregroundStyle(.white).padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(Pad.ink.opacity(0.65)))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing).padding(10)
                    ScanSweep()
                }
            }
            if !reveal { Text("18+ · TAP TO VIEW").font(Typeface.mono(12, 800)).foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 8).glass(Capsule()) }
        }
        .clipped()
    }
}

/// Light sweep used while something is being generated or scanned.
struct ScanSweep: View {
    @State private var x: CGFloat = -0.6
    var body: some View {
        GeometryReader { geo in
            LinearGradient(colors: [.clear, .white.opacity(0.45), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: geo.size.width * 0.35).rotationEffect(.degrees(12)).offset(x: x * geo.size.width)
        }
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: false)) { x = 1.2 } }
    }
}

struct RewardStatusPill: View {
    let reward: Reward
    var body: some View {
        let (label, bg, fg): (String, Color, Color) = switch reward.status {
        case "open": ("OPEN", .white, Pad.ink)
        case "paid": ("PAID", Pad.up, .white)
        case "won": ("WINNER PICKED", Pad.up, .white)
        case "draft": ("DRAFT · FUND TO GO LIVE", Pad.ink, .white)
        case "paying": ("PAYING OUT", .white, Pad.ink)
        case "refunding": ("REFUNDING", .white, Pad.ink)
        default: ("CLOSED", .white.opacity(0.85), Pad.muted)
        }
        return HStack(spacing: 5) {
            if reward.status == "open" { PulseDot(size: 6) } else if reward.status == "paid" { Image(systemName: "checkmark").font(.system(size: 10, weight: .black)) }
            Text(label).font(Typeface.mono(10.5, 800))
        }
        .foregroundStyle(fg).padding(.horizontal, 10).padding(.vertical, 6).background(Capsule().fill(bg))
    }
}

// MARK: - Charts & misc

struct Sparkline: View {
    let points: [Double]
    var up: Bool = true
    var body: some View {
        GeometryReader { geo in
            let pts = points.count > 1 ? points : [0, 0]
            let lo = pts.min() ?? 0, hi = pts.max() ?? 1, span = max(hi - lo, 1e-12)
            let path = Path { p in
                for (i, v) in pts.enumerated() {
                    let pt = CGPoint(x: geo.size.width * CGFloat(i) / CGFloat(pts.count - 1), y: geo.size.height * (1 - CGFloat((v - lo) / span)))
                    if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
                }
            }
            path.stroke(up ? Pad.up : Pad.down, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
        }
    }
}

struct StatTile: View {
    let label: String
    let value: String
    var glass: String? = nil
    var dark: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Lab(label, color: dark ? .white.opacity(0.5) : Pad.ink.opacity(0.5)); Spacer(); if let glass { GlassIcon(name: glass, size: 26) } }
            RollingText(text: value, font: Typeface.display(22), color: dark ? .white : Pad.ink).lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(dark ? .white.opacity(0.08) : .white).shadow(color: Pad.ink.opacity(dark ? 0 : 0.05), radius: 8, y: 4))
    }
}

struct SectionHeader: View {
    let lab: String
    let title: String
    var action: String? = nil
    var onAction: (() -> Void)? = nil
    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) { Lab(lab); Display(title, size: 26) }
            Spacer()
            if let action, let onAction {
                Button(action: onAction) { HStack(spacing: 3) { Text(action).font(Typeface.sans(13, 800)); Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)) }.foregroundStyle(Pad.ink.opacity(0.6)) }.buttonStyle(.press)
            }
        }
    }
}

struct ErrorBanner: View {
    let message: String
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Pad.down)
            Text(message).font(Typeface.sans(13, 700)).foregroundStyle(Pad.down).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Pad.down.opacity(0.08)))
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// Styled text field on white with an ink focus ring.
struct PadField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var mono: Bool = false
    var axis: Axis = .horizontal
    var keyboard: UIKeyboardType = .default
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !label.isEmpty { Text(label).font(Typeface.sans(13, 800)).foregroundStyle(Pad.ink.opacity(0.75)) }
            TextField(placeholder, text: $text, axis: axis)
                .font(mono ? Typeface.mono(13.5, 600) : Typeface.sans(15.5, 650))
                .keyboardType(keyboard).textInputAutocapitalization(mono ? .never : .sentences).autocorrectionDisabled(mono)
                .lineLimit(axis == .vertical ? 3...6 : 1...1)
                .focused($focused)
                .padding(.horizontal, 16).padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.white))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(focused ? Pad.ink : Pad.ink.opacity(0.1), lineWidth: focused ? 2 : 1.2))
                .animation(.easeOut(duration: 0.15), value: focused)
        }
    }
}

/// Confetti burst of glyphs and voxels for big moments (launches, payouts, claims).
struct ConfettiBurst: View {
    @State private var go: Bool = false
    private let bits: [(Double, Double, Double, Color)] = (0..<34).map { i in
        let a = Double(i) / 34 * .pi * 2
        return (cos(a) * Double.random(in: 90...190), sin(a) * Double.random(in: 90...220) - 60, Double.random(in: -200...200), [Pad.sky, Pad.gold, Pad.up, .white, Pad.skyLight][i % 5])
    }
    var body: some View {
        ZStack {
            ForEach(0..<bits.count, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2).fill(bits[i].3).frame(width: 9, height: 9)
                    .offset(x: go ? bits[i].0 : 0, y: go ? bits[i].1 + 160 : 0)
                    .rotationEffect(.degrees(go ? bits[i].2 : 0))
                    .opacity(go ? 0 : 1)
            }
        }
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeOut(duration: 1.6)) { go = true } }
    }
}

extension UIImage {
    /// ≤ `max` px JPEG (the server re-encodes and strips metadata again).
    func jpeg(max: CGFloat = 1600, quality: CGFloat = 0.88) -> Data? {
        let scale = Swift.min(1, max / Swift.max(size.width, size.height))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }.jpegData(compressionQuality: quality)
    }
}
