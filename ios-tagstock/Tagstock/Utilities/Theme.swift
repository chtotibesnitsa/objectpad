import SwiftUI

/// CasePad palette, lifted from the website's CSS variables: near-black canvas,
/// charcoal cards, bone-white type, a single warm gold accent, mint "up", rose "down".
enum Theme {
    static let background = Color(hue: 240 / 360, saturation: 0.05, brightness: 0.04)
    static let surface = Color(hue: 240 / 360, saturation: 0.04, brightness: 0.06)
    static let card = Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x16 / 255)
    static let cardRaised = Color(red: 0x1b / 255, green: 0x1b / 255, blue: 0x1e / 255)
    static let secondary = Color(hue: 240 / 360, saturation: 0.04, brightness: 0.14)
    static let border = Color.white.opacity(0.06)
    static let foreground = Color(hue: 40 / 360, saturation: 0.10, brightness: 0.96)
    static let muted = Color(hue: 240 / 360, saturation: 0.04, brightness: 0.63)
    static let gold = Color(hue: 30 / 360, saturation: 0.92, brightness: 0.61)
    static let goldDeep = Color(hue: 28 / 360, saturation: 0.77, brightness: 0.48)
    static let up = Color(hue: 150 / 360, saturation: 0.60, brightness: 0.58)
    static let down = Color(hue: 355 / 360, saturation: 0.75, brightness: 0.64)
    static let cobalt = Color(hue: 215 / 360, saturation: 0.72, brightness: 0.64)

    static func rarity(_ name: String) -> Color {
        switch name {
        case "uncommon": return Color(hue: 150 / 360, saturation: 0.55, brightness: 0.54)
        case "rare": return cobalt
        case "epic": return Color(hue: 270 / 360, saturation: 0.63, brightness: 0.68)
        case "legendary": return Color(hue: 40 / 360, saturation: 0.72, brightness: 0.60)
        case "mythic": return Color(hue: 348 / 360, saturation: 0.74, brightness: 0.68)
        default: return Color(hue: 230 / 360, saturation: 0.06, brightness: 0.68)
        }
    }
}

/// Small mono uppercase label used across the site ("eyebrow").
struct Eyebrow: View {
    let text: String
    var color: Color = Theme.muted
    init(_ text: String, color: Color = Theme.muted) { self.text = text; self.color = color }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .tracking(1.4)
            .foregroundStyle(color)
    }
}

/// Charcoal card matching `.coin-card` / `.card-raised`.
struct CardBackground: ViewModifier {
    var padding: CGFloat = 14
    var radius: CGFloat = 14
    var raised: Bool = false
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(raised ? Theme.cardRaised : Theme.card, in: .rect(cornerRadius: radius, style: .continuous))
    }
}

extension View {
    func card(padding: CGFloat = 14, radius: CGFloat = 14, raised: Bool = false) -> some View {
        modifier(CardBackground(padding: padding, radius: radius, raised: raised))
    }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.75), value: configuration.isPressed)
    }
}

/// Primary CTA: bone-white pill with black text, as on the website.
struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = Theme.foreground
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Theme.background)
            .padding(.horizontal, 18)
            .frame(minHeight: 44)
            .background(tint.opacity(configuration.isPressed ? 0.8 : 1), in: .rect(cornerRadius: 10, style: .continuous))
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(Theme.foreground)
            .padding(.horizontal, 14)
            .frame(minHeight: 40)
            .background(Theme.secondary.opacity(configuration.isPressed ? 0.7 : 1), in: .rect(cornerRadius: 10, style: .continuous))
    }
}

/// "casepad." wordmark with the warm gold dot.
struct Wordmark: View {
    var size: CGFloat = 22
    var body: some View {
        HStack(spacing: 8) {
            Image("case_mark").resizable().scaledToFit().frame(width: size * 1.5, height: size * 1.5)
            (Text("casepad").foregroundStyle(Theme.foreground) + Text(".").foregroundStyle(Theme.gold))
                .font(.system(size: size, weight: .heavy, design: .default))
                .tracking(-1.2)
        }
        .accessibilityLabel("CasePad")
    }
}
