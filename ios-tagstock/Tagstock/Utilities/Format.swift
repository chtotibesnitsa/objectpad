import Foundation

/// Number formatting shared by every screen. Mirrors `web-handlesend/src/lib/format.ts`
/// and `fmtEth` / `fmtUnits` so values match the website character for character.
nonisolated enum Format {
    private static let usdFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 2
        return f
    }()

    static func usd(_ value: Double, compact: Bool = false) -> String {
        guard value.isFinite else { return "$0" }
        let abs = Swift.abs(value)
        if compact, abs >= 1_000 { return "$" + compactNumber(value, digits: abs >= 1_000_000 ? 2 : 1) }
        if abs == 0 { return "$0.00" }
        if abs < 0.000001 { return String(format: "$%.2e", value) }
        if abs < 0.01 { return String(format: "$%.6f", value) }
        if abs < 1 { return String(format: "$%.4f", value) }
        return usdFormatter.string(from: NSNumber(value: value)) ?? "$\(value)"
    }

    static func compactNumber(_ value: Double, digits: Int = 2) -> String {
        let abs = Swift.abs(value)
        let sign = value < 0 ? "-" : ""
        if abs >= 1_000_000_000 { return sign + trim(String(format: "%.\(digits)f", abs / 1_000_000_000)) + "B" }
        if abs >= 1_000_000 { return sign + trim(String(format: "%.\(digits)f", abs / 1_000_000)) + "M" }
        if abs >= 1_000 { return sign + trim(String(format: "%.\(digits)f", abs / 1_000)) + "K" }
        return sign + trim(String(format: "%.2f", abs))
    }

    /// Wei string -> ETH with `digits` decimals, trailing zeros trimmed (website `fmtEth`).
    static func eth(_ wei: String?, digits: Int = 4) -> String {
        guard let wei, let value = Wei.toDouble(wei) else { return "0 ETH" }
        return trim(String(format: "%.\(digits)f", value)) + " ETH"
    }

    /// 18-decimal token units -> display (website `fmtUnits`).
    static func units(_ units: String?, digits: Int = 4) -> String {
        guard let units, let value = Wei.toDouble(units) else { return "0" }
        if value >= 1_000_000 { return String(format: "%.2fM", value / 1_000_000) }
        if value >= 10_000 { return integerFormatter.string(from: NSNumber(value: floor(value))) ?? "\(Int(value))" }
        return trim(String(format: "%.\(digits)f", value))
    }

    static func tokens(_ amount: Double) -> String {
        guard amount.isFinite else { return "0" }
        if Swift.abs(amount) >= 1_000_000 { return compactNumber(amount) }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = amount >= 1000 ? 0 : 2
        return f.string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    static func pct(_ value: Double, digits: Int = 2) -> String {
        guard value.isFinite else { return "0%" }
        return (value > 0 ? "+" : "") + String(format: "%.\(digits)f", value) + "%"
    }

    /// Basis points -> "+9.84%".
    static func bps(_ bps: Int?) -> String {
        guard let bps else { return "—" }
        return pct(Double(bps) / 100)
    }

    static func timeAgo(_ ms: Int64) -> String {
        timeAgo(Date(timeIntervalSince1970: Double(ms) / 1000))
    }

    static func timeAgo(_ date: Date) -> String {
        let s = max(0, Int(Date().timeIntervalSince(date)))
        if s < 45 { return "just now" }
        let m = s / 60
        if m < 60 { return "\(m)m ago" }
        let h = m / 60
        if h < 24 { return "\(h)h ago" }
        let d = h / 24
        if d < 30 { return "\(d)d ago" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }

    static func shortAddress(_ address: String) -> String {
        guard address.count >= 12 else { return address }
        return "\(address.prefix(6))...\(address.suffix(4))"
    }

    private static let integerFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 0
        return f
    }()

    private static func trim(_ fixed: String) -> String {
        guard fixed.contains(".") else { return fixed }
        var s = fixed
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }
}

/// Decimal-string wei helpers. Amounts stay as strings end to end; conversion is display-only.
nonisolated enum Wei {
    static func toDouble(_ decimalString: String, decimals: Int = 18) -> Double? {
        let s = decimalString.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty, s.allSatisfy(\.isNumber) else { return nil }
        if s.count <= decimals {
            let padded = String(repeating: "0", count: decimals - s.count) + s
            return Double("0." + padded)
        }
        let split = s.index(s.endIndex, offsetBy: -decimals)
        return Double(String(s[..<split]) + "." + String(s[split...]))
    }

    /// Hex quantity ("0x1a2b") -> Double ETH. Precision is fine for display.
    static func hexToDouble(_ hex: String, decimals: Int = 18) -> Double {
        var h = hex.lowercased()
        if h.hasPrefix("0x") { h.removeFirst(2) }
        guard !h.isEmpty else { return 0 }
        var value: Double = 0
        for ch in h {
            guard let d = ch.hexDigitValue else { return 0 }
            value = value * 16 + Double(d)
        }
        return value / pow(10, Double(decimals))
    }

    static func isPositive(_ decimalString: String?) -> Bool {
        guard let s = decimalString else { return false }
        return s.contains { $0 != "0" } && s.allSatisfy(\.isNumber)
    }
}
