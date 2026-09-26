package com.objectpad.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.BuildingCoin
import com.objectpad.app.data.BurnFeed
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ChainClient
import com.objectpad.app.data.CoinTrade
import com.objectpad.app.data.MarketSnapshot
import com.objectpad.app.data.ObjectCoin
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.data.PairBoard
import com.objectpad.app.data.PairCatalog
import com.objectpad.app.data.PairQuote
import com.objectpad.app.data.Readiness
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.math.BigInteger

/** A value that has loaded, is loading, or failed with a user-facing message. */
data class Remote<T>(val data: T? = null, val error: String? = null, val loading: Boolean = true, val at: Long = 0)

data class Treasury(val address: String?, val balanceEth: Double?, val costEth: Double?, val affordable: Int, val launchesLeft: Int, val usedToday: Int, val dailyLimit: Int, val perPerson: Int, val open: Boolean)

data class Holdings(val wallet: String, val eth: BigInteger?, val coins: Map<String, BigInteger?>, val at: Long)

data class AppUiState(
    val coins: Remote<List<ObjectCoin>> = Remote(),
    val recent: List<CoinTrade> = emptyList(),
    val market: Remote<MarketSnapshot> = Remote(),
    val status: Remote<Readiness> = Remote(),
    val burns: Remote<BurnFeed> = Remote(),
    val building: List<BuildingCoin> = emptyList(),
    val holdings: Holdings? = null,
    val watchlist: Set<String> = emptySet(),
    val toast: String? = null,
    val pairs: PairBoard? = null,
) {
    /** Live quote for a pair address (ETH when blank). */
    fun pair(address: String?): PairQuote? = pairs?.assets?.firstOrNull { if (PairCatalog.isEth(address)) it.isEth else it.address.equals(address, true) }
    val ethUsd: Double? get() = market.data?.ethUsd
    val treasury: Treasury get() {
        val s = status.data?.sponsor
        val bal = s?.let { Chain.toEth(BigInteger(it.balanceWei.ifBlank { "0" })) }
        val cost = s?.let { Chain.toEth(BigInteger(it.launchCostWei.ifBlank { "0" })) }
        val per = s?.perPersonDaily ?: 5
        val left = if (s == null) 0 else maxOf(0, minOf(s.launchesAffordable, per, s.dailyLimit - s.usedToday))
        return Treasury(s?.address, bal, cost, s?.launchesAffordable ?: 0, left, s?.usedToday ?: 0, s?.dailyLimit ?: 0, per, s != null && s.launchesAffordable >= 1 && s.usedToday < s.dailyLimit)
    }
    fun coin(id: String): ObjectCoin? = coins.data?.firstOrNull { it.id == id || it.token.equals(id, true) || it.symbol.equals(id, true) }
}

/** Activity-scoped state shared by every screen. Polls on the website's intervals and never invents numbers. */
class AppViewModel : ViewModel() {
    private val app = ObjectPadApp.instance
    private val _state = MutableStateFlow(AppUiState(watchlist = app.prefs.watchlist))
    val state: StateFlow<AppUiState> = _state.asStateFlow()
    val account = app.account.state
    private var holdingsJob: Job? = null

    init {
        poll(10_000) { refreshCoins() }
        poll(15_000) { refreshMarket() }
        poll(30_000) { refreshStatus() }
        poll(30_000) { refreshBurns() }
        poll(30_000) { runCatching { ObjectPadApi.pairs() }.onSuccess { p -> _state.update { it.copy(pairs = p) } } }
        poll(5_000) { runCatching { ObjectPadApi.building() }.onSuccess { b -> _state.update { it.copy(building = b.items) } } }
        viewModelScope.launch { account.collect { a -> a.activeWallet?.let { if (_state.value.holdings?.wallet != it) refreshHoldings() } } }
    }

    private fun poll(ms: Long, block: suspend () -> Unit) = viewModelScope.launch { while (isActive) { block(); delay(ms) } }

    suspend fun refreshCoins() {
        runCatching { ObjectPadApi.coins() }
            .onSuccess { f -> _state.update { it.copy(coins = Remote(f.items, null, false, System.currentTimeMillis()), recent = f.recent) } }
            .onFailure { e -> _state.update { it.copy(coins = it.coins.copy(error = e.message, loading = false)) } }
    }
    suspend fun refreshMarket() {
        runCatching { ObjectPadApi.market() }
            .onSuccess { m -> _state.update { it.copy(market = Remote(m, null, false, System.currentTimeMillis())) } }
            .onFailure { e -> _state.update { it.copy(market = it.market.copy(error = e.message, loading = false)) } }
    }
    suspend fun refreshStatus() {
        runCatching { ObjectPadApi.status() }
            .onSuccess { s -> _state.update { it.copy(status = Remote(s, null, false, System.currentTimeMillis())) } }
            .onFailure { e -> _state.update { it.copy(status = it.status.copy(error = e.message, loading = false)) } }
    }
    suspend fun refreshBurns() {
        runCatching { ObjectPadApi.burns() }
            .onSuccess { b -> _state.update { it.copy(burns = Remote(b, null, false, System.currentTimeMillis())) } }
            .onFailure { e -> _state.update { it.copy(burns = it.burns.copy(error = e.message, loading = false)) } }
    }

    fun refreshAll() = viewModelScope.launch { refreshCoins(); refreshMarket(); refreshStatus(); refreshBurns(); refreshHoldings() }

    /** Live ETH and coin balances of the active wallet, read straight from Robinhood Chain. */
    fun refreshHoldings() {
        val wallet = account.value.activeWallet ?: return
        holdingsJob?.cancel()
        holdingsJob = viewModelScope.launch {
            if (_state.value.coins.data == null) refreshCoins()
            val tokens = _state.value.coins.data.orEmpty().map { it.token }
            val eth = runCatching { ChainClient.balance(wallet) }.getOrNull()
            val coins = runCatching { ChainClient.tokenBalances(tokens, wallet) }.getOrDefault(emptyMap())
            _state.update { it.copy(holdings = Holdings(wallet, eth, coins, System.currentTimeMillis())) }
        }
    }

    fun toggleWatch(id: String) {
        val next = _state.value.watchlist.let { if (id in it) it - id else it + id }
        app.prefs.watchlist = next
        _state.update { it.copy(watchlist = next, toast = if (id in next) "Added to your watchlist" else "Removed from watchlist") }
    }

    fun toast(message: String) = _state.update { it.copy(toast = message) }
    fun clearToast() = _state.update { it.copy(toast = null) }
}
