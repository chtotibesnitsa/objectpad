package com.rork.tagstock.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.math.BigDecimal
import java.math.BigInteger

/** Robinhood Chain constants, verified against `web-handlesend/src/lib/pons.ts`. */
object Chain {
    const val ID = 4663
    const val NAME = "Robinhood Chain"
    const val RPC = "https://rpc.mainnet.chain.robinhood.com"
    const val EXPLORER = "https://robinhoodchain.blockscout.com"
    const val PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e"
    const val PONS_ROUTER = "0xe33e9e479df8802cb0866d5d05258bec4cf62948"
    const val CASEPAD_TOKEN = "0x03de80661ac0766ad1da66e024b9e4cc91af407a"
    const val BURN_ADDRESS = "0x000000000000000000000000000000000000dead"
    const val TOTAL_SUPPLY = 1_000_000_000.0

    object Selector {
        const val QUOTE_RESERVE = "0x9da771f4"; const val TOKEN_RESERVE = "0xcbcb3171"; const val PHANTOM_QUOTE = "0xc57eadfc"
        const val GRADUATION_THRESHOLD = "0x8b0bc501"; const val GRADUATED = "0xe7c2b772"; const val CREATOR_TAX_BPS = "0xc1bb8901"
        const val BALANCE_OF = "0x70a08231"
    }
    const val CURVE_BUY_TOPIC = "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455"
    const val CURVE_SELL_TOPIC = "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df"

    fun txUrl(hash: String) = "$EXPLORER/tx/$hash"
    fun addressUrl(a: String) = "$EXPLORER/address/$a"
    fun tokenUrl(a: String) = "$EXPLORER/token/$a"
    fun isAddress(s: String) = s.length == 42 && s.startsWith("0x") && s.drop(2).all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }
}

class ChainException(message: String) : Exception("Robinhood Chain RPC: $message")

/** Minimal JSON-RPC client; mirrors the website's viem reads. */
object ChainClient {
    private val client = HttpClient(Android) { install(HttpTimeout) { requestTimeoutMillis = 12_000 } }
    private val json = CasepadApi.json

    private suspend fun call(method: String, params: JsonArray): JsonElement {
        val body = buildJsonObject { put("jsonrpc", "2.0"); put("id", 1); put("method", method); put("params", params) }
        val text = client.post(Chain.RPC) { contentType(ContentType.Application.Json); setBody(body.toString()) }.bodyAsText()
        val obj = json.parseToJsonElement(text).jsonObject
        obj["error"]?.let { if (it !is JsonNull) throw ChainException(it.jsonObject["message"]?.jsonPrimitive?.content ?: "error") }
        return obj["result"] ?: throw ChainException("empty result")
    }

    private fun hexToBig(hex: String): BigInteger {
        val h = hex.removePrefix("0x").removePrefix("0X")
        return if (h.isEmpty()) BigInteger.ZERO else BigInteger(h, 16)
    }
    fun hexToDouble(hex: String, decimals: Int = 18): Double =
        BigDecimal(hexToBig(hex)).movePointLeft(decimals).toDouble()

    suspend fun blockNumber(): Int = hexToBig(call("eth_blockNumber", JsonArray(emptyList())).jsonPrimitive.content).toInt()
    suspend fun chainId(): Int = hexToBig(call("eth_chainId", JsonArray(emptyList())).jsonPrimitive.content).toInt()

    private suspend fun ethCall(to: String, data: String): String =
        call("eth_call", JsonArray(listOf(buildJsonObject { put("to", to); put("data", data) }, JsonPrimitive("latest")))).jsonPrimitive.content

    suspend fun ethBalance(address: String): Double =
        hexToDouble(call("eth_getBalance", JsonArray(listOf(JsonPrimitive(address), JsonPrimitive("latest")))).jsonPrimitive.content)

    suspend fun tokenBalance(token: String, owner: String): Double =
        hexToDouble(ethCall(token, Chain.Selector.BALANCE_OF + "0".repeat(24) + owner.lowercase().removePrefix("0x")))

    /** Website `readCurveState`, including the phantom-reserve fix. */
    suspend fun curveState(curve: String): CurveState = coroutineScope {
        val q = async { hexToDouble(ethCall(curve, Chain.Selector.QUOTE_RESERVE)) }
        val r = async { hexToDouble(ethCall(curve, Chain.Selector.TOKEN_RESERVE)) }
        val p = async { hexToDouble(ethCall(curve, Chain.Selector.PHANTOM_QUOTE)) }
        val g = async { hexToDouble(ethCall(curve, Chain.Selector.GRADUATION_THRESHOLD)) }
        val grad = async { hexToBig(ethCall(curve, Chain.Selector.GRADUATED)) > BigInteger.ZERO }
        val tax = async { hexToBig(ethCall(curve, Chain.Selector.CREATOR_TAX_BPS)).toInt() }
        val quote = q.await(); val reserve = r.await(); val phantom = p.await(); val threshold = g.await(); val graduated = grad.await()
        val virtual = if (quote >= phantom) quote else quote + phantom
        val real = maxOf(0.0, virtual - phantom)
        val price = if (reserve > 0) virtual / reserve else 0.0
        CurveState(
            quoteReserve = quote, tokenReserve = reserve, phantomQuote = phantom, graduationThreshold = threshold, graduated = graduated,
            creatorTaxBps = tax.await(), priceEth = price, mcapEth = price * Chain.TOTAL_SUPPLY, reserveEth = real,
            sold = maxOf(0.0, Chain.TOTAL_SUPPLY - reserve), progress = if (graduated) 1.0 else if (threshold > 0) minOf(1.0, real / threshold) else 0.0,
        )
    }

    /** Website `readCurveHistory`: CurveBuy/CurveSell logs since launch with block timestamps. */
    suspend fun curveHistory(curve: String, fromBlock: Int): List<CurveTrade> = coroutineScope {
        val latest = blockNumber()
        val window = 50_000
        var start = if (fromBlock > 0) fromBlock else maxOf(0, latest - window * 4)
        val logs = mutableListOf<JsonObject>()
        var windows = 0
        while (start <= latest && windows < 40) {
            val to = minOf(latest, start + window)
            val filter = buildJsonObject { put("address", curve); put("fromBlock", "0x" + start.toString(16)); put("toBlock", "0x" + to.toString(16)) }
            logs += call("eth_getLogs", JsonArray(listOf(filter))).jsonArray.map { it.jsonObject }
            start = to + 1; windows++
        }
        val raw = logs.mapNotNull { log ->
            val topics = log["topics"]?.jsonArray?.map { it.jsonPrimitive.content.lowercase() } ?: return@mapNotNull null
            val topic = topics.firstOrNull() ?: return@mapNotNull null
            if (topic != Chain.CURVE_BUY_TOPIC && topic != Chain.CURVE_SELL_TOPIC) return@mapNotNull null
            val data = log["data"]!!.jsonPrimitive.content.removePrefix("0x")
            if (data.length < 256) return@mapNotNull null
            val words = data.chunked(64).map { "0x$it" }
            val isBuy = topic == Chain.CURVE_BUY_TOPIC
            val a = hexToDouble(words[0]); val b = hexToDouble(words[1]); val fee = hexToDouble(words[3])
            CurveTrade(
                txHash = log["transactionHash"]!!.jsonPrimitive.content, logIndex = hexToBig(log["logIndex"]!!.jsonPrimitive.content).toInt(),
                blockNumber = hexToBig(log["blockNumber"]!!.jsonPrimitive.content).toInt(), isBuy = isBuy,
                sender = if (topics.size > 1) "0x" + topics[1].takeLast(40) else "",
                eth = if (isBuy) a else b, tokens = if (isBuy) b else a, creatorFeeEth = fee, timestamp = 0L,
            )
        }
        val blocks = raw.map { it.blockNumber }.distinct().sorted().takeLast(120)
        val stamps = blocks.map { bn ->
            async {
                val block = runCatching { call("eth_getBlockByNumber", JsonArray(listOf(JsonPrimitive("0x" + bn.toString(16)), JsonPrimitive(false)))) }.getOrNull()
                val ts = (block as? JsonObject)?.get("timestamp")?.jsonPrimitive?.content
                bn to ts?.let { hexToBig(it).toLong() * 1000 }
            }
        }.map { it.await() }.filter { it.second != null }.associate { it.first to it.second!! }
        val now = System.currentTimeMillis()
        raw.map { it.copy(timestamp = stamps[it.blockNumber] ?: now) }.sortedBy { it.timestamp }
    }
}
