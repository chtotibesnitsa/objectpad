import Foundation

/// Number, money, address and time formatting shared by every screen.
enum Fmt {
    static func usd(_ v: Double?, digits: Int = 2) -> String {
        guard let v, v.isFinite else { return "—" }
        if abs(v) >= 1_000_000 { return "$" + String(format: "%.2fM", v / 1_000_000) }
        if abs(v) >= 10_000 { return "$" + String(format: "%.1fK", v / 1_000) }
        if abs(v) > 0 && abs(v) < 0.01 { return "$" + String(format: "%.6f", v) }
        return v.formatted(.currency(code: "USD").precision(.fractionLength(abs(v) >= 1000 ? 0 : digits)))
    }
    static func money(_ v: Double) -> String { "$" + Int(v.rounded()).formatted(.number.grouping(.automatic)) }
    static func eth(_ v: Double?, digits: Int = 4) -> String {
        guard let v, v.isFinite else { return "—" }
        if v == 0 { return "0 ETH" }
        if v < pow(10, -Double(digits)) { return "<\(pow(10, -Double(digits))) ETH" }
        return "\(v.formatted(.number.precision(.fractionLength(0...digits)))) ETH"
    }
    /// ETH value shown in USD when the live rate is known, else ETH.
    static func value(_ ethValue: Double, _ ethUsd: Double?) -> String { ethUsd.map { usd(ethValue * $0) } ?? eth(ethValue) }
    static func price(_ ethValue: Double, _ ethUsd: Double?) -> String {
        guard ethValue > 0 else { return "—" }
        if let r = ethUsd { let u = ethValue * r; return u >= 0.01 ? usd(u, digits: 4) : "$" + String(format: "%.2e", u) }
        return String(format: "%.3g ETH", ethValue)
    }
    static func compact(_ v: Double) -> String { v.formatted(.number.notation(.compactName).precision(.fractionLength(0...2))) }
    static func pct(_ v: Double) -> String { (v >= 0 ? "+" : "") + String(format: "%.1f%%", v) }
    static func short(_ s: String?, lead: Int = 6, tail: Int = 4) -> String {
        guard let s, s.count > lead + tail + 1 else { return s ?? "" }
        return "\(s.prefix(lead))…\(s.suffix(tail))"
    }
    static func ago(_ ms: Double) -> String {
        guard ms > 0 else { return "" }
        let s = max(0, Date().timeIntervalSince1970 - ms / 1000)
        if s < 60 { return "just now" }
        if s < 3600 { return "\(Int(s / 60))m ago" }
        if s < 86_400 { return "\(Int(s / 3600))h ago" }
        return "\(Int(s / 86_400))d ago"
    }
}

/// Deadline countdown with an urgency tier (urgent < 24h, soon < 3d).
enum Countdown {
    enum Tier { case none, calm, soon, urgent, ended }
    static func of(_ deadline: Double?, now: Date) -> (label: String, tier: Tier) {
        guard let deadline, deadline > 0 else { return ("Until won", .none) }
        let ms = deadline - now.timeIntervalSince1970 * 1000
        if ms <= 0 { return ("Ended", .ended) }
        let d = Int(ms / 86_400_000), h = Int(ms.truncatingRemainder(dividingBy: 86_400_000) / 3_600_000)
        let m = Int(ms.truncatingRemainder(dividingBy: 3_600_000) / 60_000), s = Int(ms.truncatingRemainder(dividingBy: 60_000) / 1000)
        let label = d >= 1 ? String(format: "%dd %02dh %02dm", d, h, m) : String(format: "%02d:%02d:%02d", h, m, s)
        return (label, ms < 86_400_000 ? .urgent : ms < 3 * 86_400_000 ? .soon : .calm)
    }
}

enum RewardSort: String, CaseIterable, Identifiable {
    case best = "Best right now", ending = "Ending soon", biggest = "Biggest", newest = "Newest"
    var id: String { rawValue }
}

extension Reward {
    /// Same opportunity score as the website: money, urgency, freshness and recent hunter activity.
    func opportunity(now: Double) -> Double {
        guard status == "open" else { return -1 }
        let day = 86_400_000.0
        let left = deadline.map { $0 - now }
        if let left, left <= 0 { return -1 }
        let money = log10(max(5, rewardUsd)) * 40
        let urgency: Double = left == nil ? 6 : left! < day ? 34 : left! < 3 * day ? 22 : left! < 7 * day ? 12 : 4
        let fresh = max(0, 14 - (now - createdAt) / day) * 1.4
        let recent = Double(min(8, submissions.filter { now - $0.createdAt < 3 * day }.count)) * 2.5
        return money + urgency + fresh + recent
    }

    var categoryLabel: String { ["find": "Find it", "scan": "Scan it", "promo": "Promote", "meme": "Meme IRL", "art": "Art"][category] ?? "Other" }
}

extension Array where Element == Reward {
    func ranked(by sort: RewardSort) -> [Reward] {
        let now = Date().timeIntervalSince1970 * 1000
        func dl(_ r: Reward) -> Double { (r.deadline ?? 0) > now ? r.deadline! : .greatestFiniteMagnitude }
        return self.sorted { a, b in
            if (a.status == "open") != (b.status == "open") { return a.status == "open" }
            let primary: (Double, Double)
            switch sort {
            case .best: primary = (b.opportunity(now: now), a.opportunity(now: now))
            case .ending: primary = (dl(a), dl(b))
            case .biggest: primary = (b.rewardUsd, a.rewardUsd)
            case .newest: primary = (b.createdAt, a.createdAt)
            }
            if primary.0 != primary.1 { return primary.0 < primary.1 }
            return a.rewardUsd > b.rewardUsd
        }
    }
}
