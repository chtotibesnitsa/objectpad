package com.rork.tagstock.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rork.tagstock.data.CasepadApi
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.ChainClient
import com.rork.tagstock.data.Coin
import com.rork.tagstock.data.OpenCasesFeed
import com.rork.tagstock.data.PlatformStatus
import com.rork.tagstock.data.Terminal
import com.rork.tagstock.data.TickerItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class AppUiState(
    val terminal: Terminal? = null,
    val tape: List<TickerItem> = emptyList(),
    val status: PlatformStatus? = null,
    val openCases: OpenCasesFeed? = null,
    val ethUsd: Double = 0.0,
    val refreshing: Boolean = false,
    val error: String? = null,
    val updatedAt: Long? = null,
    val watchedWallet: String? = null,
    val ethBalance: Double? = null,
    val casepadBalance: Double? = null,
    val coinBalances: Map<String, Double> = emptyMap(),
    val balancesAt: Long? = null,
    val toast: String? = null,
) {
    val coins: List<Coin> get() = terminal?.coins ?: emptyList()
    val casepadCA: String get() = terminal?.platform?.ecosystemToken ?: Chain.CASEPAD_TOKEN
    val xUrl: String? get() = terminal?.platform?.xUrl
    /** Website tape filter: confirmed real-mode chain events with a tx hash. */
    val chainActivity: List<TickerItem> get() {
        val kinds = setOf("token.launched", "trade.buy", "trade.sell", "creator.buy", "creator.sell", "payout.confirmed", "vault.funded", "buyback.confirmed")
        return tape.filter { it.tokenInfo?.mode == "real" && it.txHash != null && it.kind in kinds }
    }
    /** Trending = website "Gainers" sort: observed move since first snapshot within 24h; stale quotes excluded. */
    val trending: List<Coin> get() = coins.filter { it.isReal && (it.market?.changeBps ?: 0) > 0 && it.market?.stale == false }
        .sortedByDescending { it.market?.changeBps ?: 0 }
}

/** Shared app state polled on the website's cadence (tape 10s, markets 20s). */
class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("casepad", 0)
    private val _state = MutableStateFlow(AppUiState(watchedWallet = prefs.getString("watchedWallet", null)))
    val state: StateFlow<AppUiState> = _state.asStateFlow()
    private var loop: Job? = null

    fun start() {
        if (loop?.isActive == true) return
        loop = viewModelScope.launch {
            var tick = 0
            while (isActive) { refresh(fast = tick % 2 == 1); tick++; delay(10_000) }
        }
    }
    fun stop() { loop?.cancel(); loop = null }

    suspend fun refresh(fast: Boolean = false) {
        _state.update { it.copy(refreshing = true) }
        try { _state.update { it.copy(tape = CasepadApi.ticker(), error = null) } } catch (e: Exception) { _state.update { it.copy(error = e.message) } }
        if (!fast || _state.value.terminal == null) {
            try {
                val t = CasepadApi.terminal()
                _state.update { it.copy(terminal = t, updatedAt = System.currentTimeMillis(), error = null) }
            } catch (e: Exception) { _state.update { it.copy(error = e.message) } }
            runCatching { CasepadApi.status() }.getOrNull()?.let { s -> _state.update { it.copy(status = s) } }
            runCatching { CasepadApi.openCases() }.getOrNull()?.let { c -> _state.update { it.copy(openCases = c) } }
            runCatching { CasepadApi.ethPrice() }.getOrNull()?.let { p -> if (p > 0) _state.update { it.copy(ethUsd = p) } }
            val s = _state.value
            if (s.watchedWallet != null && (s.balancesAt == null || System.currentTimeMillis() - s.balancesAt > 30_000)) refreshBalances()
        }
        _state.update { it.copy(refreshing = false) }
    }

    fun setWallet(address: String?) {
        prefs.edit().putString("watchedWallet", address).apply()
        _state.update { it.copy(watchedWallet = address, ethBalance = null, casepadBalance = null, coinBalances = emptyMap(), balancesAt = null) }
        if (address != null) viewModelScope.launch { refreshBalances() }
    }

    suspend fun refreshBalances() {
        val wallet = _state.value.watchedWallet ?: return
        if (!Chain.isAddress(wallet)) return
        val eth = runCatching { ChainClient.ethBalance(wallet) }.getOrNull()
        val cp = runCatching { ChainClient.tokenBalance(_state.value.casepadCA, wallet) }.getOrNull()
        val balances = kotlinx.coroutines.coroutineScope {
            _state.value.coins.filter { it.isReal }.map { c -> async { c.token to runCatching { ChainClient.tokenBalance(c.token, wallet) }.getOrNull() } }.awaitAll()
        }.filter { (it.second ?: 0.0) > 0 }.associate { it.first to it.second!! }
        _state.update { it.copy(ethBalance = eth, casepadBalance = cp, coinBalances = balances, balancesAt = System.currentTimeMillis()) }
    }

    fun toast(message: String) {
        _state.update { it.copy(toast = message) }
        viewModelScope.launch { delay(1600); _state.update { if (it.toast == message) it.copy(toast = null) else it } }
    }
}
