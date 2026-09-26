import Foundation

/// Robinhood Chain + ObjectPad protocol constants (mirrors `web-handlesend/src/shared/pons.ts` and `economy.ts`).
nonisolated enum Chain {
    static let id: UInt64 = 4663
    static let name = "Robinhood Chain"
    static let rpc = URL(string: "https://rpc.mainnet.chain.robinhood.com")!
    static let explorer = "https://robinhoodchain.blockscout.com"
    static let feeEscrow = "0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e"
    static let objectpadToken = "0x520541d03dec790ce51746da2a495dafa62e87f8"
    static let quoteAccount = "0x1111111111111111111111111111111111111111"
    /// The creator keeps 3,334 / 10,000 of the 1.5% creator tax; the rest goes to buyback-burn and holders.
    static let creatorShareBps: UInt32 = 3_334

    static func txURL(_ hash: String) -> URL { URL(string: "\(explorer)/tx/\(hash)")! }
    static func addressURL(_ address: String) -> URL { URL(string: "\(explorer)/address/\(address)")! }
    static func tokenURL(_ address: String) -> URL { URL(string: "\(explorer)/token/\(address)")! }
    static func isAddress(_ s: String) -> Bool { let t = s.trimmingCharacters(in: .whitespaces); return t.count == 42 && t.hasPrefix("0x") && t.dropFirst(2).allSatisfy(\.isHexDigit) }
    static func isHash(_ s: String) -> Bool { s.count == 66 && s.hasPrefix("0x") && s.dropFirst(2).allSatisfy(\.isHexDigit) }
}

nonisolated enum Abi {
    static let buy = Keccak.selector("buy(uint256,uint256,address)")
    static let sell = Keccak.selector("sell(uint256,uint256,address)")
    static let approve = Keccak.selector("approve(address,uint256)")
    static let allowance = Keccak.selector("allowance(address,address)")
    static let balanceOf = Keccak.selector("balanceOf(address)")
    static let claim = Keccak.selector("claim()")
    static let quoteReserve = Keccak.selector("quoteReserve()")
    static let tokenReserve = Keccak.selector("tokenReserve()")
    static let phantomQuote = Keccak.selector("phantomQuote()")
    static let graduationThreshold = Keccak.selector("graduationThreshold()")
    static let graduated = Keccak.selector("graduated()")

    static func word(_ v: BigUInt) -> String { Hex.pad(v.hex) }
    static func addr(_ a: String) -> String { Hex.pad(a) }
    static func buyData(_ quoteIn: BigUInt, _ minOut: BigUInt, _ to: String) -> String { buy + word(quoteIn) + word(minOut) + addr(to) }
    static func sellData(_ tokensIn: BigUInt, _ minOut: BigUInt, _ to: String) -> String { sell + word(tokensIn) + word(minOut) + addr(to) }
    static func approveData(_ spender: String, _ amount: BigUInt) -> String { approve + addr(spender) + word(amount) }
}

nonisolated struct CurveState: Sendable { let priceEth: Double; let marketCapEth: Double; let realReserveEth: Double; let progress: Double; let graduated: Bool }

nonisolated enum ChainError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
}

/// JSON-RPC client for Robinhood Chain. Every balance and quote shown in the app is read here or from the ObjectPad API.
nonisolated struct ChainClient: Sendable {
    static let shared = ChainClient()
    private let session: URLSession = { let c = URLSessionConfiguration.ephemeral; c.timeoutIntervalForRequest = 15; return URLSession(configuration: c) }()

    private func friendly(_ raw: String) -> String {
        let l = raw.lowercased()
        if l.contains("insufficient funds") { return "Not enough ETH on Robinhood Chain for this amount plus gas." }
        if l.contains("execution reverted") { return "The contract rejected this (price moved or amount too large). Nothing was sent." }
        if l.contains("nonce") { return "Your wallet had a pending transaction. Wait a moment and retry." }
        return "Robinhood Chain: \(raw.prefix(140))"
    }

    func call(_ method: String, _ params: [Any]) async throws -> Any {
        var req = URLRequest(url: Chain.rpc); req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": 1, "method": method, "params": params])
        let data: Data
        do { (data, _) = try await session.data(for: req) } catch { throw ChainError.message("Robinhood Chain could not be reached. Check your connection.") }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ChainError.message("Robinhood Chain sent an unreadable reply.") }
        if let err = obj["error"] as? [String: Any] { throw ChainError.message(friendly(err["message"] as? String ?? "RPC error")) }
        return obj["result"] ?? NSNull()
    }

    private func big(_ any: Any) -> BigUInt { BigUInt(hex: any as? String ?? "0x0") ?? .zero }

    func ethCall(to: String, data: String, from: String? = nil, value: BigUInt? = nil, overrides: [String: Any]? = nil) async throws -> String {
        var tx: [String: Any] = ["to": to, "data": data]
        if let from { tx["from"] = from }
        if let value { tx["value"] = value.hex }
        var params: [Any] = [tx, "latest"]
        if let overrides { params.append(overrides) }
        return try await call("eth_call", params) as? String ?? "0x"
    }

    func balance(_ address: String) async throws -> BigUInt { big(try await call("eth_getBalance", [address, "latest"])) }
    func tokenBalance(_ token: String, owner: String) async throws -> BigUInt { BigUInt(hex: try await ethCall(to: token, data: Abi.balanceOf + Abi.addr(owner))) ?? .zero }
    func allowance(_ token: String, owner: String, spender: String) async throws -> BigUInt { BigUInt(hex: try await ethCall(to: token, data: Abi.allowance + Abi.addr(owner) + Abi.addr(spender))) ?? .zero }
    /// Creator fees waiting for `owner` in the Pons fee escrow.
    func escrowBalance(_ owner: String) async throws -> BigUInt { try await tokenBalance(Chain.feeEscrow, owner: owner) }
    func gasPrice() async throws -> BigUInt { big(try await call("eth_gasPrice", [])) }
    func nonce(_ address: String) async throws -> BigUInt { big(try await call("eth_getTransactionCount", [address, "pending"])) }
    func sendRaw(_ raw: String) async throws -> String { try await call("eth_sendRawTransaction", [raw]) as? String ?? "" }

    func estimateGas(from: String, _ tx: TxRequest) async throws -> BigUInt {
        big(try await call("eth_estimateGas", [["from": from, "to": tx.to, "data": tx.data, "value": tx.value.hex]]))
    }

    /// Fills gas (+25%), gas price (+10%) and nonce. A failing estimate means it would revert, so nothing is sent.
    func prepare(from: String, _ tx: TxRequest) async throws -> TxRequest {
        async let gas = estimateGas(from: from, tx)
        async let price = gasPrice()
        async let n = nonce(from)
        let g = try await gas, gp = try await price, nn = try await n
        var out = tx
        out.gas = g.scaled(125, 100)
        out.gasPrice = gp.scaled(110, 100)
        out.nonce = nn
        return out
    }

    /// Waits for a receipt; throws if the transaction reverted.
    func waitForReceipt(_ hash: String, timeout: TimeInterval = 90) async throws {
        let until = Date().addingTimeInterval(timeout)
        while Date() < until {
            if let r = try? await call("eth_getTransactionReceipt", [hash]) as? [String: Any] {
                if (r["status"] as? String) == "0x1" { return }
                throw ChainError.message("The transaction reverted on-chain. No state changed.")
            }
            try await Task.sleep(for: .milliseconds(1500))
        }
        throw ChainError.message("Still waiting for confirmation. Check the receipt on Blockscout.")
    }

    /// Live bonding-curve state with the website's phantom-reserve rule.
    func curve(_ curve: String) async throws -> CurveState {
        async let q = ethCall(to: curve, data: Abi.quoteReserve)
        async let r = ethCall(to: curve, data: Abi.tokenReserve)
        async let p = ethCall(to: curve, data: Abi.phantomQuote)
        async let g = ethCall(to: curve, data: Abi.graduationThreshold)
        async let gr = ethCall(to: curve, data: Abi.graduated)
        let qv = try await q, rv = try await r, pv = try await p, gv = try await g, grv = try await gr
        let quote = BigUInt(hex: qv) ?? .zero, reserve = BigUInt(hex: rv) ?? .zero, phantom = BigUInt(hex: pv) ?? .zero
        let threshold = BigUInt(hex: gv) ?? .zero, graduated = !(BigUInt(hex: grv) ?? .zero).isZero
        let virtual = quote >= phantom ? quote : quote + phantom
        let real = virtual - phantom
        let price = reserve.isZero ? 0 : virtual.toDouble() / reserve.toDouble()
        let progress = graduated ? 1 : threshold.isZero ? 0 : min(1, real.toDouble() / threshold.toDouble())
        return CurveState(priceEth: price, marketCapEth: price * 1_000_000_000, realReserveEth: real.toDouble(), progress: progress, graduated: graduated)
    }

    /// Exact buy output simulated with a funded throwaway account (the website's `quoteBuy`).
    func quoteBuy(curve: String, quoteIn: BigUInt) async throws -> BigUInt {
        let funded = (quoteIn + quoteIn + BigUInt.weiPerEth).hex
        let out = try await ethCall(to: curve, data: Abi.buyData(quoteIn, .zero, Chain.quoteAccount), from: Chain.quoteAccount, value: quoteIn, overrides: [Chain.quoteAccount: ["balance": funded]])
        guard out.count >= 66 else { throw ChainError.message("The curve returned no quote.") }
        return BigUInt(hex: String(out.prefix(66))) ?? .zero
    }

    func quoteSell(curve: String, seller: String, tokensIn: BigUInt) async throws -> BigUInt {
        let out = try await ethCall(to: curve, data: Abi.sellData(tokensIn, .zero, seller), from: seller)
        guard out.count >= 66 else { throw ChainError.message("The curve returned no quote.") }
        return BigUInt(hex: String(out.prefix(66))) ?? .zero
    }
}
