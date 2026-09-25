import SwiftUI

/// Typed routes for deep links (`casepad.fun/token/0x...`, `/transactions/:id`, `/crates/:id`).
enum Route: Hashable {
    case token(String)
    case cases
    case battles
    case quests
    case leaderboard
    case launch
    case portfolio
    case market
    case keys
    case rewards
    case studio
    case howItWorks
    case fairness
    case help
    case settings
    case setup
    case playbook
    case practice
    case status
    case transactions
    case activity
    case wallet

    static func from(url: URL) -> Route? {
        let parts = url.pathComponents.filter { $0 != "/" }
        switch parts.first {
        case "token": return parts.count > 1 && Chain.isAddress(parts[1]) ? .token(parts[1].lowercased()) : nil
        case "crates", "cases": return .cases
        case "battles": return .battles
        case "quests": return .quests
        case "leaderboard": return .leaderboard
        case "launch": return .launch
        case "portfolio": return .portfolio
        case "market": return .market
        case "keys": return .keys
        case "rewards": return .rewards
        case "studio": return .studio
        case "how-it-works": return .howItWorks
        case "fairness": return .fairness
        case "help": return .help
        case "settings": return .settings
        case "setup": return .setup
        case "playbook": return .playbook
        case "practice": return .practice
        case "status": return .status
        case "transactions": return .transactions
        default: return nil
        }
    }
}

struct CoinImage: View {
    let image: String
    let ticker: String
    var size: CGFloat = 48
    var body: some View {
        Color(Theme.secondary)
            .frame(width: size, height: size)
            .overlay {
                if let url = URL(string: image), !image.isEmpty {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase { img.resizable().aspectRatio(contentMode: .fill) } else { fallback }
                    }.allowsHitTesting(false)
                } else { fallback }
            }
            .clipShape(.rect(cornerRadius: size * 0.25, style: .continuous))
    }
    private var fallback: some View {
        Text(ticker.prefix(2).uppercased()).font(.system(size: size * 0.42, weight: .black)).foregroundStyle(.white.opacity(0.8))
    }
}

struct StatCell: View {
    let label: String
    let value: String
    var tint: Color = Theme.foreground
    var alignTrailing: Bool = false
    var body: some View {
        VStack(alignment: alignTrailing ? .trailing : .leading, spacing: 4) {
            Eyebrow(label)
            Text(value).font(.system(size: 14, weight: .semibold, design: .monospaced)).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: alignTrailing ? .trailing : .leading)
    }
}

struct CopyChip: View {
    let label: String
    let value: String
    var display: String? = nil
    @Environment(AppStore.self) private var store
    var body: some View {
        Button { store.copy(value, label: label) } label: {
            HStack(spacing: 8) {
                Text(label).foregroundStyle(Theme.muted)
                Text(display ?? Format.shortAddress(value)).foregroundStyle(Theme.foreground)
                Image(systemName: "doc.on.doc").font(.system(size: 10))
            }
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .padding(.horizontal, 12).frame(height: 36)
            .background(Theme.secondary, in: .rect(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Copy \(label)")
    }
}

struct SkeletonCard: View {
    var height: CGFloat = 150
    @State private var pulse = false
    var body: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Theme.card)
            .frame(height: height)
            .opacity(pulse ? 0.55 : 1)
            .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever()) { pulse = true } }
    }
}

struct EmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "square.grid.2x2"
    init(title: String, body: String, systemImage: String = "square.grid.2x2") {
        self.title = title; self.message = body; self.systemImage = systemImage
    }
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage).font(.system(size: 26, weight: .bold)).foregroundStyle(Theme.muted.opacity(0.6))
            Text(title).font(.system(size: 17, weight: .bold))
            Text(message).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 36).padding(.horizontal, 20)
        .background(Theme.card, in: .rect(cornerRadius: 14, style: .continuous))
    }
}

struct ErrorState: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 10) {
            Text("Market connection unavailable").font(.system(size: 17, weight: .bold))
            Text(message).font(.system(size: 13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            Text("No prices or launches have been fabricated.").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
            Button("Reconnect", action: retry).buttonStyle(SecondaryButtonStyle())
        }
        .frame(maxWidth: .infinity).padding(24)
        .background(Theme.card, in: .rect(cornerRadius: 14, style: .continuous))
    }
}

struct SectionHead: View {
    let title: String
    var eyebrow: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 24, weight: .heavy)).tracking(-0.8)
            if let eyebrow { Eyebrow(eyebrow) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One row on the tape ("On the tape" table on the website).
struct TapeRow: View {
    let item: TickerItem
    @Environment(\.openURL) private var openURL
    var body: some View {
        HStack(spacing: 10) {
            Text(item.label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(item.isSell ? Theme.down : Theme.up)
                .frame(width: 62, alignment: .leading)
            NavigationLink(value: Route.token(item.token)) {
                Text("$\(item.tokenInfo?.ticker ?? Format.shortAddress(item.token))").font(.system(size: 12, weight: .bold)).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(item.amountWei.map { Format.eth($0, digits: 4) } ?? "—").font(.system(size: 11, design: .monospaced))
            if let hash = item.txHash {
                Button { openURL(Chain.txURL(hash)) } label: {
                    Image(systemName: "arrow.up.right.square").font(.system(size: 12)).foregroundStyle(Theme.muted)
                }.accessibilityLabel("Open transaction on Blockscout")
            }
            Text(Format.timeAgo(item.createdAt)).font(.system(size: 10)).foregroundStyle(Theme.muted).frame(width: 52, alignment: .trailing)
        }
        .padding(.vertical, 9)
    }
}

struct ToastBanner: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        VStack {
            if let toast = store.toast {
                Text(toast)
                    .font(.system(size: 12, weight: .bold))
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Theme.cardRaised, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.gold.opacity(0.5)))
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Spacer()
        }
        .padding(.top, 8)
        .animation(.spring(response: 0.3), value: store.toast)
        .allowsHitTesting(false)
    }
}

struct ModeBadge: View {
    let mode: String
    var body: some View {
        if mode == "demo" {
            Text("PRACTICE").font(.system(size: 9, weight: .bold, design: .monospaced)).padding(.horizontal, 6).padding(.vertical, 3)
                .background(Theme.gold.opacity(0.18), in: .rect(cornerRadius: 4)).foregroundStyle(Theme.gold)
        }
    }
}

struct ProgressBar: View {
    let value: Double
    var tint: Color = Theme.up
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.1))
                Capsule().fill(tint).frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 4)
        .animation(.easeOut(duration: 0.4), value: value)
    }
}
