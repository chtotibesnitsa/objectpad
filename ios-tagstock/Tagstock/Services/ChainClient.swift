import Foundation

/// Minimal JSON-RPC client for Robinhood Chain (id 4663). Values mirror
/// `web-handlesend/src/lib/pons.ts`; selectors/topics were computed from the same ABI.
nonisolated enum Chain {
    static let id = 4663
    static let name = "Robinhood Chain"
    static let rpc = URL(string: "https://rpc.mainnet.chain.robinhood.com")!
    static let explorer = "https://robinhoodchain.blockscout.com"
    static let ponsFactory = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"
    static let ponsRouter = "0xe33e9e479df8802cb0866d5d05258bec4cf62948"
    static let casepadToken = "0x03de80661ac0766ad1da66e024b9e4cc91af407a"
    static let burnAddress = "0x000000000000000000000000000000000000dead"
    static let totalSupply: Double = 1_000_000_000
    static let creatorTaxBps = 150
    static let curveFeeBps = 100

    static func txURL(_ hash: String) -> URL { URL(string: "\(explorer)/tx/\(hash)")! }
    static func addressURL(_ address: String) -> URL { URL(string: "\(explorer)/address/\(address)")! }
    static func tokenURL(_ address: String) -> URL { URL(string: "\(explorer)/token/\(address)")! }
    static func isAddress(_ s: String) -> Bool {
        s.count == 42 && s.hasPrefix("0x") && s.dropFirst(2).allSatisfy(\.isHexDigit)
    }

    enum Selector {
        static let token = "0xfc0c546a"
        static let quoteReserve = "0x9da771f4"
        static let tokenReserve = "0xcbcb3171"
        static let phantomQuote = "0xc57eadfc"
        static let graduationThreshold = "0x8b0bc501"
        static let graduated = "0xe7c2b772"
        static let creatorTaxBps = "0xc1bb8901"
        static let balanceOf = "0x70a08231"
        static let totalSupply = "0x18160ddd"
    }
    static let curveBuyTopic = "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455"
    static let curveSellTopic = "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df"
}

nonisolated struct RpcLog: Decodable {
    let address: String
    let data: String
    let topics: [String]
    let blockNumber: String
    let transactionHash: String
    let logIndex: String
}

nonisolated enum ChainError: LocalizedError {
    case rpc(String)
    var errorDescription: String? {
        if case .rpc(let m) = self { return "Robinhood Chain RPC: \(m)" }
        return nil
    }
}

nonisolated struct ChainClient: Sendable {
    static let shared = ChainClient()
    private let session = URLSession(configuration: .ephemeral)

    private struct RpcResponse<T: Decodable>: Decodable {
        struct Err: Decodable { let message: String }
        let result: T?
        let error: Err?
    }

    func call<T: Decodable>(_ method: String, _ params: [Any]) async throws -> T {
        var req = URLRequest(url: Chain.rpc)
        req.httpMethod = "POST"
        req.timeoutInterval = 12
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["jsonrpc": "2.0", "id": 1, "method": method, "params": params])
        let (data, _) = try await session.data(for: req)
        let decoded = try JSONDecoder().decode(RpcResponse<T>.self, from: data)
        if let error = decoded.error { throw ChainError.rpc(error.message) }
        guard let result = decoded.result else { throw ChainError.rpc("empty result") }
        return result
    }

    func blockNumber() async throws -> Int {
        let hex: String = try await call("eth_blockNumber", [])
        return Int(hex.dropFirst(2), radix: 16) ?? 0
    }

    func chainId() async throws -> Int {
        let hex: String = try await call("eth_chainId", [])
        return Int(hex.dropFirst(2), radix: 16) ?? 0
    }

    func ethCall(to: String, data: String) async throws -> String {
        try await call("eth_call", [["to": to, "data": data], "latest"])
    }

    /// Native ETH balance for a wallet, in ETH.
    func ethBalance(_ address: String) async throws -> Double {
        let hex: String = try await call("eth_getBalance", [address, "latest"])
        return Wei.hexToDouble(hex)
    }

    /// ERC-20 balance for a wallet, in whole tokens (18 decimals).
    func tokenBalance(token: String, owner: String) async throws -> Double {
        let padded = String(repeating: "0", count: 24) + owner.lowercased().dropFirst(2)
        let hex = try await ethCall(to: token, data: Chain.Selector.balanceOf + padded)
        return Wei.hexToDouble(hex)
    }

    /// Mirrors website `readCurveState`, including the phantom-reserve fix.
    func curveState(curve: String) async throws -> CurveState {
        async let q = ethCall(to: curve, data: Chain.Selector.quoteReserve)
        async let r = ethCall(to: curve, data: Chain.Selector.tokenReserve)
        async let p = ethCall(to: curve, data: Chain.Selector.phantomQuote)
        async let g = ethCall(to: curve, data: Chain.Selector.graduationThreshold)
        async let grad = ethCall(to: curve, data: Chain.Selector.graduated)
        async let tax = ethCall(to: curve, data: Chain.Selector.creatorTaxBps)
        let quote = Wei.hexToDouble(try await q)
        let reserve = Wei.hexToDouble(try await r)
        let phantom = Wei.hexToDouble(try await p)
        let threshold = Wei.hexToDouble(try await g)
        let graduated = Wei.hexToDouble(try await grad, decimals: 0) > 0
        let creatorTax = Int(Wei.hexToDouble(try await tax, decimals: 0))
        let virtualQuote = quote >= phantom ? quote : quote + phantom
        let realQuote = max(0, virtualQuote - phantom)
        let price = reserve > 0 ? virtualQuote / reserve : 0
        return CurveState(
            quoteReserve: quote, tokenReserve: reserve, phantomQuote: phantom, graduationThreshold: threshold,
            graduated: graduated, creatorTaxBps: creatorTax, priceEth: price, mcapEth: price * Chain.totalSupply,
            reserveEth: realQuote, sold: max(0, Chain.totalSupply - reserve),
            progress: graduated ? 1 : (threshold > 0 ? min(1, realQuote / threshold) : 0)
        )
    }

    /// Mirrors website `readCurveHistory`: CurveBuy/CurveSell logs since launch, timestamps per block.
    func curveHistory(curve: String, fromBlock: Int) async throws -> [CurveTrade] {
        let latest = try await blockNumber()
        let window = 50_000
        var start = fromBlock > 0 ? fromBlock : max(0, latest - window * 4)
        var logs: [RpcLog] = []
        var windows = 0
        while start <= latest && windows < 40 {
            let to = min(latest, start + window)
            let batch: [RpcLog] = try await call("eth_getLogs", [["address": curve, "fromBlock": "0x" + String(start, radix: 16), "toBlock": "0x" + String(to, radix: 16)]])
            logs.append(contentsOf: batch)
            start = to + 1
            windows += 1
        }
        var trades: [CurveTrade] = []
        for log in logs {
            guard let topic = log.topics.first?.lowercased(), topic == Chain.curveBuyTopic || topic == Chain.curveSellTopic else { continue }
            let words = Self.words(log.data)
            guard words.count >= 4 else { continue }
            let isBuy = topic == Chain.curveBuyTopic
            let a = Wei.hexToDouble(words[0]), b = Wei.hexToDouble(words[1]), fee = Wei.hexToDouble(words[3])
            trades.append(CurveTrade(
                txHash: log.transactionHash, logIndex: Int(log.logIndex.dropFirst(2), radix: 16) ?? 0,
                blockNumber: Int(log.blockNumber.dropFirst(2), radix: 16) ?? 0, isBuy: isBuy,
                sender: log.topics.count > 1 ? "0x" + String(log.topics[1].suffix(40)) : "",
                eth: isBuy ? a : b, tokens: isBuy ? b : a, creatorFeeEth: fee, timestamp: 0
            ))
        }
        let blocks = Array(Set(trades.map(\.blockNumber))).sorted().suffix(120)
        var stamps: [Int: Int64] = [:]
        struct Block: Decodable { let timestamp: String }
        await withTaskGroup(of: (Int, Int64?).self) { group in
            for bn in blocks {
                group.addTask {
                    let block: Block? = try? await self.call("eth_getBlockByNumber", ["0x" + String(bn, radix: 16), false])
                    guard let ts = block?.timestamp, let v = Int64(ts.dropFirst(2), radix: 16) else { return (bn, nil) }
                    return (bn, v * 1000)
                }
            }
            for await (bn, ts) in group { if let ts { stamps[bn] = ts } }
        }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        return trades.map { var t = $0; t.timestamp = stamps[t.blockNumber] ?? now; return t }.sorted { $0.timestamp < $1.timestamp }
    }

    private static func words(_ data: String) -> [String] {
        var hex = data.lowercased()
        if hex.hasPrefix("0x") { hex.removeFirst(2) }
        var out: [String] = []
        var idx = hex.startIndex
        while idx < hex.endIndex, let end = hex.index(idx, offsetBy: 64, limitedBy: hex.endIndex) {
            out.append("0x" + hex[idx..<end])
            idx = end
        }
        return out
    }
}
