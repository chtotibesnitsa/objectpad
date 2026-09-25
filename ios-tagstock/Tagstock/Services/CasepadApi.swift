import Foundation

/// Errors surfaced to the UI. Messages come from the backend `error` field when present.
nonisolated enum ApiError: LocalizedError {
    case http(Int, String)
    case decoding(String)
    case offline

    var errorDescription: String? {
        switch self {
        case .http(_, let message): return message
        case .decoding(let detail): return "The service returned an unexpected response (\(detail))."
        case .offline: return "No connection. Check your network and try again."
        }
    }
}

/// Read-only + authenticated client for the CasePad backend. Same base URL and
/// paths as the website (`BACKEND_URL` + `/api/crates`). No secrets live here.
nonisolated struct CasepadApi: Sendable {
    static let shared = CasepadApi()

    let baseURL = URL(string: "https://casepad-backend.rork.app/api/crates")!
    let siteURL = URL(string: "https://casepad.fun")!

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    private let decoder: JSONDecoder = JSONDecoder()

    private struct ErrorEnvelope: Decodable { let error: String? }

    func get<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        try await request(path, method: "GET", body: nil, token: token)
    }

    func post<T: Decodable>(_ path: String, body: [String: Any], token: String?) async throws -> T {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(path, method: "POST", body: data, token: token)
    }

    private func request<T: Decodable>(_ path: String, method: String, body: Data?, token: String?) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path))
        // Preserve query strings when present.
        if let q = path.firstIndex(of: "?") {
            let clean = String(path[..<q]).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            req.url = URL(string: baseURL.absoluteString + "/" + clean + String(path[q...]))
        }
        req.httpMethod = method
        req.httpBody = body
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("casepad-ios/1.0", forHTTPHeaderField: "X-Client")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw ApiError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if let env = try? decoder.decode(ErrorEnvelope.self, from: data), let message = env.error {
            throw ApiError.http(status, message)
        }
        guard (200..<300).contains(status) else { throw ApiError.http(status, "Request failed (\(status))") }
        do {
            return try decoder.decode(T.self, from: data)
        } catch let DecodingError.keyNotFound(key, ctx) {
            throw ApiError.decoding("missing \(key.stringValue) at \(ctx.codingPath.map(\.stringValue).joined(separator: "."))")
        } catch {
            throw ApiError.decoding(String(describing: error).prefix(120).description)
        }
    }

    // MARK: Public reads (identical to the website fetchers)

    func terminal() async throws -> Terminal { try await get("/terminal") }
    func status() async throws -> PlatformStatus { try await get("/status") }
    func platform() async throws -> PlatformConfig { try await get("/platform") }
    func ticker() async throws -> [TickerItem] {
        struct R: Decodable { let items: [TickerItem] }
        return try await (get("/ticker") as R).items
    }
    func openCases() async throws -> OpenCasesFeed { try await get("/cases") }
    func token(_ address: String) async throws -> TokenDetail { try await get("/tokens/\(address)") }
    func inventory(_ address: String) async throws -> Inventory { try await get("/tokens/\(address)/inventory") }
    func caseDesigns(_ address: String) async throws -> CaseDesigns { try await get("/tokens/\(address)/case-designs") }
    func liveRounds(_ address: String) async throws -> [Round] {
        struct R: Decodable { let rounds: [Round] }
        return try await (get("/tokens/\(address)/live-rounds") as R).rounds
    }
    func transactions() async throws -> TransactionsFeed { try await get("/transactions") }
    func activity() async throws -> [ActivityItem] {
        struct R: Decodable { let items: [ActivityItem] }
        return try await (get("/activity") as R).items
    }
    func quests() async throws -> [Quest] {
        struct R: Decodable { let quests: [Quest] }
        return try await (get("/quests") as R).quests
    }
    func battles() async throws -> [Battle] {
        struct R: Decodable { let battles: [Battle] }
        return try await (get("/battles") as R).battles
    }
    func pnlBoard() async throws -> (rows: [PnlRow], note: String) {
        struct R: Decodable { let leaderboard: [PnlRow]; let note: String }
        let r: R = try await get("/pnl")
        return (r.leaderboard, r.note)
    }
    func leaderboard() async throws -> (rows: [LeaderboardRow], scoring: String) {
        struct R: Decodable { let leaderboard: [LeaderboardRow]; let scoring: String }
        let r: R = try await get("/leaderboard")
        return (r.leaderboard, r.scoring)
    }
    func rankings() async throws -> Rankings { try await get("/rankings") }
    func burns() async throws -> BurnFeed { try await get("/burns") }
    func ethPrice() async throws -> Double {
        struct R: Decodable { let price: Double }
        return try await (get("/eth-price") as R).price
    }
    func messages(channel: String) async throws -> MessagesPage {
        try await get("/messages?channel=\(channel.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? channel)")
    }
    func searchTokens(_ q: String) async throws -> [TokenBrief] {
        struct R: Decodable { let tokens: [Coin] }
        let r: R = try await get("/tokens?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)")
        return r.tokens.map(\.brief)
    }
}
