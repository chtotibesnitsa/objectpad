import Foundation

/// Error carrying the server's stable code and HTTP status, with a plain-language message.
nonisolated struct ApiError: LocalizedError, Sendable {
    let code: String
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

/// Client for the ObjectPad backend: same base URL, paths, identity headers and error codes as objectpad.fun.
nonisolated enum ObjectPadApi {
    static let origin = "https://objectpad-backend.rork.app"
    static let base = "\(origin)/api"
    static let site = "https://www.objectpad.fun"

    private static let session: URLSession = { let c = URLSessionConfiguration.default; c.timeoutIntervalForRequest = 30; c.timeoutIntervalForResource = 180; return URLSession(configuration: c) }()
    static let decoder = JSONDecoder()

    /// Raw request. Mutations send ObjectPad's origin (the backend requires it for every write).
    static func raw(_ path: String, method: String = "GET", token: String? = nil, json: [String: Any]? = nil, bytes: Data? = nil, contentType: String = "image/jpeg", headers: [String: String] = [:], timeout: TimeInterval = 30) async throws -> Data {
        let url = URL(string: path.hasPrefix("http") ? path : base + path)!
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = method
        req.setValue("objectpad-ios/1.0", forHTTPHeaderField: "X-Client")
        if method != "GET" { req.setValue(site, forHTTPHeaderField: "Origin") }
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if let bytes { req.setValue(contentType, forHTTPHeaderField: "Content-Type"); req.httpBody = bytes }
        else if let json { req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.httpBody = try JSONSerialization.data(withJSONObject: json) }
        else if method != "GET" && method != "DELETE" { req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.httpBody = Data("{}".utf8) }
        let data: Data; let response: URLResponse
        do { (data, response) = try await session.data(for: req) } catch { throw ApiError(code: "NETWORK", status: 0, message: "ObjectPad could not be reached. Check your connection and retry.") }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let env = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let code = env?["error"] as? String ?? "SERVICE_UNAVAILABLE"
            let msg = (env?["message"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? describe(code)
            throw ApiError(code: code, status: status, message: msg)
        }
        return data
    }

    static func decode<T: Decodable>(_ data: Data) throws -> T {
        do { return try decoder.decode(T.self, from: data) } catch { throw ApiError(code: "PARSE", status: 200, message: "ObjectPad sent an unexpected response. Retry in a moment.") }
    }

    static func get<T: Decodable>(_ path: String, token: String? = nil, headers: [String: String] = [:], timeout: TimeInterval = 30) async throws -> T {
        try decode(try await raw(path, token: token, headers: headers, timeout: timeout))
    }

    static func send<T: Decodable>(_ path: String, method: String = "POST", json: [String: Any]? = nil, token: String? = nil, headers: [String: String] = [:], timeout: TimeInterval = 30) async throws -> T {
        try decode(try await raw(path, method: method, token: token, json: json, headers: headers, timeout: timeout))
    }

    // Public reads
    static func coins() async throws -> CoinsFeed { try await get("/coins", timeout: 45) }
    static func market() async throws -> MarketSnapshot { try await get("/market") }
    static func status() async throws -> Readiness { try await get("/status") }
    static func burns() async throws -> BurnFeed { try await get("/burns") }
    static func building() async throws -> BuildingFeed { try await get("/building") }
    static func trades(_ curve: String) async throws -> CurveTrades { try await get("/curves/\(curve)/trades", timeout: 40) }
    static func holders(_ curve: String) async throws -> HoldersFeed { try await get("/curves/\(curve)/holders", timeout: 40) }
    static func record(_ id: String) async throws -> ObjectRecord { try await get("/objects/\(id)") }
    static func earnMarket() async throws -> EarnMarket { try await get("/earn/market") }
    static func leaderboard() async throws -> Leaderboard { try await get("/earn/leaderboard") }

    private static let messages: [String: String] = [
        "UNAUTHORIZED": "Your session expired. Sign in again.", "RATE_LIMITED": "Too many requests. Wait a moment and retry.",
        "HANDOFF_EXPIRED_OR_USED": "This QR code expired or was already used.", "CAPTURE_DEVICE_NOT_AUTHORIZED": "This phone no longer holds the capture session.",
        "UPLOAD_TICKET_INVALID": "The upload ticket expired. Retry the upload.", "IMAGE_RESOLUTION": "The photo resolution is too low. Use good light.",
        "IMAGE_QUALITY": "The photo is too blurry, dark or bright. Retake this angle.", "DUPLICATE_VIEW": "This angle looks the same as another. Move around the object and retake.",
        "DUPLICATE_ARCHIVE_FRAME": "This exact photo already exists in the archive. Capture your own object.", "NEAR_DUPLICATE_CAPTURE": "This capture closely matches an existing object. Each launch needs its own object.",
        "NO_OBJECT": "No single object was detected. Center one object and retake.", "PEOPLE_IN_FRAME": "A person or face is visible. Keep people out of the frame and retake.",
        "DOCUMENT_IN_FRAME": "A document or personal information is visible. Remove it and retake.", "SCREEN_IN_FRAME": "A screen is visible. Capture a physical object instead.",
        "PROHIBITED_OBJECT": "This object is not permitted on ObjectPad.", "OBJECT_OR_BACKGROUND_QUALITY": "Keep the object centered on a consistent background and retake.",
        "MEDIA_VALIDATION_UNAVAILABLE": "The AI took too long to answer. Tap Try again: your photos are saved.", "CAPTURE_INCOMPLETE": "All six guided angles are required first.",
        "DUPLICATE_OBJECT": "This object is already on ObjectPad. Every real object can become exactly one coin.", "DUPLICATE_ARTIFACT": "This model already belongs to another coin.",
        "SPONSOR_EMPTY": "Free launches are paused until the treasury is topped up. Your coin launches automatically once it is.",
        "LAUNCH_BUDGET_REACHED": "Today’s free launches are used up. Your coin launches automatically tomorrow.",
        "LAUNCH_SIMULATION_FAILED": "The launch did not pass its safety simulation. Nothing was sent; retry in a moment.",
        "LAUNCH_BROADCAST_FAILED": "The network didn’t take the launch just now. Nothing was spent. Tap Launch to send it again.",
        "ICON_INVALID": "Use a JPG or PNG at least 128 × 128 pixels.", "ICON_LOCKED": "The launch is already sent, so the coin icon is locked in.",
        "METADATA_INVALID": "Check the coin name (2–32 characters), ticker (2–10 letters or digits) and story (10–280 characters).",
        "RECORD_ALREADY_COMMITTED": "This coin’s details are already sealed.", "CAPTURE_CLOSED": "This scan is closed. Start a new one.",
        "PROVIDER_FAILED": "The 3D rebuild failed. Retake the photos in even light on a plain surface.", "RECONSTRUCTION_BUDGET_REACHED": "Today’s reconstruction capacity is used up. Try again tomorrow.",
        "MODEL_NOT_READY": "The model is not ready yet.", "ORIGIN_REJECTED": "This app version is not allowed to make changes. Update ObjectPad.",
        "NOT_FOUND": "Nothing exists at this address.", "REGENERATE_LIMIT": "This scan has used its free 3D rebuilds. Rescan the object.",
        "WALLET_INVALID": "That wallet address doesn’t look right. Paste a full 0x… address or leave it empty.", "LINK_INVALID": "Use https://x.com/handle and https://t.me/group links, or leave them empty.",
        "SIGN_IN_REQUIRED": "Sign in first.", "RETAKE_REQUIRED": "Retake this angle.", "NOTHING_TO_CLAIM": "Not enough creator fees yet to cover a free claim.",
        "REWARD_OBJECT_INVALID": "Name the object in 2–60 characters.", "REWARD_BRIEF_INVALID": "Describe the ask in 10–280 characters.", "REWARD_AMOUNT_INVALID": "Rewards are $5 to $10,000.",
        "REWARD_LINK_INVALID": "That link isn’t a valid https:// URL.", "ETH_PRICE_UNAVAILABLE": "Live ETH price is unavailable. Try again in a minute.", "REWARD_PHOTO_MISSING": "Upload the photo again.",
        "TX_NOT_FOUND": "That transaction isn’t on Robinhood Chain yet. Wait a few seconds and retry.", "TX_AMOUNT_LOW": "That deposit is less than the reward amount.",
        "TX_WRONG_RECIPIENT": "That transaction didn’t go to the Rewards escrow.", "TX_ALREADY_USED": "That transaction already funded another bounty.",
        "REWARD_NOT_OPEN": "This bounty isn’t open.", "COVER_BUSY": "The AI is still painting. Give it a minute.", "REWARD_OWN_BOUNTY": "You can’t claim your own bounty.",
        "REWARD_EXPIRED": "This bounty has ended.", "REWARD_PROOF_REQUIRED": "Add a photo of the object, or the coin you launched for it.", "REWARD_TOO_MANY": "You already have 3 proofs waiting on this bounty.",
        "BOUNTY_CLOSED": "This bounty already has a winner.", "REWARD_HAS_PENDING": "Proofs are waiting. Pick a winner or reject them first.", "REVIEW_REASON_REQUIRED": "Add a short public reason.",
        "WALLET_REQUIRED": "Your account needs a wallet to get paid.", "UNSUPPORTED_IMAGE": "Use a JPG or PNG photo.", "FORBIDDEN": "Only the poster or ObjectPad can do that.",
        "BOUNTY_COIN_NOT_FOUND": "We couldn’t find that coin. Paste its 0x address or objectpad.fun link.", "BOUNTY_NOT_YOUR_COIN": "That coin was launched by another account.",
    ]
    static func describe(_ code: String) -> String { messages[code] ?? "The request could not be completed (\(code.replacingOccurrences(of: "_", with: " ").lowercased())). Retry safely." }
}

/// API caller for one capture session: tries this phone's device secret, the current identity and the older guest token in order.
struct SessionCaller {
    let id: String
    let account: AccountStore

    func raw(_ path: String, method: String = "GET", json: [String: Any]? = nil, bytes: Data? = nil, contentType: String = "image/jpeg", headers: [String: String] = [:], timeout: TimeInterval = 30) async throws -> Data {
        var last: Error = ApiError(code: "NOT_FOUND", status: 404, message: ObjectPadApi.describe("NOT_FOUND"))
        for attempt in try await account.sessionHeaders(id) {
            do { return try await ObjectPadApi.raw(path, method: method, json: json, bytes: bytes, contentType: contentType, headers: attempt.merging(headers) { $1 }, timeout: timeout) }
            catch let e as ApiError { last = e; if ![401, 403, 404].contains(e.status) { throw e } }
        }
        throw last
    }
    func session() async throws -> CaptureSession { try ObjectPadApi.decode(try await raw("/sessions/\(id)")) }
    private func post(_ action: String, _ json: [String: Any] = [:], timeout: TimeInterval = 30) async throws -> Data { try await raw("/sessions/\(id)/\(action)", method: "POST", json: json, timeout: timeout) }
    func reconstruct() async throws -> CaptureSession { try ObjectPadApi.decode(try await post("reconstruct", timeout: 150)) }
    func regenerate() async throws -> CaptureSession { try ObjectPadApi.decode(try await post("regenerate", timeout: 90)) }
    func rescan() async throws -> CaptureSession { let w: SessionWrap = try ObjectPadApi.decode(try await post("rescan")); return w.session }
    func cancel() async { _ = try? await post("cancel") }
    func draft(_ d: LaunchDraft) async throws -> CaptureSession { try ObjectPadApi.decode(try await post("draft", draftJSON(d))) }
    func launch(_ d: LaunchDraft?) async throws -> LaunchResult { try ObjectPadApi.decode(try await post("launch", d.map(draftJSON) ?? [:], timeout: 90)) }
    func ticket(_ view: ScanAngle) async throws -> UploadTicket { try ObjectPadApi.decode(try await post("tickets", ["view": view.rawValue])) }
    func upload(_ ticket: UploadTicket, jpeg: Data) async throws -> CaptureSession { try ObjectPadApi.decode(try await raw(ticket.url, method: "PUT", bytes: jpeg, headers: ["X-Upload-Token": ticket.token], timeout: 60)) }
    func removeView(_ view: ScanAngle) async throws -> CaptureSession { try ObjectPadApi.decode(try await raw("/sessions/\(id)/views/\(view.rawValue)", method: "DELETE")) }
    func setIcon(_ bytes: Data, source: String, modelHash: String?) async throws -> CaptureSession {
        var headers = ["X-Icon-Source": source]; if let modelHash { headers["X-Icon-Model"] = modelHash }
        return try ObjectPadApi.decode(try await raw("/sessions/\(id)/icon", method: "PUT", bytes: bytes, contentType: source == "snapshot" ? "image/png" : "image/jpeg", headers: headers, timeout: 40))
    }
    func download(_ url: String) async throws -> Data { try await raw(url, timeout: 90) }

    private func draftJSON(_ d: LaunchDraft) -> [String: Any] {
        var j: [String: Any] = ["publicName": d.publicName, "symbol": d.symbol, "story": d.story, "xUrl": d.xUrl]
        if let t = d.telegram, !t.isEmpty { j["telegram"] = t }
        if let f = d.feeWallet, !f.isEmpty { j["feeWallet"] = f }
        return j
    }
}

/// Paid Rewards API. Reads work signed out; writes need a signed-in account.
struct RewardsApi {
    let account: AccountStore
    private func token(_ required: Bool = true) async throws -> String? {
        if let t = await account.accountToken() { return t }
        if required { throw ApiError(code: "SIGN_IN_REQUIRED", status: 401, message: "Sign in first.") }
        return nil
    }
    func board() async throws -> RewardBoard { try await ObjectPadApi.get("/rewards", token: try await token(false)) }
    func detail(_ id: String) async throws -> Reward { try await ObjectPadApi.get("/rewards/\(id)", token: try await token(false)) }
    func upload(_ jpeg: Data) async throws -> RewardPhoto { try ObjectPadApi.decode(try await ObjectPadApi.raw("/rewards/photos", method: "PUT", token: try await token(), bytes: jpeg, timeout: 60)) }
    func create(object: String, brief: String, category: String, usd: Int, days: Int, promo: String, adult: Bool, rules: [String], cover: String, inspire: String) async throws -> Reward {
        try await ObjectPadApi.send("/rewards", json: ["object": object, "title": "First \(object) scan", "brief": brief, "category": category, "rewardUsd": usd, "days": days, "promoUrl": promo, "adult": adult, "rules": rules, "cover": cover, "inspire": inspire], token: try await token())
    }
    func cover(_ id: String, mode: String, photo: String) async throws -> Reward { try await ObjectPadApi.send("/rewards/\(id)/cover", json: ["mode": mode, "photo": photo], token: try await token()) }
    func fund(_ id: String, hash: String) async throws -> Reward { try await ObjectPadApi.send("/rewards/\(id)/fund", json: ["hash": hash], token: try await token(), timeout: 45) }
    func cancel(_ id: String) async throws -> Reward { try await ObjectPadApi.send("/rewards/\(id)/cancel", json: ["reason": ""], token: try await token(), timeout: 60) }
    func submit(_ id: String, photo: String, coin: String, note: String) async throws -> RewardProof { try await ObjectPadApi.send("/rewards/\(id)/submissions", json: ["photo": photo, "coin": coin, "note": note], token: try await token()) }
    func payout(_ subId: String) async throws -> Reward { try await ObjectPadApi.send("/rewards/submissions/\(subId)/payout", token: try await token(), timeout: 60) }
    func reject(_ subId: String, note: String) async throws -> Reward { try await ObjectPadApi.send("/rewards/submissions/\(subId)/review", json: ["state": "rejected", "note": note, "tx": ""], token: try await token()) }
}
