import Foundation
import Security
import libsecp256k1

nonisolated enum Hex {
    static func bytes(_ hex: String) -> [UInt8] {
        var s = hex.hasPrefix("0x") || hex.hasPrefix("0X") ? String(hex.dropFirst(2)) : hex
        if s.count % 2 == 1 { s = "0" + s }
        var out: [UInt8] = []; out.reserveCapacity(s.count / 2)
        var i = s.startIndex
        while i < s.endIndex {
            let j = s.index(i, offsetBy: 2)
            out.append(UInt8(s[i..<j], radix: 16) ?? 0)
            i = j
        }
        return out
    }
    static func string(_ bytes: [UInt8]) -> String { "0x" + bytes.map { String(format: "%02x", $0) }.joined() }
    static func pad(_ hex: String, to length: Int = 64) -> String {
        let h = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        return String(repeating: "0", count: max(0, length - h.count)) + h.lowercased()
    }
}

/// Keccak-256 (Ethereum's pre-standard SHA-3 padding).
nonisolated enum Keccak {
    private static let rc: [UInt64] = [0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000, 0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a, 0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a, 0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008]
    private static let rot: [UInt64] = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44]
    private static let pi: [Int] = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1]

    @inline(__always) private static func rl(_ x: UInt64, _ n: UInt64) -> UInt64 { (x << n) | (x >> (64 - n)) }

    private static func permute(_ st: inout [UInt64]) {
        var bc = [UInt64](repeating: 0, count: 5)
        for round in 0..<24 {
            for i in 0..<5 { bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20] }
            for i in 0..<5 {
                let t = bc[(i + 4) % 5] ^ rl(bc[(i + 1) % 5], 1)
                for j in stride(from: 0, to: 25, by: 5) { st[j + i] ^= t }
            }
            var t = st[1]
            for i in 0..<24 { let j = pi[i]; let tmp = st[j]; st[j] = rl(t, rot[i]); t = tmp }
            for j in stride(from: 0, to: 25, by: 5) {
                for i in 0..<5 { bc[i] = st[j + i] }
                for i in 0..<5 { st[j + i] ^= (~bc[(i + 1) % 5]) & bc[(i + 2) % 5] }
            }
            st[0] ^= rc[round]
        }
    }

    static func hash(_ data: [UInt8]) -> [UInt8] {
        let rate = 136
        var msg = data; msg.append(0x01)
        while msg.count % rate != 0 { msg.append(0) }
        msg[msg.count - 1] |= 0x80
        var st = [UInt64](repeating: 0, count: 25)
        for offset in stride(from: 0, to: msg.count, by: rate) {
            for i in 0..<(rate / 8) {
                var lane: UInt64 = 0
                for b in 0..<8 { lane |= UInt64(msg[offset + i * 8 + b]) << (8 * UInt64(b)) }
                st[i] ^= lane
            }
            permute(&st)
        }
        var out: [UInt8] = []
        for i in 0..<4 { for b in 0..<8 { out.append(UInt8((st[i] >> (8 * UInt64(b))) & 0xFF)) } }
        return out
    }

    static func hash(_ text: String) -> [UInt8] { hash(Array(text.utf8)) }
    static func selector(_ signature: String) -> String { Hex.string(Array(hash(signature).prefix(4))) }
}

/// Minimal RLP encoding for legacy transactions.
nonisolated enum RLP {
    indirect enum Item { case bytes([UInt8]); case list([Item]) }
    static func encode(_ item: Item) -> [UInt8] {
        switch item {
        case .bytes(let v):
            if v.count == 1, v[0] < 0x80 { return v }
            return header(0x80, v.count) + v
        case .list(let items):
            let payload = items.flatMap { encode($0) }
            return header(0xc0, payload.count) + payload
        }
    }
    private static func header(_ base: UInt8, _ length: Int) -> [UInt8] {
        if length <= 55 { return [base + UInt8(length)] }
        let len = BigUInt(UInt64(length)).bytes
        return [base + 55 + UInt8(len.count)] + len
    }
}

/// An unsigned Robinhood Chain transaction.
nonisolated struct TxRequest: Sendable {
    var to: String
    var data: String = "0x"
    var value: BigUInt = .zero
    var gas: BigUInt = .zero
    var gasPrice: BigUInt = .zero
    var nonce: BigUInt = .zero
}

nonisolated enum CryptoError: LocalizedError {
    case badKey
    var errorDescription: String? { "That isn’t a valid 64-character private key." }
}

/// secp256k1 keys, EIP-55 addresses, EIP-155 legacy signing and EIP-191 personal messages (libsecp256k1 core API).
nonisolated enum EthCrypto {
    /// Signing context (the static context cannot touch secret keys).
    nonisolated(unsafe) private static let ctx: OpaquePointer = secp256k1_context_create(1)!

    static func newPrivateKey() throws -> [UInt8] {
        for _ in 0..<8 {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, 32, &bytes) == errSecSuccess else { throw CryptoError.badKey }
            if secp256k1_ec_seckey_verify(ctx, bytes) == 1 { return bytes }
        }
        throw CryptoError.badKey
    }

    static func isValidKey(_ hex: String) -> Bool {
        let h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = h.hasPrefix("0x") ? String(h.dropFirst(2)) : h
        guard body.count == 64, body.allSatisfy(\.isHexDigit) else { return false }
        return secp256k1_ec_seckey_verify(ctx, Hex.bytes(body)) == 1
    }

    private static func serialize(_ key: inout secp256k1_pubkey) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: 65); var len = 65
        _ = secp256k1_ec_pubkey_serialize(ctx, &out, &len, &key, 2)
        return Array(out.prefix(len))
    }

    private static func publicKey(_ privateKey: [UInt8]) throws -> secp256k1_pubkey {
        var key = secp256k1_pubkey()
        guard privateKey.count == 32, secp256k1_ec_pubkey_create(ctx, &key, privateKey) == 1 else { throw CryptoError.badKey }
        return key
    }

    static func address(privateKey: [UInt8]) throws -> String {
        var key = try publicKey(privateKey)
        let pub = serialize(&key)
        guard pub.count == 65 else { throw CryptoError.badKey }
        return checksum(Hex.string(Array(Keccak.hash(Array(pub[1...])).suffix(20))))
    }

    static func checksum(_ address: String) -> String {
        let lower = address.lowercased().replacingOccurrences(of: "0x", with: "")
        let hash = Hex.string(Keccak.hash(lower)).dropFirst(2)
        return "0x" + String(zip(lower, hash).map { c, h in c.isLetter && (h.hexDigitValue ?? 0) >= 8 ? Character(c.uppercased()) : c })
    }

    /// Deterministic (RFC 6979) low-s ECDSA, plus the recovery id found by checking s·R == e·G + r·Q for each parity of R.
    private static func sign(_ digest: [UInt8], _ privateKey: [UInt8]) throws -> (r: [UInt8], s: [UInt8], rec: Int) {
        var sig = secp256k1_ecdsa_signature()
        guard secp256k1_ecdsa_sign(ctx, &sig, digest, privateKey, nil, nil) == 1 else { throw CryptoError.badKey }
        var compact = [UInt8](repeating: 0, count: 64)
        _ = secp256k1_ecdsa_signature_serialize_compact(ctx, &compact, &sig)
        let r = Array(compact[0..<32]), s = Array(compact[32..<64])
        var q = try publicKey(privateKey)
        var eG = secp256k1_pubkey()
        guard secp256k1_ec_pubkey_create(ctx, &eG, digest) == 1 else { throw CryptoError.badKey }
        guard secp256k1_ec_pubkey_tweak_mul(ctx, &q, r) == 1 else { throw CryptoError.badKey }
        var sum = secp256k1_pubkey()
        let combined: Int32 = withUnsafePointer(to: &eG) { a in withUnsafePointer(to: &q) { b in
            var ins: [UnsafePointer<secp256k1_pubkey>?] = [a, b]
            return secp256k1_ec_pubkey_combine(ctx, &sum, &ins, 2)
        } }
        guard combined == 1 else { throw CryptoError.badKey }
        let expected = serialize(&sum)
        for parity in 0..<2 {
            var candidate = secp256k1_pubkey()
            let encoded: [UInt8] = [parity == 0 ? 0x02 : 0x03] + r
            guard secp256k1_ec_pubkey_parse(ctx, &candidate, encoded, 33) == 1, secp256k1_ec_pubkey_tweak_mul(ctx, &candidate, s) == 1 else { continue }
            if serialize(&candidate) == expected { return (r, s, parity) }
        }
        throw ChainError.message("Could not compute the signature recovery id.")
    }

    private static func strip(_ b: [UInt8]) -> [UInt8] { Array(b.drop(while: { $0 == 0 })) }

    /// Legacy EIP-155 raw transaction, accepted by every EVM chain including Arbitrum-stack chains.
    static func signLegacy(_ tx: TxRequest, privateKey: [UInt8], chainId: UInt64) throws -> String {
        let base: [RLP.Item] = [.bytes(tx.nonce.bytes), .bytes(tx.gasPrice.bytes), .bytes(tx.gas.bytes), .bytes(Hex.bytes(tx.to)), .bytes(tx.value.bytes), .bytes(Hex.bytes(tx.data))]
        let unsigned = RLP.encode(.list(base + [.bytes(BigUInt(chainId).bytes), .bytes([]), .bytes([])]))
        let sig = try sign(Keccak.hash(unsigned), privateKey)
        let v = BigUInt(chainId * 2 + 35 + UInt64(sig.rec))
        return Hex.string(RLP.encode(.list(base + [.bytes(v.bytes), .bytes(strip(sig.r)), .bytes(strip(sig.s))])))
    }

    /// `personal_sign` signature (r‖s‖v with v = 27/28), as viem's `signMessage` produces.
    static func personalSign(_ message: String, privateKey: [UInt8]) throws -> String {
        let bytes = Array(message.utf8)
        let digest = Keccak.hash(Array("\u{19}Ethereum Signed Message:\n\(bytes.count)".utf8) + bytes)
        let sig = try sign(digest, privateKey)
        return Hex.string(sig.r + sig.s + [UInt8(27 + sig.rec)])
    }
}

/// Keychain storage for secrets that must never leave this device (wallet key, guest token, capture secrets).
nonisolated enum Keychain {
    private static let service = "fun.objectpad.app"
    static func get(_ key: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func set(_ key: String, _ value: String?) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(base as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}
