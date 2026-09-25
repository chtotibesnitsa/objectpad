package com.objectpad.app.data

import org.bouncycastle.asn1.x9.X9IntegerConverter
import org.bouncycastle.crypto.digests.KeccakDigest
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.ec.CustomNamedCurves
import org.bouncycastle.crypto.params.ECDomainParameters
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.signers.ECDSASigner
import org.bouncycastle.crypto.signers.HMacDSAKCalculator
import org.bouncycastle.math.ec.ECAlgorithms
import org.bouncycastle.math.ec.ECPoint
import org.bouncycastle.math.ec.FixedPointCombMultiplier
import java.math.BigInteger
import java.security.SecureRandom

/** Hex helpers. */
object Hex {
    fun encode(bytes: ByteArray): String = "0x" + bytes.joinToString("") { "%02x".format(it) }
    fun decode(hex: String): ByteArray {
        val h = hex.removePrefix("0x").removePrefix("0X").let { if (it.length % 2 == 1) "0$it" else it }
        return ByteArray(h.length / 2) { i -> h.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
    }
    fun big(hex: String): BigInteger { val h = hex.removePrefix("0x"); return if (h.isEmpty()) BigInteger.ZERO else BigInteger(h, 16) }
    fun of(value: BigInteger): String = "0x" + value.toString(16)
}

/** Keccak-256, secp256k1 keys and Ethereum signatures (low-s, EIP-155), built on BouncyCastle. */
object Crypto {
    private val params = CustomNamedCurves.getByName("secp256k1")
    private val domain = ECDomainParameters(params.curve, params.g, params.n, params.h)
    private val halfN: BigInteger = domain.n.shiftRight(1)

    fun keccak(input: ByteArray): ByteArray {
        val d = KeccakDigest(256); d.update(input, 0, input.size)
        return ByteArray(32).also { d.doFinal(it, 0) }
    }

    /** 4-byte function selector for a canonical signature like `buy(uint256,uint256,address)`. */
    fun selector(signature: String): String = Hex.encode(keccak(signature.toByteArray()).copyOfRange(0, 4))

    fun newPrivateKey(): BigInteger {
        val random = SecureRandom()
        while (true) {
            val candidate = BigInteger(1, ByteArray(32).also { random.nextBytes(it) })
            if (candidate > BigInteger.ZERO && candidate < domain.n) return candidate
        }
    }

    fun publicKey(privateKey: BigInteger): ByteArray = FixedPointCombMultiplier().multiply(domain.g, privateKey).normalize().getEncoded(false)

    fun address(privateKey: BigInteger): String {
        val pub = publicKey(privateKey)
        return checksum(Hex.encode(keccak(pub.copyOfRange(1, 65)).copyOfRange(12, 32)))
    }

    /** EIP-55 mixed-case address. */
    fun checksum(address: String): String {
        val lower = address.lowercase().removePrefix("0x")
        val hash = Hex.encode(keccak(lower.toByteArray())).removePrefix("0x")
        return "0x" + lower.mapIndexed { i, c -> if (c in 'a'..'f' && hash[i].digitToInt(16) >= 8) c.uppercaseChar() else c }.joinToString("")
    }

    fun isValidPrivateKey(hex: String): Boolean {
        val h = hex.trim().removePrefix("0x")
        if (!Regex("^[0-9a-fA-F]{64}$").matches(h)) return false
        val k = BigInteger(h, 16); return k > BigInteger.ZERO && k < domain.n
    }

    class Signature(val r: BigInteger, val s: BigInteger, val recId: Int)

    fun sign(hash: ByteArray, privateKey: BigInteger): Signature {
        val signer = ECDSASigner(HMacDSAKCalculator(SHA256Digest()))
        signer.init(true, ECPrivateKeyParameters(privateKey, domain))
        val (r, s0) = signer.generateSignature(hash).let { it[0] to it[1] }
        val s = if (s0 > halfN) domain.n.subtract(s0) else s0
        val pub = publicKey(privateKey)
        for (rec in 0..3) {
            val recovered = recover(rec, r, s, hash)
            if (recovered != null && recovered.contentEquals(pub)) return Signature(r, s, rec)
        }
        throw IllegalStateException("Could not compute the signature recovery id.")
    }

    private fun recover(recId: Int, r: BigInteger, s: BigInteger, hash: ByteArray): ByteArray? {
        val n = domain.n
        val x = r.add(BigInteger.valueOf((recId / 2).toLong()).multiply(n))
        if (x >= domain.curve.field.characteristic) return null
        val point = decompress(x, (recId and 1) == 1)
        if (!point.multiply(n).isInfinity) return null
        val e = BigInteger(1, hash)
        val eInv = BigInteger.ZERO.subtract(e).mod(n)
        val rInv = r.modInverse(n)
        val q: ECPoint = ECAlgorithms.sumOfTwoMultiplies(domain.g, rInv.multiply(eInv).mod(n), point, rInv.multiply(s).mod(n))
        return q.normalize().getEncoded(false)
    }

    private fun decompress(x: BigInteger, yBit: Boolean): ECPoint {
        val conv = X9IntegerConverter()
        val enc = conv.integerToBytes(x, 1 + conv.getByteLength(domain.curve))
        enc[0] = if (yBit) 0x03 else 0x02
        return domain.curve.decodePoint(enc)
    }
}

/** Minimal RLP encoder for transaction serialisation. */
object Rlp {
    sealed interface Item
    class Bytes(val value: ByteArray) : Item
    class ListItem(val items: List<Item>) : Item

    fun int(value: BigInteger): Bytes = Bytes(if (value.signum() == 0) ByteArray(0) else value.toByteArray().dropWhile { it == 0.toByte() }.toByteArray())
    fun int(value: Long): Bytes = int(BigInteger.valueOf(value))
    fun hex(value: String): Bytes = Bytes(if (value.removePrefix("0x").isEmpty()) ByteArray(0) else Hex.decode(value))

    fun encode(item: Item): ByteArray = when (item) {
        is Bytes -> {
            val v = item.value
            if (v.size == 1 && (v[0].toInt() and 0xff) < 0x80) v else header(0x80, 0xb7, v.size) + v
        }
        is ListItem -> {
            val payload = item.items.fold(ByteArray(0)) { acc, it -> acc + encode(it) }
            header(0xc0, 0xf7, payload.size) + payload
        }
    }

    private fun header(short: Int, long: Int, length: Int): ByteArray {
        if (length <= 55) return byteArrayOf((short + length).toByte())
        val len = BigInteger.valueOf(length.toLong()).toByteArray().dropWhile { it == 0.toByte() }.toByteArray()
        return byteArrayOf((long + len.size).toByte()) + len
    }
}

/** An unsigned transaction on Robinhood Chain. */
data class TxRequest(val to: String, val data: String = "0x", val value: BigInteger = BigInteger.ZERO, val gas: BigInteger = BigInteger.ZERO, val gasPrice: BigInteger = BigInteger.ZERO, val nonce: BigInteger = BigInteger.ZERO)

/** Legacy EIP-155 signing: accepted by every EVM chain including Arbitrum-stack chains. */
object TxSigner {
    fun signLegacy(tx: TxRequest, privateKey: BigInteger, chainId: Long): String {
        val base = listOf(Rlp.int(tx.nonce), Rlp.int(tx.gasPrice), Rlp.int(tx.gas), Rlp.hex(tx.to), Rlp.int(tx.value), Rlp.hex(tx.data))
        val unsigned = Rlp.encode(Rlp.ListItem(base + listOf(Rlp.int(chainId), Rlp.int(0L), Rlp.int(0L))))
        val sig = Crypto.sign(Crypto.keccak(unsigned), privateKey)
        val v = BigInteger.valueOf(chainId * 2 + 35 + sig.recId)
        return Hex.encode(Rlp.encode(Rlp.ListItem(base + listOf(Rlp.int(v), Rlp.int(sig.r), Rlp.int(sig.s)))))
    }
}
