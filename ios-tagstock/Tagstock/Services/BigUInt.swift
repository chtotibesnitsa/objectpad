import Foundation

/// Minimal unsigned big integer for exact wei / token-unit math (uint256 range). Little-endian 32-bit limbs.
nonisolated struct BigUInt: Comparable, Hashable, Sendable, CustomStringConvertible {
    private(set) var limbs: [UInt32]

    static let zero = BigUInt()
    static let weiPerEth = BigUInt(decimal: "1000000000000000000")!

    init() { limbs = [] }
    init(_ value: UInt64) {
        limbs = [UInt32(truncatingIfNeeded: value), UInt32(truncatingIfNeeded: value >> 32)]
        normalize()
    }
    init(_ value: Int) { self.init(UInt64(max(0, value))) }

    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("0x") || s.hasPrefix("0X") { s.removeFirst(2) }
        self.init()
        for ch in s {
            guard let digit = ch.hexDigitValue else { return nil }
            self = mulSmall(16).addSmall(UInt32(digit))
        }
    }

    init?(decimal: String) {
        let s = decimal.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return nil }
        self.init()
        for ch in s {
            guard let digit = ch.wholeNumberValue, ch.isASCII else { return nil }
            self = mulSmall(10).addSmall(UInt32(digit))
        }
    }

    init(bytes: [UInt8]) {
        self.init()
        for b in bytes { self = mulSmall(256).addSmall(UInt32(b)) }
    }

    /// Exact decimal amount ("0.015") to base units. Nil for invalid, too-precise or zero input.
    static func parse(_ amount: String, decimals: Int = 18) -> BigUInt? {
        let cleaned = amount.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty, cleaned != ".", cleaned.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == ".") }), cleaned.filter({ $0 == "." }).count <= 1 else { return nil }
        let parts = cleaned.split(separator: ".", omittingEmptySubsequences: false)
        let whole = parts.first.map(String.init) ?? ""
        let frac = parts.count > 1 ? String(parts[1]) : ""
        guard frac.count <= decimals else { return nil }
        let joined = (whole.isEmpty ? "0" : whole) + frac + String(repeating: "0", count: decimals - frac.count)
        guard let value = BigUInt(decimal: joined), !value.isZero else { return nil }
        return value
    }

    private mutating func normalize() { while let last = limbs.last, last == 0 { limbs.removeLast() } }

    var isZero: Bool { limbs.isEmpty }

    func mulSmall(_ m: UInt32) -> BigUInt {
        var out = BigUInt(); var carry: UInt64 = 0
        out.limbs = limbs.map { limb in
            let p = UInt64(limb) * UInt64(m) + carry
            carry = p >> 32
            return UInt32(truncatingIfNeeded: p)
        }
        if carry > 0 { out.limbs.append(UInt32(carry)) }
        out.normalize(); return out
    }

    func addSmall(_ a: UInt32) -> BigUInt { self + BigUInt(UInt64(a)) }

    func divSmall(_ d: UInt32) -> (quotient: BigUInt, remainder: UInt32) {
        precondition(d != 0)
        var out = BigUInt(); out.limbs = Array(repeating: 0, count: limbs.count)
        var rem: UInt64 = 0
        for i in stride(from: limbs.count - 1, through: 0, by: -1) {
            let cur = (rem << 32) | UInt64(limbs[i])
            out.limbs[i] = UInt32(cur / UInt64(d))
            rem = cur % UInt64(d)
        }
        out.normalize(); return (out, UInt32(rem))
    }

    /// value * numerator / denominator with small factors (slippage, fee splits).
    func scaled(_ numerator: UInt32, _ denominator: UInt32) -> BigUInt { mulSmall(numerator).divSmall(denominator).quotient }

    static func + (a: BigUInt, b: BigUInt) -> BigUInt {
        var out = BigUInt(); var carry: UInt64 = 0
        for i in 0..<max(a.limbs.count, b.limbs.count) {
            let s = UInt64(i < a.limbs.count ? a.limbs[i] : 0) + UInt64(i < b.limbs.count ? b.limbs[i] : 0) + carry
            out.limbs.append(UInt32(truncatingIfNeeded: s)); carry = s >> 32
        }
        if carry > 0 { out.limbs.append(UInt32(carry)) }
        out.normalize(); return out
    }

    /// Saturating subtraction (never negative).
    static func - (a: BigUInt, b: BigUInt) -> BigUInt {
        guard a > b else { return .zero }
        var out = BigUInt(); var borrow: Int64 = 0
        for i in 0..<a.limbs.count {
            var d = Int64(a.limbs[i]) - Int64(i < b.limbs.count ? b.limbs[i] : 0) - borrow
            if d < 0 { d += 1 << 32; borrow = 1 } else { borrow = 0 }
            out.limbs.append(UInt32(d))
        }
        out.normalize(); return out
    }

    static func * (a: BigUInt, b: BigUInt) -> BigUInt {
        guard !a.isZero, !b.isZero else { return .zero }
        var acc = [UInt64](repeating: 0, count: a.limbs.count + b.limbs.count + 1)
        for i in 0..<a.limbs.count {
            var carry: UInt64 = 0
            for j in 0..<b.limbs.count {
                let t = UInt64(a.limbs[i]) * UInt64(b.limbs[j]) + (acc[i + j] & 0xFFFF_FFFF) + carry
                acc[i + j] = t & 0xFFFF_FFFF; carry = t >> 32
            }
            var k = i + b.limbs.count
            while carry > 0 { let t = acc[k] + carry; acc[k] = t & 0xFFFF_FFFF; carry = t >> 32; k += 1 }
        }
        var out = BigUInt(); out.limbs = acc.map { UInt32(truncatingIfNeeded: $0) }; out.normalize(); return out
    }

    static func < (a: BigUInt, b: BigUInt) -> Bool {
        if a.limbs.count != b.limbs.count { return a.limbs.count < b.limbs.count }
        for i in stride(from: a.limbs.count - 1, through: 0, by: -1) where a.limbs[i] != b.limbs[i] { return a.limbs[i] < b.limbs[i] }
        return false
    }

    var hex: String {
        guard let top = limbs.last else { return "0x0" }
        var s = String(top, radix: 16)
        for limb in limbs.dropLast().reversed() { let h = String(limb, radix: 16); s += String(repeating: "0", count: 8 - h.count) + h }
        return "0x" + s
    }

    var decimalString: String {
        if isZero { return "0" }
        var parts: [String] = []; var cur = self
        while !cur.isZero { let (q, r) = cur.divSmall(1_000_000_000); parts.append(String(r)); cur = q }
        return parts.last! + parts.dropLast().reversed().map { String(repeating: "0", count: 9 - $0.count) + $0 }.joined()
    }

    var description: String { decimalString }

    /// Minimal big-endian bytes (empty for zero), as RLP expects.
    var bytes: [UInt8] {
        var h = String(hex.dropFirst(2)); if h == "0" { return [] }
        if h.count % 2 == 1 { h = "0" + h }
        return Hex.bytes(h)
    }

    func toDouble(decimals: Int = 18) -> Double { (Double(decimalString) ?? 0) / pow(10, Double(decimals)) }

    func formatUnits(decimals: Int = 18, digits: Int = 6) -> String {
        let s = decimalString
        let padded = String(repeating: "0", count: max(0, decimals + 1 - s.count)) + s
        let whole = padded.dropLast(decimals)
        var frac = String(padded.suffix(decimals).prefix(digits))
        while frac.hasSuffix("0") { frac.removeLast() }
        return frac.isEmpty ? String(whole) : "\(whole).\(frac)"
    }
}
