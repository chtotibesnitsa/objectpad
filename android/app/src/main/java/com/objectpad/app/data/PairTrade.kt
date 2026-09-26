package com.objectpad.app.data

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode

/** ETH → pair asset (Uniswap V3 on Robinhood Chain) → coin (Pons V2 curve) for stock-paired coins. Every leg is quoted on-chain. */
object PairTrade {
    const val FALLBACK_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2"
    const val FALLBACK_QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7"
    private val EXACT_INPUT = Crypto.selector("exactInput((bytes,address,uint256,uint256))")
    private val QUOTE_EXACT_INPUT = Crypto.selector("quoteExactInput(bytes,uint256)")
    private val FEE_BPS = Crypto.selector("feeBps()")
    private val CREATOR_TAX_BPS = Crypto.selector("creatorTaxBps()")

    private fun word(v: BigInteger) = v.toString(16).padStart(64, '0')
    private fun addr(a: String) = a.lowercase().removePrefix("0x").padStart(64, '0')
    /** Uniswap V3 path bytes: token(20) | fee(3) | token(20) | … */
    fun path(r: PairRoute): String = buildString { r.tokens.forEachIndexed { i, t -> append(t.lowercase().removePrefix("0x")); if (i < r.fees.size) append(r.fees[i].toString(16).padStart(6, '0')) } }
    private fun tail(hex: String): String { val pad = (64 - hex.length % 64) % 64; return word(BigInteger.valueOf((hex.length / 2).toLong())) + hex + "0".repeat(pad) }
    fun quoteData(r: PairRoute, amountIn: BigInteger) = QUOTE_EXACT_INPUT + word(BigInteger.valueOf(64)) + word(amountIn) + tail(path(r))
    fun swapData(r: PairRoute, recipient: String, amountIn: BigInteger, minOut: BigInteger) =
        EXACT_INPUT + word(BigInteger.valueOf(32)) + word(BigInteger.valueOf(128)) + addr(recipient) + word(amountIn) + word(minOut) + tail(path(r))

    /** Exact pair-asset output for `ethIn`, simulated through QuoterV2. */
    suspend fun quoteSwap(r: PairRoute, ethIn: BigInteger, quoter: String?): BigInteger {
        val out = ChainClient.ethCall(quoter?.ifBlank { null } ?: FALLBACK_QUOTER, quoteData(r, ethIn))
        if (out.length < 66) throw ChainException("No on-chain swap route right now.")
        return Hex.big(out.take(66)).also { if (it <= BigInteger.ZERO) throw ChainException("No on-chain swap route right now.") }
    }

    /** Coin tokens a curve returns for `quoteIn` of its quote asset (Pons V2 constant product after fee and creator tax). */
    suspend fun curveBuy(curve: String, quoteIn: BigInteger): BigInteger = coroutineScope {
        val f = async { Hex.big(ChainClient.ethCall(curve, FEE_BPS)) }; val t = async { Hex.big(ChainClient.ethCall(curve, CREATOR_TAX_BPS)) }
        val q = async { Hex.big(ChainClient.ethCall(curve, Abi.QUOTE_RESERVE)) }; val r = async { Hex.big(ChainClient.ethCall(curve, Abi.TOKEN_RESERVE)) }
        val p = async { Hex.big(ChainClient.ethCall(curve, Abi.PHANTOM_QUOTE)) }
        val qr = q.await(); val ph = p.await(); val virtual = if (qr >= ph) qr else qr + ph
        val ten = BigInteger.valueOf(10_000)
        val net = quoteIn - quoteIn * f.await() / ten - quoteIn * t.await() / ten
        if (net <= BigInteger.ZERO) BigInteger.ZERO else net * r.await() / (virtual + net)
    }

    fun format(v: BigInteger, decimals: Int, digits: Int = 6): String =
        BigDecimal(v).divide(BigDecimal.TEN.pow(decimals)).setScale(digits, RoundingMode.DOWN).stripTrailingZeros().toPlainString()
}
