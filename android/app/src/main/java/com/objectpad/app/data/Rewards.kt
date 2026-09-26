package com.objectpad.app.data

import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.log10
import kotlin.math.max

/** Paid Rewards DTOs, mirrored from `web-handlesend/src/lib/rewards.ts`. */
@Serializable data class RewardPoster(val handle: String = "", val name: String = "", val avatar: String = "", val wallet: String = "")
@Serializable data class RewardAudit(val event: String = "", val detail: String = "", val tx: String? = null, val at: Long = 0)
@Serializable
data class RewardProof(
    val id: String = "", val rewardId: String = "", val photo: String = "", val token: String? = null, val coinName: String = "", val coinSymbol: String = "",
    val coinImage: String = "", val note: String = "", val state: String = "submitted", val reviewNote: String = "", val payoutTx: String? = null,
    val handle: String = "", val name: String = "", val avatar: String = "", val wallet: String = "", val mine: Boolean = false, val createdAt: Long = 0,
)
@Serializable data class RewardWinner(val handle: String? = null, val avatar: String = "", val coinName: String = "", val coinUrl: String = "", val token: String = "", val creatorWallet: String = "", val paid: Boolean = false)
@Serializable
data class Reward(
    val id: String = "", val kind: String = "community", val title: String = "", val `object`: String = "", val tagline: String = "", val rules: List<String> = emptyList(),
    val category: String = "find", val adult: Boolean = false, val rewardUsd: Double = 0.0, val rewardEth: Double? = null, val rewardWei: String? = null,
    val image: String = "", val coverState: String? = null, val promoUrl: String? = null, val status: String = "open", val deadline: Long? = null,
    val poster: RewardPoster = RewardPoster(), val fundTx: String? = null, val refundTx: String? = null, val payoutTx: String? = null,
    val escrow: String? = null, val mine: Boolean = false, val postedAt: String = "", val createdAt: Long = 0,
    val submissions: List<RewardProof> = emptyList(), val audit: List<RewardAudit> = emptyList(), val winner: RewardWinner? = null,
)
@Serializable data class RewardStats(val openUsd: Double = 0.0, val paidUsd: Double = 0.0, val open: Int = 0, val paid: Int = 0, val hunters: Int = 0, val proofs: Int = 0, val escrowEth: Double = 0.0)
@Serializable data class RewardBoard(val bounties: List<Reward> = emptyList(), val stats: RewardStats = RewardStats(), val escrow: String = "", val operator: Boolean = false)
@Serializable data class RewardPhoto(val hash: String = "", val url: String = "")

enum class RewardSort(val label: String) { Best("Best right now"), Ending("Ending soon"), Biggest("Biggest"), Newest("Newest") }

/** Same opportunity score as the website: money, urgency, freshness and recent hunter activity. */
fun Reward.opportunity(now: Long): Double {
    if (status != "open") return -1.0
    val left = deadline?.let { it - now }; if (left != null && left <= 0) return -1.0
    val day = 86_400_000L
    val money = log10(max(5.0, rewardUsd)) * 40
    val urgency = when { left == null -> 6.0; left < day -> 34.0; left < 3 * day -> 22.0; left < 7 * day -> 12.0; else -> 4.0 }
    val fresh = max(0.0, 14 - (now - createdAt).toDouble() / day) * 1.4
    val recent = submissions.count { now - it.createdAt < 3 * day }.coerceAtMost(8) * 2.5
    return money + urgency + fresh + recent
}

fun List<Reward>.sortedBy(sort: RewardSort, now: Long): List<Reward> {
    fun dl(r: Reward) = r.deadline?.takeIf { it > now } ?: Long.MAX_VALUE
    return sortedWith(compareByDescending<Reward> { it.status == "open" }.thenComparator { a, b ->
        when (sort) {
            RewardSort.Best -> b.opportunity(now).compareTo(a.opportunity(now))
            RewardSort.Ending -> dl(a).compareTo(dl(b))
            RewardSort.Biggest -> b.rewardUsd.compareTo(a.rewardUsd)
            RewardSort.Newest -> b.createdAt.compareTo(a.createdAt)
        }
    }.thenByDescending { it.rewardUsd })
}

/** Countdown label and tier (urgent < 24h, soon < 3d). */
data class Countdown(val label: String, val tier: String)
fun countdown(deadline: Long?, now: Long): Countdown {
    if (deadline == null || deadline == 0L) return Countdown("Until won", "none")
    val ms = deadline - now; if (ms <= 0) return Countdown("Ended", "ended")
    val d = ms / 86_400_000; val h = (ms % 86_400_000) / 3_600_000; val m = (ms % 3_600_000) / 60_000; val s = (ms % 60_000) / 1000
    val label = if (d >= 1) "%dd %02dh %02dm".format(d, h, m) else "%02d:%02d:%02d".format(h, m, s)
    return Countdown(label, if (ms < 86_400_000) "urgent" else if (ms < 3 * 86_400_000L) "soon" else "calm")
}

private val REWARD_ERRORS = mapOf(
    "REWARD_OBJECT_INVALID" to "Name the object in 2–60 characters.", "REWARD_BRIEF_INVALID" to "Describe the ask in 10–280 characters.",
    "REWARD_AMOUNT_INVALID" to "Rewards are \$5 to \$10,000.", "REWARD_LINK_INVALID" to "That link isn’t a valid https:// URL.",
    "ETH_PRICE_UNAVAILABLE" to "Live ETH price is unavailable right now. Try again in a minute.", "REWARD_PHOTO_MISSING" to "Upload the photo again.",
    "TX_NOT_FOUND" to "That transaction isn’t on Robinhood Chain yet. Wait a few seconds and retry.", "TX_AMOUNT_LOW" to "That deposit is less than the reward amount.",
    "TX_WRONG_RECIPIENT" to "That transaction didn’t go to the Rewards escrow.", "REWARD_NOT_OPEN" to "This bounty isn’t open.", "COVER_BUSY" to "The AI is still painting. Give it a minute.",
    "REWARD_OWN_BOUNTY" to "You can’t claim your own bounty.", "REWARD_EXPIRED" to "This bounty has ended.", "REWARD_PROOF_REQUIRED" to "Add a photo of the object, or the coin you launched for it.",
    "REWARD_TOO_MANY" to "You already have 3 proofs waiting on this bounty.", "BOUNTY_CLOSED" to "This bounty already has a winner.", "REWARD_HAS_PENDING" to "Proofs are waiting. Pick a winner or reject them first.",
    "REVIEW_REASON_REQUIRED" to "Add a short public reason.", "WALLET_REQUIRED" to "Your account needs a wallet to get paid.", "SIGN_IN_REQUIRED" to "Sign in first.",
    "ICON_INVALID" to "That photo is too small or oddly shaped.", "UNSUPPORTED_IMAGE" to "Use a JPG or PNG photo.", "FORBIDDEN" to "Only the poster or ObjectPad can do that.",
)
fun rewardError(e: Throwable): String = (e as? ApiException)?.let { REWARD_ERRORS[it.code] ?: it.message } ?: e.message ?: "Something went wrong. Try again."

/** Paid Rewards API. Reads work signed out; every write needs a signed-in account (never the guest token). */
class RewardsApi(private val account: AccountManager) {
    private suspend fun token(required: Boolean = true): String? = account.accountToken() ?: if (required) throw ApiException("SIGN_IN_REQUIRED", 401, "Sign in first.") else null
    suspend fun board(): RewardBoard = ObjectPadApi.get("/rewards", token = token(false))
    suspend fun detail(id: String): Reward = ObjectPadApi.get("/rewards/$id", token = token(false))
    suspend fun upload(jpeg: ByteArray): RewardPhoto = ObjectPadApi.decode(ObjectPadApi.raw("/rewards/photos", HttpMethod.Put, token(), bytes = jpeg, bytesType = ContentType.Image.JPEG, timeoutMs = 60_000))
    suspend fun create(obj: String, brief: String, category: String, usd: Int, days: Int, promo: String, adult: Boolean, rules: List<String>, cover: String, inspire: String): Reward =
        ObjectPadApi.send("/rewards", body = buildJsonObject {
            put("object", obj); put("title", "First $obj scan"); put("brief", brief); put("category", category); put("rewardUsd", usd); put("days", days)
            put("promoUrl", promo); put("adult", adult); put("rules", JsonArray(rules.map { JsonPrimitive(it) })); put("cover", cover); put("inspire", inspire)
        }, token = token(), timeoutMs = 30_000)
    suspend fun cover(id: String, mode: String, photo: String): Reward = ObjectPadApi.send("/rewards/$id/cover", body = buildJsonObject { put("mode", mode); put("photo", photo) }, token = token())
    suspend fun fund(id: String, hash: String): Reward = ObjectPadApi.send("/rewards/$id/fund", body = buildJsonObject { put("hash", hash) }, token = token(), timeoutMs = 45_000)
    suspend fun cancel(id: String): Reward = ObjectPadApi.send("/rewards/$id/cancel", body = buildJsonObject { put("reason", "") }, token = token(), timeoutMs = 60_000)
    suspend fun submit(id: String, photo: String, coin: String, note: String): RewardProof = ObjectPadApi.send("/rewards/$id/submissions", body = buildJsonObject { put("photo", photo); put("coin", coin); put("note", note) }, token = token())
    suspend fun payout(subId: String): Reward = ObjectPadApi.send("/rewards/submissions/$subId/payout", token = token(), timeoutMs = 60_000)
    suspend fun reject(subId: String, note: String): Reward = ObjectPadApi.send("/rewards/submissions/$subId/review", body = buildJsonObject { put("state", "rejected"); put("note", note); put("tx", "") }, token = token())
}
