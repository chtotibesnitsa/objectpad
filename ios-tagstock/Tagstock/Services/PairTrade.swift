import Foundation

/// ETH → pair asset (Uniswap V3 on Robinhood Chain) → coin (Pons V2 curve) for stock-paired coins. Every leg is quoted on-chain.
nonisolated enum PairTrade {
    static let exactInput = Keccak.selector("exactInput((bytes,address,uint256,uint256))")
    static let quoteExactInput = Keccak.selector("quoteExactInput(bytes,uint256)")
    static let feeBps = Keccak.selector("feeBps()")
    static let creatorTaxBps = Keccak.selector("creatorTaxBps()")
    static let fallbackRouter = "0xcaf681a66d020601342297493863e78c959e5cb2"
    static let fallbackQuoter = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7"

    /// Uniswap V3 path bytes: token(20) | fee(3) | token(20) | …
    static func path(_ r: PairRoute) -> String {
        var s = ""
        for (i, t) in r.tokens.enumerated() {
            s += String(t.lowercased().dropFirst(2))
            if i < r.fees.count { s += String(format: "%06x", r.fees[i]) }
        }
        return s
    }
    private static func bytesTail(_ hex: String) -> String {
        let pad = (64 - hex.count % 64) % 64
        return Abi.word(BigUInt(hex.count / 2)) + hex + String(repeating: "0", count: pad)
    }
    static func quoteData(_ r: PairRoute, _ amountIn: BigUInt) -> String { quoteExactInput + Abi.word(BigUInt(64)) + Abi.word(amountIn) + bytesTail(path(r)) }
    static func swapData(_ r: PairRoute, recipient: String, amountIn: BigUInt, minOut: BigUInt) -> String {
        exactInput + Abi.word(BigUInt(32)) + Abi.word(BigUInt(128)) + Abi.addr(recipient) + Abi.word(amountIn) + Abi.word(minOut) + bytesTail(path(r))
    }

    /// Exact pair-asset output for `ethIn`, simulated through QuoterV2.
    static func quoteSwap(_ r: PairRoute, ethIn: BigUInt, quoter: String?) async throws -> BigUInt {
        let out = try await ChainClient.shared.ethCall(to: quoter ?? fallbackQuoter, data: quoteData(r, ethIn))
        guard out.count >= 66, let v = BigUInt(hex: String(out.prefix(66))), !v.isZero else { throw ChainError.message("No on-chain swap route right now.") }
        return v
    }

    /// Coin tokens (raw units) a curve returns for `quoteIn` of its quote asset: Pons V2 constant-product math after fee and creator tax.
    static func curveBuy(curve: String, quoteIn: BigUInt) async throws -> BigUInt {
        let c = ChainClient.shared
        async let f = c.ethCall(to: curve, data: feeBps)
        async let t = c.ethCall(to: curve, data: creatorTaxBps)
        async let q = c.ethCall(to: curve, data: Abi.quoteReserve)
        async let r = c.ethCall(to: curve, data: Abi.tokenReserve)
        async let p = c.ethCall(to: curve, data: Abi.phantomQuote)
        let raw = { (s: String) -> Double in (BigUInt(hex: s) ?? .zero).toDouble(decimals: 0) }
        let fee = raw(try await f), tax = raw(try await t), qr = raw(try await q), tr = raw(try await r), ph = raw(try await p)
        let virtual = qr >= ph ? qr : qr + ph
        let input = quoteIn.toDouble(decimals: 0)
        let net = input * (1 - (fee + tax) / 10_000)
        guard net > 0, virtual + net > 0 else { return .zero }
        return big(net * tr / (virtual + net))
    }

    static func big(_ x: Double) -> BigUInt { BigUInt(decimal: String(format: "%.0f", max(0, x.rounded(.down)))) ?? .zero }
}
