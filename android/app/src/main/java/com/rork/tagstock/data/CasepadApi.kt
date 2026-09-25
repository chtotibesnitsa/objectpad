package com.rork.tagstock.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class ApiException(val status: Int, message: String) : Exception(message)

/** Read-only client for the CasePad backend, same base URL/paths as the website. */
object CasepadApi {
    const val BASE = "https://casepad-backend.rork.app/api/crates"
    const val SITE = "https://casepad.fun"

    val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

    private val client = HttpClient(Android) {
        install(ContentNegotiation) { json(this@CasepadApi.json) }
        install(HttpTimeout) { requestTimeoutMillis = 15_000; connectTimeoutMillis = 8_000 }
    }

    @Serializable private data class ErrorEnvelope(val error: String? = null)

    private suspend inline fun <reified T> get(path: String, token: String? = null): T {
        val response: HttpResponse = try {
            client.get("$BASE$path") {
                header("X-Client", "casepad-android/1.0")
                if (token != null) header("Authorization", "Bearer $token")
            }
        } catch (e: Exception) {
            throw ApiException(0, "No connection. Check your network and try again.")
        }
        val text = response.bodyAsText()
        val err = runCatching { json.decodeFromString<ErrorEnvelope>(text) }.getOrNull()?.error
        if (err != null) throw ApiException(response.status.value, err)
        if (response.status.value !in 200..299) throw ApiException(response.status.value, "Request failed (${response.status.value})")
        return try { json.decodeFromString<T>(text) } catch (e: Exception) {
            throw ApiException(response.status.value, "Unexpected response: ${e.message?.take(120)}")
        }
    }

    @Serializable private data class TickerR(val items: List<TickerItem>)
    @Serializable private data class RoundsR(val rounds: List<Round>)
    @Serializable private data class ActivityR(val items: List<ActivityItem>)
    @Serializable private data class QuestsR(val quests: List<Quest>)
    @Serializable private data class BattlesR(val battles: List<Battle>)
    @Serializable data class PnlR(val leaderboard: List<PnlRow>, val note: String = "")
    @Serializable data class LeaderR(val leaderboard: List<LeaderboardRow>, val scoring: String = "")
    @Serializable private data class PriceR(val price: Double)
    @Serializable private data class TokensR(val tokens: List<Coin>)

    suspend fun terminal(): Terminal = get("/terminal")
    suspend fun status(): PlatformStatus = get("/status")
    suspend fun platform(): PlatformConfig = get("/platform")
    suspend fun ticker(): List<TickerItem> = get<TickerR>("/ticker").items
    suspend fun openCases(): OpenCasesFeed = get("/cases")
    suspend fun token(address: String): TokenDetail = get("/tokens/$address")
    suspend fun inventory(address: String): Inventory = get("/tokens/$address/inventory")
    suspend fun caseDesigns(address: String): CaseDesigns = get("/tokens/$address/case-designs")
    suspend fun liveRounds(address: String): List<Round> = get<RoundsR>("/tokens/$address/live-rounds").rounds
    suspend fun transactions(): TransactionsFeed = get("/transactions")
    suspend fun activity(): List<ActivityItem> = get<ActivityR>("/activity").items
    suspend fun quests(): List<Quest> = get<QuestsR>("/quests").quests
    suspend fun battles(): List<Battle> = get<BattlesR>("/battles").battles
    suspend fun pnlBoard(): PnlR = get("/pnl")
    suspend fun leaderboard(): LeaderR = get("/leaderboard")
    suspend fun burns(): BurnFeed = get("/burns")
    suspend fun ethPrice(): Double = get<PriceR>("/eth-price").price
    suspend fun searchTokens(q: String): List<TokenBrief> = get<TokensR>("/tokens?q=${java.net.URLEncoder.encode(q, "UTF-8")}").tokens.map { it.brief }
}
