import SwiftUI
import UIKit
import CoreText

/// ObjectPad's pearl-and-ink palette (1:1 with the website) plus the sky blue of the Paid Rewards posters.
enum Pad {
    static let paper = Color(hex: 0xECEEF1)
    static let pearl = Color(hex: 0xF8F9FA)
    static let ink = Color(hex: 0x0C0D10)
    static let graphite = Color(hex: 0x1B1D22)
    static let obsidian = Color(hex: 0x0B0C0F)
    static let muted = Color(hex: 0x6A6E78)
    static let line = Color(hex: 0xDADDE3)
    static let up = Color(hex: 0x12A150)
    static let down = Color(hex: 0xE5484D)
    static let sky = Color(hex: 0x2F7BF2)
    static let skyLight = Color(hex: 0x6FB2FF)
    static let amber = Color(hex: 0xF59E0B)
    static let gold = Color(hex: 0xF5C542)

    static let page = LinearGradient(colors: [Color(hex: 0xF3F4F6), paper, Color(hex: 0xE3E6EB)], startPoint: .top, endPoint: .bottom)
    static let night = LinearGradient(colors: [Color(hex: 0x2C2F36), Color(hex: 0x17191E), Color(hex: 0x111216)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let skyGradient = LinearGradient(colors: [sky, skyLight, Color(hex: 0xBFE0FF)], startPoint: .top, endPoint: .bottom)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

/// The website's three faces (Anybody display, Geist, Geist Mono), driven through their variable axes.
enum Typeface {
    private static var cache: [String: UIFont] = [:]
    private static var registered = false

    static func register() {
        guard !registered else { return }
        registered = true
        for name in ["anybody", "geist", "geistmono"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
        }
    }

    private static func variable(_ postScript: String, size: CGFloat, weight: CGFloat, width: CGFloat? = nil) -> UIFont {
        let key = "\(postScript)-\(size)-\(weight)-\(width ?? 0)"
        if let hit = cache[key] { return hit }
        register()
        var axes: [NSNumber: NSNumber] = [NSNumber(value: 0x77676874): NSNumber(value: Double(weight))]
        if let width { axes[NSNumber(value: 0x77647468)] = NSNumber(value: Double(width)) }
        let base = UIFontDescriptor(fontAttributes: [.name: postScript])
        let desc = base.addingAttributes([UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): axes])
        let font = UIFont(descriptor: desc, size: size)
        let resolved = font.familyName.lowercased().contains(postScript.prefix(4).lowercased()) ? font : UIFont.systemFont(ofSize: size, weight: .heavy)
        cache[key] = resolved
        return resolved
    }

    static func display(_ size: CGFloat, weight: CGFloat = 820) -> Font { Font(variable("Anybody-Thin", size: size, weight: weight, width: 116)) }
    static func sans(_ size: CGFloat, _ weight: CGFloat = 600) -> Font { Font(variable("Geist-Regular", size: size, weight: weight)) }
    static func mono(_ size: CGFloat, _ weight: CGFloat = 700) -> Font { Font(variable("GeistMono-Regular", size: size, weight: weight)) }
}

extension View {
    /// Liquid Glass on iOS 26, a frosted material fallback before that.
    @ViewBuilder func glass<S: Shape>(_ shape: S, tint: Color? = nil, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            let base: Glass = tint.map { Glass.regular.tint($0) } ?? .regular
            self.glassEffect(interactive ? base.interactive() : base, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
                .background(tint?.opacity(0.35) ?? .clear, in: shape)
                .overlay(shape.stroke(.white.opacity(0.55), lineWidth: 0.8))
        }
    }

    /// Pearl card: white-to-pearl surface with a hairline and soft drop shadow (the website's `.raised`).
    func raised(_ radius: CGFloat = 26) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(LinearGradient(colors: [.white, Pad.pearl], startPoint: .top, endPoint: .bottom))
                .shadow(color: Pad.ink.opacity(0.08), radius: 18, y: 10)
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Pad.ink.opacity(0.07), lineWidth: 1))
        )
    }

    /// Dark smoked-glass panel (the website's `.smoke`).
    func smoke(_ radius: CGFloat = 26) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Pad.night)
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(RadialGradient(colors: [.white.opacity(0.14), .clear], center: .topLeading, startRadius: 0, endRadius: 260)))
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(.white.opacity(0.14), lineWidth: 1.2))
                .shadow(color: Pad.ink.opacity(0.35), radius: 24, y: 16)
        )
    }

    func sunk(_ radius: CGFloat = 18) -> some View {
        background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Pad.ink.opacity(0.05)))
    }

    /// Staggered entrance: fades and lifts in with a spring after `delay`.
    func enter(_ delay: Double = 0) -> some View { modifier(EnterModifier(delay: delay)) }
}

private struct EnterModifier: ViewModifier {
    let delay: Double
    @State private var shown: Bool = false
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 18)
            .scaleEffect(shown ? 1 : 0.97)
            .onAppear { withAnimation(.spring(response: 0.55, dampingFraction: 0.82).delay(delay)) { shown = true } }
    }
}

/// Springy press with a tick sound and a light haptic.
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.955
    var sound: Bool = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .brightness(configuration.isPressed ? -0.03 : 0)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed { Feedback.tap(sound: sound) }
            }
    }
}

extension ButtonStyle where Self == PressStyle {
    static var press: PressStyle { PressStyle() }
    static var quiet: PressStyle { PressStyle(scale: 0.97, sound: false) }
}
