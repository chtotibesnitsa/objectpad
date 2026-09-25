package com.objectpad.app.data

import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode

/** Robinhood Chain and ObjectPad protocol constants, mirrored from `web-handlesend/src/shared/pons.ts` and `economy.ts`. */
object Chain {
    const val ID = 4663L
    const val NAME = "Robinhood Chain"
    const val RPC = "https://rpc.mainnet.chain.robinhood.com"
    const val EXPLORER = "https://robinhoodchain.blockscout.com"
    const val PONS_FEE_ESCROW = "0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e"
    const val DEAD = "0x000000000000000000000000000000000000dEaD"
    const val QUOTE_ACCOUNT = "0x1111111111111111111111111111111111111111"
    val GAS_RESERVE: BigInteger = BigInteger.valueOf(3_000_000_000_000_000L)
    val WEI: BigDecimal = BigDecimal.TEN.pow(18)

    /** Pons creator tax per trade (1.5%), split in equal thirds by each object's fee vault. */
    const val CREATOR_TAX_BPS = 150
    const val PONS_PROTOCOL_FEE_BPS = 100

    fun txUrl(hash: String) = "$EXPLORER/tx/$hash"
    fun addressUrl(a: String) = "$EXPLORER/address/$a"
    fun tokenUrl(a: String) = "$EXPLORER/token/$a"
    fun isAddress(s: String) = Regex("^0x[0-9a-fA-F]{40}$").matches(s.trim())
    fun isHash(s: String?) = s != null && Regex("^0x[0-9a-fA-F]{64}$").matches(s)

    fun toEth(wei: BigInteger): Double = BigDecimal(wei).divide(WEI).toDouble()
    fun toWei(eth: BigDecimal): BigInteger = eth.multiply(WEI).setScale(0, RoundingMode.DOWN).toBigInteger()
    /** Exact decimal parsing, like the website's `parseAmount`: null for invalid or zero input. */
    fun parseAmount(raw: String): BigInteger? {
        val cleaned = raw.replace(",", "").trim()
        if (cleaned.isEmpty() || cleaned == "." || !Regex("^\\d*\\.?\\d*$").matches(cleaned)) return null
        val frac = cleaned.substringAfter('.', "")
        if (frac.length > 18) return null
        val v = toWei(BigDecimal(if (cleaned.startsWith(".")) "0$cleaned" else cleaned))
        return if (v > BigInteger.ZERO) v else null
    }
    fun formatUnits(v: BigInteger, digits: Int = 6): String = BigDecimal(v).divide(WEI).setScale(digits, RoundingMode.DOWN).stripTrailingZeros().toPlainString()
}

class ChainException(message: String) : Exception(message)

/** ABI encoding for the handful of calls the app makes. */
object Abi {
    private fun word(v: BigInteger) = v.toString(16).padStart(64, '0')
    private fun addr(a: String) = a.lowercase().removePrefix("0x").padStart(64, '0')
    val BUY = Crypto.selector("buy(uint256,uint256,address)")
    val SELL = Crypto.selector("sell(uint256,uint256,address)")
    val APPROVE = Crypto.selector("approve(address,uint256)")
    val ALLOWANCE = Crypto.selector("allowance(address,address)")
    val BALANCE_OF = Crypto.selector("balanceOf(address)")
    val CLAIM = Crypto.selector("claim()")
    val QUOTE_RESERVE = Crypto.selector("quoteReserve()")
    val TOKEN_RESERVE = Crypto.selector("tokenReserve()")
    val PHANTOM_QUOTE = Crypto.selector("phantomQuote()")
    val GRAD_THRESHOLD = Crypto.selector("graduationThreshold()")
    val GRADUATED = Crypto.selector("graduated()")

    fun buy(quoteIn: BigInteger, minOut: BigInteger, to: String) = BUY + word(quoteIn) + word(minOut) + addr(to)
    fun sell(tokensIn: BigInteger, minOut: BigInteger, to: String) = SELL + word(tokensIn) + word(minOut) + addr(to)
    fun approve(spender: String, amount: BigInteger) = APPROVE + addr(spender) + word(amount)
    fun allowance(owner: String, spender: String) = ALLOWANCE + addr(owner) + addr(spender)
    fun balanceOf(owner: String) = BALANCE_OF + addr(owner)
}

data class CurveState(val priceEth: Double, val marketCapEth: Double, val realReserveEth: Double, val progress: Double, val graduated: Boolean)

/** JSON-RPC client for Robinhood Chain. Every balance and quote in the app is read here or from the ObjectPad API. */
object ChainClient {
    private val json = ObjectPadApi.json

    private suspend fun call(method: String, params: JsonArray): JsonElement {
        val body = buildJsonObject { put("jsonrpc", "2.0"); put("id", 1); put("method", method); put("params", params) }
        val text = try {
            ObjectPadApi.http.post(Chain.RPC) { contentType(ContentType.Application.Json); setBody(body.toString()) }.bodyAsText()
        } catch (e: Exception) { throw ChainException("Robinhood Chain could not be reached. Check your connection.") }
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrElse { throw ChainException("Robinhood Chain sent an unreadable reply.") }
        val error = obj["error"]
        if (error != null && error !is JsonNull) {
            val message = (error as? JsonObject)?.get("message")?.jsonPrimitive?.content ?: "RPC error"
            throw ChainException(friendly(message))
        }
        return obj["result"] ?: JsonNull
    }

    private fun friendly(raw: String): String = when {
        raw.contains("insufficient funds", true) -> "Not enough ETH on Robinhood Chain for this amount plus gas."
        raw.contains("execution reverted", true) -> "The curve rejected this trade (price moved or amount too large). Nothing was sent."
        raw.contains("nonce", true) -> "Your wallet had a pending transaction. Wait a moment and retry."
        else -> "Robinhood Chain: ${raw.take(140)}"
    }

    private fun str(v: String) = JsonPrimitive(v)
    private fun callObj(to: String, data: String, from: String? = null, value: BigInteger? = null) = buildJsonObject {
        if (from != null) put("from", from); put("to", to); put("data", data); if (value != null) put("value", Hex.of(value))
    }

    suspend fun ethCall(to: String, data: String, from: String? = null, value: BigInteger? = null, overrides: JsonObject? = null): String {
        val params = mutableListOf<JsonElement>(callObj(to, data, from, value), str("latest"))
        if (overrides != null) params += overrides
        return call("eth_call", JsonArray(params)).jsonPrimitive.content
    }

    suspend fun balance(address: String): BigInteger = Hex.big(call("eth_getBalance", JsonArray(listOf(str(address), str("latest")))).jsonPrimitive.content)
    suspend fun tokenBalance(token: String, owner: String): BigInteger = Hex.big(ethCall(token, Abi.balanceOf(owner)))
    suspend fun allowance(token: String, owner: String, spender: String): BigInteger = Hex.big(ethCall(token, Abi.allowance(owner, spender)))
    suspend fun escrowBalance(owner: String): BigInteger = Hex.big(ethCall(Chain.PONS_FEE_ESCROW, Abi.balanceOf(owner)))
    suspend fun gasPrice(): BigInteger = Hex.big(call("eth_gasPrice", JsonArray(emptyList())).jsonPrimitive.content)
    suspend fun nonce(address: String): BigInteger = Hex.big(call("eth_getTransactionCount", JsonArray(listOf(str(address), str("pending")))).jsonPrimitive.content)
    suspend fun estimateGas(from: String, tx: TxRequest): BigInteger =
        Hex.big(call("eth_estimateGas", JsonArray(listOf(callObj(tx.to, tx.data, from, tx.value)))).jsonPrimitive.content)
    suspend fun sendRaw(raw: String): String = call("eth_sendRawTransaction", JsonArray(listOf(str(raw)))).jsonPrimitive.content

    /** Balances for many tokens at once. A failed read is reported as null, never as zero. */
    suspend fun tokenBalances(tokens: List<String>, owner: String): Map<String, BigInteger?> = coroutineScope {
        tokens.map { t -> async { t to runCatching { tokenBalance(t, owner) }.getOrNull() } }.associate { it.await() }
    }

    /** Live bonding-curve state with the website's phantom-reserve rule. */
    suspend fun curve(curve: String): CurveState = coroutineScope {
        val q = async { Hex.big(ethCall(curve, Abi.QUOTE_RESERVE)) }; val r = async { Hex.big(ethCall(curve, Abi.TOKEN_RESERVE)) }
        val p = async { Hex.big(ethCall(curve, Abi.PHANTOM_QUOTE)) }; val g = async { Hex.big(ethCall(curve, Abi.GRAD_THRESHOLD)) }
        val grad = async { Hex.big(ethCall(curve, Abi.GRADUATED)) > BigInteger.ZERO }
        val quote = q.await(); val reserve = r.await(); val phantom = p.await(); val threshold = g.await(); val graduated = grad.await()
        val virtual = if (quote >= phantom) quote else quote + phantom
        val real = if (virtual > phantom) virtual - phantom else BigInteger.ZERO
        val price = if (reserve > BigInteger.ZERO) Chain.toEth(virtual) / Chain.toEth(reserve) else 0.0
        CurveState(price, price * 1_000_000_000, Chain.toEth(real), if (graduated) 1.0 else if (threshold > BigInteger.ZERO) minOf(1.0, Chain.toEth(real) / Chain.toEth(threshold)) else 0.0, graduated)
    }

    /** Exact buy output simulated on the curve with a funded throwaway account (the website's `quoteBuy`). */
    suspend fun quoteBuy(curve: String, quoteIn: BigInteger): BigInteger {
        val overrides = buildJsonObject { put(Chain.QUOTE_ACCOUNT, buildJsonObject { put("balance", Hex.of(quoteIn * BigInteger.TWO + Chain.WEI.toBigInteger())) }) }
        val out = ethCall(curve, Abi.buy(quoteIn, BigInteger.ZERO, Chain.QUOTE_ACCOUNT), Chain.QUOTE_ACCOUNT, quoteIn, overrides)
        if (out.length < 66) throw ChainException("The curve returned no quote.")
        return Hex.big(out.take(66))
    }

    /** Exact sell output simulated from the seller's own balance. */
    suspend fun quoteSell(curve: String, seller: String, tokensIn: BigInteger): BigInteger {
        val out = ethCall(curve, Abi.sell(tokensIn, BigInteger.ZERO, seller), seller)
        if (out.length < 66) throw ChainException("The curve returned no quote.")
        return Hex.big(out.take(66))
    }

    /** Fills gas (+25% headroom, like the website), gas price and nonce. A failing estimate means it would revert, so nothing is sent. */
    suspend fun prepare(from: String, tx: TxRequest): TxRequest = coroutineScope {
        val gas = async { estimateGas(from, tx) }; val price = async { gasPrice() }; val n = async { nonce(from) }
        tx.copy(gas = gas.await() * BigInteger.valueOf(125) / BigInteger.valueOf(100), gasPrice = price.await() * BigInteger.valueOf(110) / BigInteger.valueOf(100), nonce = n.await())
    }

    /** Waits for a receipt; throws if the transaction reverted. */
    suspend fun waitForReceipt(hash: String, timeoutMs: Long = 90_000) {
        val until = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < until) {
            val r = runCatching { call("eth_getTransactionReceipt", JsonArray(listOf(str(hash)))) }.getOrNull()
            if (r is JsonObject) {
                val status = r["status"]?.jsonPrimitive?.content
                if (status == "0x1") return
                throw ChainException("The transaction reverted on-chain. No state changed.")
            }
            delay(1500)
        }
        throw ChainException("Still waiting for confirmation. Check the receipt on Blockscout.")
    }
}
