package com.objectpad.app.data

import kotlinx.serialization.Serializable

/** Public DTOs mirrored from `web-handlesend/src/shared/domain.ts`. Every field is defaulted so new server fields never break parsing. */
@Serializable
data class ObjectCoin(
    val kind: String = "creator", val id: String = "", val token: String = "", val curve: String = "",
    val symbol: String = "", val name: String = "", val logo: String = "", val path: String = "",
    val tag: String? = null, val objectName: String? = null, val priceEth: Double = 0.0, val marketCapEth: Double = 0.0,
    val change24h: Double = 0.0, val volume24hEth: Double = 0.0, val volumeEth: Double = 0.0, val trades24h: Int = 0,
    val buys24h: Int = 0, val sells24h: Int = 0, val trades: Int = 0, val holders: Int = 0, val progress: Double = 0.0,
    val graduated: Boolean = false, val spark: List<Double> = emptyList(), val lastTradeAt: Long? = null,
    val launchHash: String? = null, val launchedAt: Long = 0, val trending: Double = 0.0, val state: String = "live",
    val pair: CoinPair? = null,
)

/** What a coin trades against (a Pons V2 quote asset). null = ETH. */
@Serializable
data class CoinPair(
    val address: String = "", val symbol: String = "", val name: String = "", val kind: String = "", val sector: String? = null,
    val logo: String = "", val priceEth: Double? = null, val priceUsd: Double? = null, val change24h: Double? = null,
)
/** The AI's recommended pair for a scanned object (a one-tap suggestion; ETH stays the default). */
@Serializable data class PairSuggestion(val symbol: String = "", val address: String = "", val name: String = "", val reason: String = "")
@Serializable data class PairRoute(val tokens: List<String> = emptyList(), val fees: List<Int> = emptyList())
@Serializable
data class PairQuote(
    val address: String = "", val symbol: String = "", val name: String = "", val kind: String = "", val decimals: Int = 18,
    val sector: String? = null, val logo: String = "", val approved: Boolean = false, val priceEth: Double? = null,
    val priceUsd: Double? = null, val change24h: Double? = null, val coins: Int = 0, val route: PairRoute? = null,
) { val isEth: Boolean get() = kind == "native" }
@Serializable data class PairRouter(val swapRouter: String = "", val quoter: String = "", val weth: String = "")
@Serializable data class PairBoard(val ethUsd: Double? = null, val assets: List<PairQuote> = emptyList(), val router: PairRouter? = null)

object PairCatalog {
    const val ETH = "0x0000000000000000000000000000000000000000"
    val popular = listOf("ETH", "NVDA", "TSLA", "AAPL", "SPCX", "GME", "COIN", "MSTR", "PLTR", "SPY", "QQQ", "GLD", "AMZN", "META", "GOOGL", "RBLX", "NFLX", "USDG", "cbBTC")
    val kinds = listOf("popular" to "Popular", "stock" to "Stocks", "etf" to "ETFs", "commodity" to "Commodities", "crypto" to "Crypto", "stable" to "Stable", "community" to "Community", "all" to "All")
    fun isEth(a: String?): Boolean = a.isNullOrBlank() || a.equals(ETH, true)
}

@Serializable
data class CoinTrade(
    val id: String = "", val curve: String = "", val side: String = "buy", val eth: Double = 0.0, val tokens: Double = 0.0,
    val price: Double = 0.0, val trader: String = "", val hash: String = "", val block: Long = 0, val at: Long = 0,
)

@Serializable data class CoinsFeed(val items: List<ObjectCoin> = emptyList(), val recent: List<CoinTrade> = emptyList(), val updatedAt: Long = 0)
@Serializable data class CurveTrades(val trades: List<CoinTrade> = emptyList(), val fromBlock: Long = 0, val toBlock: Long = 0)
@Serializable data class CoinHolder(val address: String = "", val balance: Double = 0.0, val share: Double = 0.0, val since: Long = 0, val label: String? = null)
@Serializable data class HoldersFeed(val count: Int = 0, val holders: List<CoinHolder> = emptyList())

@Serializable
data class MarketCoin(
    val token: String = "", val curve: String = "", val symbol: String = "", val name: String = "", val priceEth: Double = 0.0,
    val changePct: Double = 0.0, val volumeEth: Double = 0.0, val trades: Int = 0, val buys: Int = 0, val sells: Int = 0,
    val objectId: String? = null, val logo: String? = null,
)

@Serializable
data class MarketTrade(
    val id: String = "", val token: String = "", val symbol: String = "", val side: String = "buy", val eth: Double = 0.0,
    val tokens: Double = 0.0, val trader: String = "", val hash: String = "", val block: Long = 0, val at: Long = 0,
    val objectId: String? = null, val logo: String? = null,
)

@Serializable data class MarketTotals(val trades: Int = 0, val volumeEth: Double = 0.0, val coins: Int = 0, val buys: Int = 0, val sells: Int = 0, val creatorFeesEth: Double? = null, val protocolFeesEth: Double? = null)
@Serializable data class PadCounts(val launched: Int = 0, val scanned: Int = 0)
@Serializable
data class MarketSnapshot(
    val updatedAt: Long = 0, val windowSeconds: Int = 0, val ethUsd: Double? = null, val coins: List<MarketCoin> = emptyList(),
    val trades: List<MarketTrade> = emptyList(), val totals: MarketTotals = MarketTotals(), val objectpad: PadCounts = PadCounts(),
)

@Serializable data class ReadinessCheck(val id: String = "", val label: String = "", val ready: Boolean = false)
@Serializable
data class SponsorStatus(
    val address: String = "", val balanceWei: String = "0", val launchCostWei: String = "0", val launchesAffordable: Int = 0,
    val dailyLimit: Int = 0, val usedToday: Int = 0, val perPersonDaily: Int? = null,
)
@Serializable data class Contracts(val registry: String? = null, val vaultFactory: String? = null, val forge: String? = null, val burnEngine: String? = null, val token: String? = null)
@Serializable
data class Readiness(
    val mode: String = "operator_blocked", val blocker: String = "", val checks: List<ReadinessCheck> = emptyList(),
    val chainId: Int = 4663, val contracts: Contracts? = null, val sponsor: SponsorStatus? = null,
)

@Serializable data class BurnCoinShare(val symbol: String = "", val name: String = "", val share: Double = 0.0)
@Serializable data class BurnEntry(val id: String = "", val at: Long = 0, val ethIn: String = "0", val tokensBurned: String = "0", val hash: String? = null, val state: String = "submitted", val coins: List<BurnCoinShare> = emptyList())
@Serializable
data class BurnFeed(
    val live: Boolean = false, val token: String? = null, val intervalSec: Int = 300, val nextAt: Long? = null, val totalEth: String = "0",
    val totalTokens: String = "0", val burns: Int = 0, val pendingEth: String = "0", val items: List<BurnEntry> = emptyList(),
)

@Serializable data class BuildingCoin(val code: String = "", val name: String = "", val symbol: String = "", val state: String = "building", val progress: Double = 0.0, val stage: String = "", val queuedAt: Long = 0, val startedAt: Long? = null)
@Serializable data class BuildingFeed(val items: List<BuildingCoin> = emptyList())

@Serializable data class ViewQuality(val blur: Double = 0.0, val exposure: Double = 0.0, val centered: Boolean = true)
@Serializable data class CaptureView(val id: String = "", val view: String = "", val hash: String = "", val width: Int = 0, val height: Int = 0, val bytes: Long = 0, val acceptedAt: Long = 0)
@Serializable data class ObjectSuggestion(val `object`: String = "", val name: String = "", val ticker: String = "", val story: String = "", val compared: Int = 0, val catalog: String? = null, val colors: List<String> = emptyList(), val materials: List<String> = emptyList(), val pair: PairSuggestion? = null)
@Serializable data class LaunchDraft(val publicName: String = "", val symbol: String = "", val story: String = "", val xUrl: String = "", val telegram: String? = null, val feeWallet: String? = null, val pairToken: String? = null)
@Serializable data class EngineJob(val state: String = "", val progress: Double = 0.0, val failureCode: String? = null, val startedAt: Long? = null, val queue: Int? = null, val model: String? = null, val images: Int? = null, val providerStatus: String? = null)
@Serializable
data class ModelArtifact(
    val originalHash: String = "", val optimizedHash: String = "", val thumbnailHash: String = "", val modelUrl: String = "",
    val thumbnailUrl: String = "", val bytes: Long = 0, val triangles: Int = 0, val textures: Int = 0, val processedViews: Int = 0,
    val validated: Boolean = false, val providerModel: String = "",
)
@Serializable
data class SessionLaunch(
    val recordId: String = "", val recordState: String = "", val state: String = "", val hash: String? = null, val token: String? = null,
    val objectName: String? = null, val objectTag: String? = null, val feeWallet: String? = null, val feeRecipientKind: String = "creator",
)
@Serializable data class CoinIconInfo(val hash: String = "", val url: String = "", val source: String = "snapshot", val modelHash: String? = null, val setAt: Long = 0)
@Serializable data class OnchainPreview(val objectName: String = "", val objectTag: String = "", val specs: String? = null)
@Serializable data class RemovedView(val view: String = "", val at: Long = 0)
@Serializable data class IncomingShot(val view: String = "", val at: Long = 0)

@Serializable
data class CaptureSession(
    val id: String = "", val state: String = "awaiting_mobile", val createdAt: Long = 0, val expiresAt: Long = 0,
    val views: List<CaptureView> = emptyList(), val job: EngineJob? = null, val model: ModelArtifact? = null,
    val failureCode: String? = null, val suggestion: ObjectSuggestion? = null, val recordId: String? = null,
    val launchDraft: LaunchDraft? = null, val autoLaunch: Boolean? = null, val objectId: String? = null, val coinUrl: String? = null,
    val deviceConnected: Boolean? = null, val regenerations: Int? = null, val failureRetries: Int? = null, val guest: Boolean? = null,
    val onchain: OnchainPreview? = null, val launch: SessionLaunch? = null, val incoming: List<IncomingShot> = emptyList(),
    val successor: String? = null, val removed: List<RemovedView> = emptyList(), val launchQueuedAt: Long? = null, val icon: CoinIconInfo? = null,
)

@Serializable data class SessionCreated(val session: CaptureSession = CaptureSession(), val handoffUrl: String? = null)
@Serializable data class SessionClaimed(val session: CaptureSession = CaptureSession(), val claimSecret: String = "")
@Serializable data class UploadTicket(val url: String = "", val token: String = "", val expiresAt: Long = 0)
@Serializable data class LaunchResult(val state: String = "", val hash: String? = null, val session: CaptureSession = CaptureSession())
@Serializable data class SessionWrap(val session: CaptureSession = CaptureSession())
@Serializable data class SessionList(val items: List<CaptureSession> = emptyList())
@Serializable data class GuestToken(val token: String = "")

@Serializable data class RecordModel(val modelUrl: String = "", val thumbnailUrl: String = "", val triangles: Int = 0, val textures: Int = 0, val bytes: Long = 0)
@Serializable data class Uniqueness(val checkedAt: Long = 0, val compared: Int = 0, val model: String = "")
@Serializable
data class ObjectRecord(
    val objectId: String = "", val publicName: String = "", val verifiedName: String = "", val symbol: String = "", val story: String = "",
    val category: String = "", val xUrl: String = "", val telegram: String? = null, val canonicalUrl: String = "",
    val tokenAddress: String = "", val curveAddress: String = "", val launchTransactionHash: String = "", val objectName: String? = null,
    val objectTag: String? = null, val objectSpecs: String? = null, val createdAt: Long = 0, val confirmedAt: Long? = null,
    val model: RecordModel = RecordModel(), val iconUrl: String? = null, val feeVault: String? = null, val launchMode: String? = null,
    val sponsor: String? = null, val acceptedViewCount: Int = 0, val captureManifestHash: String = "", val originalModelHash: String = "",
    val uniqueness: Uniqueness? = null, val creatorWallet: String = "", val status: String = "confirmed", val launchDataSuffix: String? = null,
    val pairToken: String? = null,
)
@Serializable data class PublicFeed(val items: List<ObjectRecord> = emptyList(), val nextCursor: String? = null)

@Serializable data class Profile(val publicId: String = "", val alias: String = "", val wallet: String? = null, val rightsAccepted: Boolean = false)
@Serializable data class CreatorArchive(val alias: String = "", val objects: List<ObjectRecord> = emptyList())
@Serializable data class CommunityMessage(val id: String = "", val creatorId: String = "", val alias: String = "", val text: String = "", val createdAt: Long = 0)
@Serializable data class MessagesFeed(val items: List<CommunityMessage> = emptyList())
@Serializable data class Adopted(val adopted: Int = 0)

/** Where a capture session sits in its lifecycle, derived exactly like the website's studio. */
val CaptureSession.isCapturing: Boolean get() = state in setOf("awaiting_mobile", "capturing") || (state == "review" && views.size < 6)
val CaptureSession.isBuilding: Boolean get() = state in setOf("screening", "reconstructing", "validating") || (state == "review" && views.size >= 6 && failureCode == null)
val CaptureSession.isModelReady: Boolean get() = state in setOf("model_review", "approved") && model != null
val CaptureSession.isTerminal: Boolean get() = state in setOf("blocked", "cancelled", "expired")
