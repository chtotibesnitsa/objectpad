import Foundation
import Observation
import PrivySDK

/// Anything that can sign and broadcast a Robinhood Chain transaction.
enum WalletSigner {
    case device(key: [UInt8], address: String)
    case account(any EmbeddedEthereumWallet)

    var address: String {
        switch self {
        case .device(_, let a): return a
        case .account(let w): return w.address
        }
    }
    var label: String {
        switch self {
        case .device: return "This iPhone’s wallet"
        case .account: return "Account wallet · same as objectpad.fun"
        }
    }

    /// Signs locally (device key) or through Privy, then broadcasts to Robinhood Chain ourselves. Returns the tx hash.
    func send(_ tx: TxRequest) async throws -> String {
        let prepared = try await ChainClient.shared.prepare(from: address, tx)
        switch self {
        case .device(let key, _):
            return try await ChainClient.shared.sendRaw(try EthCrypto.signLegacy(prepared, privateKey: key, chainId: Chain.id))
        case .account(let wallet):
            await wallet.provider.switchChain(chainId: Int(Chain.id), rpcUrl: Chain.rpc.absoluteString)
            let unsigned = EthereumRpcRequest.UnsignedEthTransaction(
                from: address, to: prepared.to, nonce: .hexadecimalNumber(prepared.nonce.hex), gasLimit: .hexadecimalNumber(prepared.gas.hex),
                gasPrice: .hexadecimalNumber(prepared.gasPrice.hex), data: prepared.data, value: .hexadecimalNumber(prepared.value.hex), chainId: .int(Int(Chain.id)), type: 0
            )
            let signed = try await wallet.provider.request(try EthereumRpcRequest.ethSignTransaction(transaction: unsigned))
            return try await ChainClient.shared.sendRaw(signed)
        }
    }
}

/// One identity for the whole app, identical to the website: a signed-in Privy account when there is one, otherwise an
/// account-free guest token (only its hash is stored on the server). Launching never needs an account.
@Observable
@MainActor
final class AccountStore {
    static let privyAppId = "cmu9ynto900gm0cl37y8987od"

    private(set) var ready: Bool = false
    private(set) var signedIn: Bool = false
    private(set) var accountWallet: String?
    private(set) var localWallet: String?
    private(set) var profile: Profile?
    private(set) var me: AccountMe?
    var lastError: String?

    private var privy: (any Privy)?
    private var user: (any PrivyUser)?
    private var guestTask: Task<String, Error>?

    var signInAvailable: Bool { privy != nil }
    /// The wallet trades are signed with: the account wallet when signed in, otherwise this phone's wallet.
    var activeWallet: String? { accountWallet ?? localWallet }
    var displayName: String { profile?.alias.isEmpty == false ? profile!.alias : (signedIn ? "Creator" : "Guest") }

    init() {
        localWallet = loadLocalKey().flatMap { try? EthCrypto.address(privateKey: $0) }
        let clientId = Config.EXPO_PUBLIC_PRIVY_APP_CLIENT_ID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clientId.isEmpty {
            privy = PrivySdk.initialize(config: PrivyConfig(appId: Self.privyAppId, appClientId: clientId))
        }
    }

    func start() {
        guard let privy else { ready = true; return }
        Task {
            for await state in privy.authStateStream { await apply(state) }
        }
    }

    private func apply(_ state: AuthState) async {
        switch state {
        case .authenticated(let u):
            user = u
            if u.embeddedEthereumWallets.isEmpty { _ = try? await u.createEthereumWallet() }
            signedIn = true; ready = true
            accountWallet = u.embeddedEthereumWallets.first?.address
            await refreshProfile()
        case .unauthenticated:
            user = nil; signedIn = false; accountWallet = nil; profile = nil; me = nil; ready = true
        case .notReady, .authenticatedUnverified:
            break
        }
    }

    // MARK: Tokens

    func accountToken() async -> String? {
        guard let user else { return nil }
        return try? await user.getAccessToken()
    }

    var guestToken: String? {
        guard let t = Keychain.get("guest"), t.hasPrefix("g_"), t.count == 66 else { return nil }
        return t
    }

    /// Returns the guest token, asking the API for one on first use.
    func ensureGuestToken() async throws -> String {
        if let t = guestToken { return t }
        if let task = guestTask { return try await task.value }
        let task = Task<String, Error> {
            let g: GuestToken = try await ObjectPadApi.send("/guests")
            Keychain.set("guest", g.token)
            return g.token
        }
        guestTask = task
        defer { guestTask = nil }
        return try await task.value
    }

    /// Current creator identity: the account when signed in, otherwise the guest token.
    func token() async throws -> String {
        if let t = await accountToken() { return t }
        return try await ensureGuestToken()
    }

    func deviceSecret(_ id: String) -> String? { Keychain.get("device.\(id)") }
    func saveDeviceSecret(_ id: String, _ secret: String) { Keychain.set("device.\(id)", secret) }
    func forgetDeviceSecret(_ id: String) { Keychain.set("device.\(id)", nil) }

    /// Access attempts for one capture session, in the website's order.
    func sessionHeaders(_ id: String) async throws -> [[String: String]] {
        var out: [[String: String]] = []
        if let s = deviceSecret(id) { out.append(["X-Capture-Device": s]) }
        out.append(["Authorization": "Bearer \(try await token())"])
        if signedIn, let g = guestToken { out.append(["Authorization": "Bearer \(g)"]) }
        return out
    }

    // MARK: Sign-in

    private func requirePrivy() throws -> any Privy {
        guard let privy else { throw ApiError(code: "AUTH_NOT_CONFIGURED", status: 0, message: "Sign-in isn’t switched on in this build yet. You can still scan and launch as a guest.") }
        return privy
    }

    func sendEmailCode(_ email: String) async throws { try await requirePrivy().email.sendCode(to: email) }
    func loginEmail(code: String, email: String) async throws { let u = try await requirePrivy().email.loginWithCode(code, sentTo: email); await afterLogin(u) }
    func loginX() async throws { let u = try await requirePrivy().oAuth.login(with: .twitter, appUrlScheme: "objectpad"); await afterLogin(u) }
    func loginApple() async throws { let u = try await requirePrivy().oAuth.login(with: .apple, appUrlScheme: "objectpad"); await afterLogin(u) }
    func loginGoogle() async throws { let u = try await requirePrivy().oAuth.login(with: .google, appUrlScheme: "objectpad"); await afterLogin(u) }

    private func afterLogin(_ u: any PrivyUser) async {
        user = u
        if u.embeddedEthereumWallets.isEmpty { _ = try? await u.createEthereumWallet() }
        signedIn = true
        accountWallet = u.embeddedEthereumWallets.first?.address
        await refreshProfile()
        await adoptGuestLaunches()
    }

    func logout() async {
        await user?.logout()
        user = nil; signedIn = false; accountWallet = nil; profile = nil; me = nil
    }

    /// POST /account creates the public profile on first use and returns the account's creator wallet.
    func refreshProfile() async {
        guard let t = await accountToken() else { return }
        if let p: Profile = try? await ObjectPadApi.send("/account", token: t) {
            profile = p
            if accountWallet == nil { accountWallet = p.wallet }
        }
        await refreshMe()
    }

    func refreshMe() async {
        guard let t = await accountToken() else { return }
        me = try? await ObjectPadApi.get("/account/me", token: t, timeout: 30)
    }

    func setAlias(_ alias: String) async throws {
        let p: Profile = try await ObjectPadApi.send("/profile", json: ["alias": alias], token: try await token())
        profile = Profile(publicId: profile?.publicId ?? p.publicId, alias: p.alias, wallet: profile?.wallet)
    }

    /// Moves unlaunched guest scans and guest launches into the signed-in account.
    func adopt(sessionId: String) async -> Int {
        guard let t = await accountToken() else { return 0 }
        var body: [String: Any] = ["sessionId": sessionId]
        if let g = guestToken { body["guestToken"] = g }
        if let s = deviceSecret(sessionId) { body["deviceSecret"] = s }
        let r: Adopted? = try? await ObjectPadApi.send("/account/adopt", json: body, token: t)
        return r?.adopted ?? 0
    }

    private func adoptGuestLaunches() async {
        guard let t = await accountToken(), let g = guestToken else { return }
        let _: Adopted? = try? await ObjectPadApi.send("/account/adopt", json: ["guestToken": g], token: t)
    }

    // MARK: This iPhone's wallet

    private func loadLocalKey() -> [UInt8]? {
        guard let hex = Keychain.get("wallet.key"), EthCrypto.isValidKey(hex) else { return nil }
        return Hex.bytes(hex)
    }

    /// Creates (once) this phone's wallet. The key lives in the Keychain; the server only ever sees the address.
    @discardableResult
    func ensureLocalWallet() throws -> String {
        if let a = localWallet { return a }
        let key = try EthCrypto.newPrivateKey()
        Keychain.set("wallet.key", Hex.string(key))
        let address = try EthCrypto.address(privateKey: key)
        localWallet = address
        return address
    }

    func importLocalWallet(_ hex: String) throws {
        guard EthCrypto.isValidKey(hex) else { throw CryptoError.badKey }
        let body = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "0x", with: "").lowercased()
        Keychain.set("wallet.key", "0x" + body)
        localWallet = try EthCrypto.address(privateKey: Hex.bytes(body))
    }

    func localPrivateKeyHex() -> String? { Keychain.get("wallet.key") }

    func removeLocalWallet() { Keychain.set("wallet.key", nil); localWallet = nil }

    /// Signer for a specific wallet this device controls (or the default: account wallet, else this phone's wallet).
    func signer(for address: String? = nil) throws -> WalletSigner {
        let target = address?.lowercased()
        if let w = user?.embeddedEthereumWallets.first, target == nil || w.address.lowercased() == target { return .account(w) }
        if target == nil || target == localWallet?.lowercased() {
            try ensureLocalWallet()
            guard let key = loadLocalKey(), let a = localWallet else { throw CryptoError.badKey }
            return .device(key: key, address: a)
        }
        throw ApiError(code: "WALLET_NOT_HERE", status: 0, message: "This wallet’s key isn’t on this iPhone.")
    }

    /// Proves this phone holds its wallet (signed locally) and links it to the signed-in account, like the website.
    func linkLocalWallet() async throws {
        guard let t = await accountToken() else { throw ApiError(code: "SIGN_IN_REQUIRED", status: 401, message: "Sign in first.") }
        if profile == nil { await refreshProfile() }
        guard let publicId = profile?.publicId, !publicId.isEmpty, let key = loadLocalKey(), let address = localWallet else { return }
        let at = Int(Date().timeIntervalSince1970 * 1000)
        let message = "ObjectPad: link creator wallet \(address.lowercased()) to account \(publicId) at \(at)"
        let signature = try EthCrypto.personalSign(message, privateKey: key)
        _ = try await ObjectPadApi.raw("/account/wallets", method: "POST", token: t, json: ["address": address, "at": at, "signature": signature])
        await refreshMe()
    }

    /// Asks the treasury to top up just enough gas for a claim (signed-in, linked wallets only).
    func claimGas(for address: String) async throws {
        guard let t = await accountToken() else { return }
        _ = try await ObjectPadApi.raw("/account/claim-gas", method: "POST", token: t, json: ["address": address], timeout: 60)
    }

    /// Scans this identity owns (guest token or account), newest first. Launched ones carry their token.
    func myScans() async throws -> [CaptureSession] {
        let list: SessionList = try await ObjectPadApi.get("/sessions", token: try await token())
        return list.items.sorted { $0.createdAt > $1.createdAt }
    }
}
