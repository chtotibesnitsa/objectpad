package com.rork.tagstock.data

import kotlinx.serialization.Serializable

// Typed mirrors of the CasePad backend JSON (`/api/crates/*`). Names match the
// website's `crates-api.ts` / `casepad-api.ts`. Amounts stay as decimal strings.

@Serializable data class TokenBrief(val token: String, val name: String, val ticker: String, val image: String = "", val mode: String = "real")

@Serializable data class VaultNumbers(
    val accruedWei: String = "0", val settledWei: String = "0", val committedWei: String = "0", val claimableWei: String = "0",
    val paidWei: String = "0", val freeWei: String = "0", val invariantOk: Boolean = true, val rounds: Int = 0, val activeRounds: Int = 0,
)

@Serializable data class Reference(val symbol: String, val name: String = "")

@Serializable data class MarketSnapshot(
    val priceWei: String, val marketCapWei: String, val reserveWei: String, val progressBps: Int, val block: String,
    val observedAt: Long, val graduated: Boolean, val priceUsd: Double? = null, val marketCapUsd: Double? = null,
    val changeBps: Int? = null, val changeSince: Long? = null, val stale: Boolean = false, val volumeWei: String = "0", val volumeLabel: String = "",
)

@Serializable data class Coin(
    val token: String, val curve: String, val txHash: String = "", val blockNumber: Int = 0, val name: String, val ticker: String,
    val description: String = "", val image: String = "", val website: String = "", val reference: Reference? = null,
    val creatorAddress: String = "", val creatorDid: String = "", val feeRecipient: String = "", val creatorTaxBps: Int = 150,
    val mode: String = "real", val createdAt: Long = 0, val vault: VaultNumbers = VaultNumbers(), val market: MarketSnapshot? = null,
) {
    val isReal: Boolean get() = mode == "real"
    val brief: TokenBrief get() = TokenBrief(token, name, ticker, image, mode)
}

@Serializable data class FeeConfig(
    val protocolBps: Int, val totalBps: Int? = null, val devBps: Int? = null, val rewardBps: Int, val ecosystemBuybackBps: Int,
    val creatorRetainedBps: Int, val basis: String = "", val buybackIntervalMs: Long? = null,
)
@Serializable data class BuybackConfig(val status: String, val target: String? = null, val reason: String = "", val nextCycleAt: Long? = null)
@Serializable data class ReadinessCheck(val id: String, val ok: Boolean, val detail: String)
@Serializable data class Readiness(val ok: Boolean, val checks: List<ReadinessCheck> = emptyList(), val live: Boolean? = null)
@Serializable data class PlatformConfig(
    val name: String, val ecosystemToken: String? = null, val xUrl: String? = null, val chainId: Int, val fees: FeeConfig,
    val tokenRewards: String, val marketplace: String, val readiness: Readiness, val buyback: BuybackConfig, val blockers: List<String> = emptyList(),
)
@Serializable data class Terminal(val coins: List<Coin>, val platform: PlatformConfig, val observedAt: Long, val chainBlock: String? = null, val source: String = "")

@Serializable data class ChainInfo(val id: Int, val name: String, val explorer: String)
@Serializable data class Contribution(val bps: Int, val devBps: Int? = null, val cratesBps: Int, val buybackBps: Int, val protocolBps: Int)
@Serializable data class Randomness(val method: String, val provablyFair: Boolean, val note: String)
@Serializable data class PlatformStatus(
    val name: String, val chain: ChainInfo, val feeRouting: String, val payouts: String, val realValue: String, val randomness: Randomness,
    val paused: Boolean, val maintenance: Boolean, val contribution: Contribution, val burnAddress: String, val now: Long,
)

@Serializable data class PublicUser(val did: String, val handle: String, val name: String = "", val avatar: String = "", val wallet: String? = null, val hideAmounts: Boolean? = null)

@Serializable data class TickerPayload(
    val notionalWei: String? = null, val amountWei: String? = null, val txHash: String? = null, val blockNumber: Int? = null,
    val label: String? = null, val name: String? = null, val ticker: String? = null,
)
@Serializable data class TickerItem(
    val id: String, val kind: String, val token: String, val tokenInfo: TokenBrief? = null, val payload: TickerPayload = TickerPayload(),
    val user: PublicUser? = null, val txHash: String? = null, val createdAt: Long,
) {
    val label: String get() = when (kind) {
        "token.launched" -> "LAUNCH"; "trade.buy" -> "BUY"; "trade.sell" -> "SELL"; "creator.buy" -> "DEV BUY"; "creator.sell" -> "DEV SELL"
        "payout.confirmed" -> "PAYOUT"; "vault.funded" -> "FUNDING"; "buyback.confirmed" -> "BUYBACK"; else -> kind.uppercase()
    }
    val isSell: Boolean get() = kind.contains("sell")
    val amountWei: String? get() = payload.amountWei ?: payload.notionalWei
}

@Serializable data class RemainingPrize(val rarity: String, val label: String, val visual: String, val amountWei: String, val count: Int)
@Serializable data class Round(
    val id: String, val token: String, val crateId: String = "", val crateName: String, val mode: String, val state: String, val entries: Int,
    val reserved: Int = 0, val opened: Int = 0, val available: Int, val committedWei: String = "0", val asset: String? = null,
    val entryUnits: String? = null, val designId: String? = null, val seedCommit: String = "", val seedRevealed: String? = null,
    val createdAt: Long, val expiresAt: Long = 0, val closedAt: Long? = null, val remainingPrizes: List<RemainingPrize> = emptyList(), val tokenInfo: TokenBrief? = null,
)
@Serializable data class OpenCaseMarket(val volumeWei: String = "0", val burns: Int = 0, val burnedUnits: String = "0", val priceWei: String? = null, val stale: Boolean = false)
@Serializable data class OpenCase(val round: Round, val token: TokenBrief? = null, val market: OpenCaseMarket = OpenCaseMarket(), val opened: Int = 0, val bestPrizeUnits: String = "0")
@Serializable data class OpenCasesFeed(val cases: List<OpenCase>, val live: Boolean, val burnAddress: String = "", val observedAt: Long = 0)

@Serializable data class CaseOutcome(val visual: String, val label: String, val count: Int, val units: String)
@Serializable data class CaseDesign(
    val id: String, val provenance: String, val name: String, val entryUnits: String, val outcomes: List<CaseOutcome>, val entries: Int,
    val committedUnits: String = "0", val expectedUnits: String = "0", val returnBps: String = "0", val profitProbabilityBps: Int = 0,
    val zeroProbabilityBps: Int = 0, val warnings: List<String> = emptyList(),
)
@Serializable data class CaseDesigns(val token: String, val state: String = "", val platform: List<CaseDesign> = emptyList(), val creator: List<CaseDesign> = emptyList(), val note: String = "")

@Serializable data class EventPayload(val txHash: String? = null, val notionalWei: String? = null, val amountWei: String? = null, val blockNumber: Int? = null)
@Serializable data class TokenEvent(val id: String, val kind: String, val payload: EventPayload = EventPayload(), val createdAt: Long)
@Serializable data class Milestone(val id: String, val label: String, val targetWei: String, val unlocks: String = "", val reached: Boolean, val progressBps: Int)
@Serializable data class Quest(
    val id: String, val token: String, val tokenInfo: TokenBrief? = null, val title: String, val description: String = "", val criteria: String = "",
    val tier: String = "basic", val quantity: Int = 1, val allocationsTotal: Int = 0, val allocationsLeft: Int = 0, val deadline: Long = 0,
    val state: String = "open", val submissions: Int = 0, val createdAt: Long = 0,
)
@Serializable data class BattleSeat(val seat: Int, val user: PublicUser)
@Serializable data class Battle(
    val id: String, val token: String, val tokenInfo: TokenBrief? = null, val crateName: String, val keyTier: String = "", val host: PublicUser,
    val size: Int, val state: String, val createdAt: Long, val winnerDid: String? = null, val participants: List<BattleSeat> = emptyList(),
    val committedWei: String = "0", val rules: String = "",
)
@Serializable data class TokenDetail(
    val token: Coin, val rounds: List<Round> = emptyList(), val quests: List<Quest> = emptyList(), val battles: List<Battle> = emptyList(),
    val events: List<TokenEvent> = emptyList(), val participants: Int = 0, val milestones: List<Milestone> = emptyList(),
)
@Serializable data class Inventory(
    val heldUnits: String = "0", val committedUnits: String = "0", val claimableUnits: String = "0", val freeUnits: String = "0",
    val snapshotBlock: Int? = null, val snapshotAt: Long? = null, val invariantOk: Boolean = true, val treasury: String? = null,
    val escrowWei: String = "0", val ethWei: String = "0", val gasReserveWei: String = "0",
)
@Serializable data class TreasuryTx(
    val id: String, val token: String, val kind: String, val amount_wei: String, val tx_hash: String? = null, val state: String,
    val created_at: Long, val confirmed_at: Long? = null, val tokenInfo: TokenBrief? = null,
)
@Serializable data class TransactionsFeed(val items: List<TreasuryTx>, val totals: Map<String, String> = emptyMap(), val scope: String = "")
@Serializable data class ActivityItem(
    val id: String, val type: String, val kind: String, val at: Long, val token: String, val tokenInfo: TokenBrief? = null, val user: PublicUser? = null,
    val wallet: String? = null, val amountWei: String? = null, val asset: String? = null, val txHash: String? = null, val state: String = "",
    val href: String = "", val label: String,
)
@Serializable data class PnlRow(val user: PublicUser, val wonWei: String, val spentWei: String, val netWei: String, val opens: Int, val bestWei: String = "0")
@Serializable data class LeaderboardRow(val user: PublicUser, val score: Int, val quests: Int? = null, val wins: Int? = null, val opens: Int? = null)
@Serializable data class BurnFeedItem(val token: String, val tokenInfo: TokenBrief? = null, val txHash: String? = null, val amountWei: String, val at: Long)
@Serializable data class BurnFeed(
    val target: String? = null, val intervalMs: Long, val nextCycleAt: Long, val lastCycleAt: Long? = null, val totalBurnedWei: String = "0", val items: List<BurnFeedItem> = emptyList(),
)

/** Curve trade decoded from Robinhood Chain logs (website `readCurveHistory`). */
data class CurveTrade(
    val txHash: String, val logIndex: Int, val blockNumber: Int, val isBuy: Boolean, val sender: String,
    val eth: Double, val tokens: Double, val creatorFeeEth: Double, val timestamp: Long,
) { val priceEth: Double get() = if (tokens > 0) eth / tokens else 0.0 }

/** Live bonding-curve state (website `CurveState`). */
data class CurveState(
    val quoteReserve: Double, val tokenReserve: Double, val phantomQuote: Double, val graduationThreshold: Double, val graduated: Boolean,
    val creatorTaxBps: Int, val priceEth: Double, val mcapEth: Double, val reserveEth: Double, val sold: Double, val progress: Double,
)

data class PricePoint(val t: Long, val price: Double)
