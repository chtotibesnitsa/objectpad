package com.rork.tagstock.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.Coin
import com.rork.tagstock.data.Format
import com.rork.tagstock.ui.AppUiState
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono
import kotlinx.coroutines.launch

enum class MarketSort(val title: String) { NEW("New launches"), GAINERS("Gainers"), VOLUME("Volume"), MCAP("Market cap") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    state: AppUiState,
    onRefresh: suspend () -> Unit,
    onToken: (String) -> Unit,
    onLaunch: () -> Unit,
    onToast: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var sort by remember { mutableStateOf(MarketSort.NEW) }
    var query by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    val ctx = LocalContext.current

    val coins = remember(state.coins, sort, query) {
        val q = query.trim().lowercase()
        state.coins.filter { q.isEmpty() || "${it.name} ${it.ticker} ${it.token}".lowercase().contains(q) }.sortedWith(
            when (sort) {
                MarketSort.GAINERS -> compareByDescending { it.market?.changeBps ?: Int.MIN_VALUE }
                MarketSort.MCAP -> compareByDescending { it.market?.marketCapUsd ?: -1.0 }
                MarketSort.VOLUME -> compareByDescending { Format.weiToDouble(it.market?.volumeWei) ?: 0.0 }
                MarketSort.NEW -> compareByDescending { it.createdAt }
            },
        )
    }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; onRefresh(); refreshing = false } }, modifier = modifier) {
        LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            item { Hero(state, onLaunch, onToast) }
            item { TapeStrip(state, onToken) }
            if (state.trending.isNotEmpty()) item { Trending(state, onToken) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("The market", style = MaterialTheme.typography.titleLarge)
                        Eyebrow("live discovery")
                        Spacer(Modifier.weight(1f))
                        if (state.refreshing) CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp, color = CasepadColors.Muted)
                        Eyebrow(state.updatedAt?.let { "updated ${Format.timeAgo(it)}" } ?: "connecting")
                    }
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        MarketSort.entries.forEach { s ->
                            val on = s == sort
                            Text(
                                s.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (on) CasepadColors.Background else CasepadColors.Muted,
                                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (on) CasepadColors.Foreground else Color.Transparent).clickable { sort = s }.padding(horizontal = 12.dp, vertical = 9.dp),
                            )
                        }
                    }
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(CasepadColors.Secondary).padding(horizontal = 12.dp).height(40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Search, contentDescription = null, tint = CasepadColors.Muted, modifier = Modifier.size(14.dp))
                        BasicTextField(
                            value = query, onValueChange = { query = it; if (Chain.isAddress(it.trim())) onToken(it.trim().lowercase()) },
                            singleLine = true, textStyle = TextStyle(color = CasepadColors.Foreground, fontSize = 13.sp), cursorBrush = SolidColor(CasepadColors.Gold),
                            modifier = Modifier.weight(1f), decorationBox = { inner -> if (query.isEmpty()) Text("Search coins or paste a contract", fontSize = 13.sp, color = CasepadColors.Muted); inner() },
                        )
                    }
                }
            }
            when {
                state.terminal == null && state.error != null -> item { ErrorState(state.error, { scope.launch { onRefresh() } }) }
                state.terminal == null -> items(3) { Skeleton(176) }
                coins.isEmpty() -> item { EmptyState(if (query.isEmpty()) "The next launch starts here." else "No matching coins", if (query.isEmpty()) "Confirmed Casepad launches appear here automatically. No demo balances or invented activity." else "Try another ticker or contract address.") }
                else -> items(coins, key = { it.token }) { CoinCard(it, Modifier.clickable { onToken(it.token) }) }
            }
            item { Text("Price movement is measured since the first available snapshot within the last 24 hours, not an assumed 24-hour return. Volume covers indexed curve trades.", fontSize = 10.sp, color = CasepadColors.Muted) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Text("On the tape", style = MaterialTheme.typography.titleMedium, fontSize = 17.sp); Spacer(Modifier.weight(1f)); Eyebrow("confirmed chain activity") }
                    Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
                        val items = state.chainActivity.take(12)
                        if (items.isEmpty()) Text("No confirmed Casepad transactions yet.", fontSize = 13.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth())
                        items.forEach { TapeRow(it, onToken); Divider() }
                    }
                }
            }
        }
    }
}

@Composable
private fun Hero(state: AppUiState, onLaunch: () -> Unit, onToast: (String) -> Unit) {
    val ctx = LocalContext.current
    val c = state.status?.contribution
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(CasepadColors.Gold)); Eyebrow("The coin-first launchpad  /  Pons V2")
        }
        Column {
            Text("Burn coins.\nOpen cases.", style = MaterialTheme.typography.headlineLarge)
            Text("A chance to win more.", style = MaterialTheme.typography.headlineLarge, color = CasepadColors.Gold)
        }
        Text("Discover a coin. Burn some to open a case for a chance at more of that same coin. Never a guaranteed return.", style = MaterialTheme.typography.bodyMedium, fontSize = 15.sp, color = CasepadColors.Muted)
        Eyebrow(if (state.terminal?.platform?.tokenRewards == "enabled") "Live cases open · trading uses ETH" else "Live cases open when the operator flips the switch", color = CasepadColors.Gold.copy(alpha = 0.85f))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CopyChip("CA", state.casepadCA, onToast)
            state.xUrl?.let { x ->
                Row(Modifier.clip(RoundedCornerShape(8.dp)).background(CasepadColors.Secondary).clickable { ctx.openUrl(x) }.padding(horizontal = 12.dp).height(36.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("𝕏", fontSize = 15.sp); Text("Follow Casepad", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        PrimaryButton("+  Launch a coin", onLaunch, Modifier.fillMaxWidth())
        Divider()
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            val mins = ((state.terminal?.platform?.fees?.buybackIntervalMs ?: 1_800_000L) / 60_000)
            listOf(
                state.status?.chain?.name ?: Chain.NAME, "${state.coins.size} Casepad launches",
                "%.1f%% Creator".format((c?.devBps ?: 50) / 100.0), "%.1f%% Case treasury".format((c?.cratesBps ?: 50) / 100.0),
                "%.1f%% CASEPAD burn / $mins min".format((c?.buybackBps ?: 50) / 100.0),
            ).forEach { Text(it.uppercase(), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
        }
        Divider()
    }
}

@Composable
private fun TapeStrip(state: AppUiState, onToken: (String) -> Unit) {
    val items = state.chainActivity.take(14)
    Row(Modifier.fillMaxWidth().height(56.dp).clip(CardShape).background(Color.Black.copy(alpha = 0.25f)), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(66.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { Box(Modifier.size(6.dp).clip(CircleShape).background(CasepadColors.Up)); Text("LIVE", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = CasepadColors.Up) }
            Text("tape", fontSize = 10.sp, color = CasepadColors.Muted)
        }
        Box(Modifier.width(1.dp).height(40.dp).background(CasepadColors.Border))
        LazyRow(contentPadding = PaddingValues(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (items.isEmpty()) item { Text("No confirmed Casepad transactions yet.", fontSize = 12.sp, color = CasepadColors.Muted, modifier = Modifier.padding(horizontal = 10.dp)) }
            items(items, key = { it.id }) { item ->
                Row(Modifier.clip(RoundedCornerShape(10.dp)).background(CasepadColors.CardRaised).clickable { onToken(item.token) }.padding(horizontal = 10.dp).height(40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(item.label, fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (item.isSell) CasepadColors.Down else CasepadColors.Up)
                    Text("$" + (item.tokenInfo?.ticker ?: ""), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    item.amountWei?.let { Text(Format.eth(it, 3), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
                }
            }
        }
    }
}

@Composable
private fun Trending(state: AppUiState, onToken: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.LocalFireDepartment, contentDescription = null, tint = CasepadColors.Gold, modifier = Modifier.size(18.dp))
            Text("Trending coins", style = MaterialTheme.typography.titleMedium, fontSize = 17.sp)
            Spacer(Modifier.weight(1f)); Eyebrow("observed move · 24h")
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(state.trending.take(8), key = { it.token }) { coin ->
                Column(Modifier.width(178.dp).clip(CardShape).background(CasepadColors.Card).outlined(CasepadColors.Gold.copy(alpha = 0.25f)).clickable { onToken(coin.token) }.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CoinImage(coin.image, coin.ticker, 34)
                        Column { Text(coin.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis); Text("$${coin.ticker}", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(Format.bps(coin.market?.changeBps), fontFamily = Mono, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = CasepadColors.Up)
                        Spacer(Modifier.weight(1f))
                        Text(coin.market?.marketCapUsd?.let { Format.usd(it, true) } ?: "—", fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted)
                    }
                }
            }
        }
        Text("Ranked by price move since the first snapshot within the last 24 hours, exactly as the website's Gainers sort. Stale quotes are excluded.", fontSize = 10.sp, color = CasepadColors.Muted)
    }
}

/** Website `CoinCard`. */
@Composable
fun CoinCard(coin: Coin, modifier: Modifier = Modifier) {
    val m = coin.market
    val change = m?.changeBps
    val rising = m?.stale == false && (change ?: 0) > 0
    Column(modifier.fillMaxWidth().clip(CardShape).background(CasepadColors.Card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CoinImage(coin.image, coin.ticker)
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(coin.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (rising) Icon(Icons.Default.LocalFireDepartment, contentDescription = "Rising", tint = CasepadColors.Gold, modifier = Modifier.size(13.dp))
                    ModeBadge(coin.mode)
                }
                Text("$${coin.ticker}  /  ${Format.timeAgo(coin.createdAt)}", fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted)
            }
        }
        Text(coin.description.ifEmpty { "Pons V2 launch. Open the market to view trades and this coin's treasury." }, fontSize = 12.sp, color = CasepadColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row {
            StatCell("Market cap", m?.marketCapUsd?.let { Format.usd(it, true) } ?: if (m?.graduated == true) "Graduated" else "Unavailable", Modifier.weight(1f))
            StatCell("Observed move", change?.let { Format.pct(it / 100.0) } ?: "—", Modifier.weight(1f), tint = if (rising) CasepadColors.Up else if ((change ?: 0) < 0) CasepadColors.Down else CasepadColors.Muted, end = true)
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row { Text("VOL " + (m?.let { Format.eth(it.volumeWei, 3) } ?: "—"), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted); Spacer(Modifier.weight(1f)); Text(if (m?.stale == true) "STALE" else "PONS V2", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
            ProgressBar((m?.progressBps ?: 0) / 10_000.0)
            Row { Text(Format.shortAddress(coin.token), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted); Spacer(Modifier.weight(1f)); Text("${coin.reference?.symbol ?: "ETH"} · ${m?.let { "%.1f%%".format(it.progressBps / 100.0) } ?: "—"} curve", fontSize = 10.sp, color = CasepadColors.Muted) }
        }
    }
}
