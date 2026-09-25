package com.rork.tagstock.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil3.compose.AsyncImage
import com.rork.tagstock.R
import com.rork.tagstock.data.ApiException
import com.rork.tagstock.data.CaseDesign
import com.rork.tagstock.data.CaseDesigns
import com.rork.tagstock.data.CasepadApi
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.ChainClient
import com.rork.tagstock.data.Coin
import com.rork.tagstock.data.CurveState
import com.rork.tagstock.data.CurveTrade
import com.rork.tagstock.data.Format
import com.rork.tagstock.data.Inventory
import com.rork.tagstock.data.PricePoint
import com.rork.tagstock.data.Round
import com.rork.tagstock.data.TokenDetail
import com.rork.tagstock.ui.AppUiState
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class TokenUiState(
    val detail: TokenDetail? = null, val inventory: Inventory? = null, val designs: CaseDesigns? = null, val rounds: List<Round> = emptyList(),
    val curve: CurveState? = null, val trades: List<CurveTrade> = emptyList(), val historyLoading: Boolean = true, val error: String? = null, val notFound: Boolean = false,
) {
    val coin: Coin? get() = detail?.token
    fun points(ethUsd: Double): List<PricePoint> {
        val list = trades.map { PricePoint(it.timestamp, it.priceEth * ethUsd) }.toMutableList()
        curve?.takeIf { !it.graduated }?.let { list += PricePoint(System.currentTimeMillis(), it.priceEth * ethUsd) }
        return list
    }
    val markers: List<Pair<Long, String>> get() = (detail?.events ?: emptyList()).mapNotNull {
        when (it.kind) { "vault.funded" -> it.createdAt to "Vault funded"; "round.published" -> it.createdAt to "Round opened"; "payout.confirmed", "reward.revealed" -> it.createdAt to "Reward"; else -> null }
    }
    /** Holder balances derived from curve trades. */
    val holders: List<Pair<String, Double>> get() {
        val map = HashMap<String, Double>()
        trades.forEach { map[it.sender] = (map[it.sender] ?: 0.0) + if (it.isBuy) it.tokens else -it.tokens }
        return map.filter { it.value > 0 }.toList().sortedByDescending { it.second }
    }
}

class TokenViewModel(val token: String) : ViewModel() {
    private val _state = MutableStateFlow(TokenUiState())
    val state: StateFlow<TokenUiState> = _state.asStateFlow()
    private var loop: Job? = null

    fun start() {
        if (loop?.isActive == true) return
        loop = viewModelScope.launch { var tick = 0; while (isActive) { refresh(history = tick % 2 == 0); tick++; delay(8_000) } }
    }
    fun stop() { loop?.cancel(); loop = null }

    suspend fun refresh(history: Boolean = true) {
        try { _state.update { it.copy(detail = CasepadApi.token(token), error = null) } }
        catch (e: ApiException) { _state.update { it.copy(error = e.message, notFound = e.status == 404) }; return }
        catch (e: Exception) { _state.update { it.copy(error = e.message) }; return }
        val coin = _state.value.coin ?: return
        if (!coin.isReal) { _state.update { it.copy(historyLoading = false) }; return }
        val inv = runCatching { CasepadApi.inventory(token) }.getOrNull()
        val des = runCatching { CasepadApi.caseDesigns(token) }.getOrNull()
        val rds = runCatching { CasepadApi.liveRounds(token) }.getOrElse { emptyList() }
        val curve = runCatching { ChainClient.curveState(coin.curve) }.getOrNull()
        _state.update { it.copy(inventory = inv, designs = des, rounds = rds, curve = curve) }
        if (history) {
            runCatching { ChainClient.curveHistory(coin.curve, coin.blockNumber) }.getOrNull()?.let { h -> _state.update { it.copy(trades = h) } }
            _state.update { it.copy(historyLoading = false) }
        }
    }
}

private enum class Section(val label: String) { TRADES("Trades"), HOLDERS("Holders"), ACTIVITY("Activity"), CASES("Cases") }

@Composable
fun TokenDetailScreen(vm: TokenViewModel, app: AppUiState, onToast: (String) -> Unit, onWallet: () -> Unit, modifier: Modifier = Modifier) {
    val s by vm.state.collectAsState()
    val ctx = LocalContext.current
    var range by remember { mutableStateOf(ChartRange.ALL) }
    var section by remember { mutableStateOf(Section.TRADES) }
    val coin = s.coin

    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when {
            s.notFound -> item { EmptyState("Unknown token", "${Format.shortAddress(vm.token)} is not registered on Casepad. Tokens launched here appear after their launch transaction is recorded.") }
            coin == null && s.error != null -> item { ErrorState(s.error!!, { }) }
            coin == null -> { item { Skeleton(90) }; item { Skeleton(260) }; item { Skeleton(160) } }
            else -> {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CoinImage(coin.image, coin.ticker, 56)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { Text(coin.name, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis); ModeBadge(coin.mode) }
                            Text("$${coin.ticker} · ${Format.timeAgo(coin.createdAt)}", fontFamily = Mono, fontSize = 12.sp, color = CasepadColors.Muted)
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                CopyChip("CA", coin.token, onToast)
                                Icon(Icons.Default.OpenInNew, contentDescription = "View on Blockscout", tint = CasepadColors.Muted, modifier = Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).background(CasepadColors.Secondary).clickable { ctx.openUrl(Chain.tokenUrl(coin.token)) }.padding(10.dp))
                            }
                        }
                    }
                }
                item {
                    val curve = s.curve
                    Card(raised = true) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Eyebrow(if (curve?.graduated == true) "Graduated · pool price needs a market adapter" else "Live curve price", modifier = Modifier.weight(1f))
                            SingleChoiceSegmentedButtonRow(Modifier.width(200.dp)) {
                                ChartRange.entries.forEachIndexed { i, r ->
                                    SegmentedButton(selected = range == r, onClick = { range = r }, shape = SegmentedButtonDefaults.itemShape(i, ChartRange.entries.size),
                                        colors = SegmentedButtonDefaults.colors(activeContainerColor = CasepadColors.Secondary, activeContentColor = CasepadColors.Foreground, inactiveContainerColor = Color.Transparent, inactiveContentColor = CasepadColors.Muted, activeBorderColor = CasepadColors.Border, inactiveBorderColor = CasepadColors.Border)) { Text(r.label, fontSize = 10.sp, fontFamily = Mono) }
                                }
                            }
                        }
                        Spacer(Modifier.padding(4.dp))
                        if (s.historyLoading && s.trades.isEmpty()) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = CasepadColors.Muted); Text("Reading Robinhood Chain...", fontSize = 12.sp, color = CasepadColors.Muted) }
                        else PriceChart(s.points(app.ethUsd), range, s.markers)
                        Spacer(Modifier.padding(6.dp))
                        Row {
                            StatCell("Price", Format.usd((curve?.priceEth ?: 0.0) * app.ethUsd), Modifier.weight(1f))
                            StatCell("Market cap", if (curve?.graduated == true) "Graduated" else Format.usd((curve?.mcapEth ?: 0.0) * app.ethUsd, true), Modifier.weight(1f))
                            StatCell("Curve", curve?.let { "%.1f%%".format(it.progress * 100) } ?: "—", Modifier.weight(1f), end = true)
                        }
                        Spacer(Modifier.padding(4.dp)); ProgressBar(curve?.progress ?: 0.0); Spacer(Modifier.padding(4.dp))
                        Row {
                            StatCell("Reserve", curve?.let { Format.ethFromDouble(it.reserveEth) } ?: "—", Modifier.weight(1f))
                            StatCell("Sold", curve?.let { Format.tokens(it.sold) } ?: "—", Modifier.weight(1f))
                            StatCell("Supply", "1B", Modifier.weight(1f), end = true)
                        }
                    }
                }
                item { Treasury(coin, s, onToast) }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PrimaryButton("Buy / sell needs a signing wallet", onWallet, Modifier.fillMaxWidth())
                        Text("Curve trades and burns are signed in MetaMask via the CasePad website (WalletConnect for native signing is the next slice). Nothing is submitted from this app without your signature.", fontSize = 10.sp, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    }
                }
                item {
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        Section.entries.forEachIndexed { i, sec ->
                            SegmentedButton(selected = section == sec, onClick = { section = sec }, shape = SegmentedButtonDefaults.itemShape(i, Section.entries.size),
                                colors = SegmentedButtonDefaults.colors(activeContainerColor = CasepadColors.Secondary, activeContentColor = CasepadColors.Foreground, inactiveContainerColor = Color.Transparent, inactiveContentColor = CasepadColors.Muted, activeBorderColor = CasepadColors.Border, inactiveBorderColor = CasepadColors.Border)) { Text(sec.label, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
                }
                when (section) {
                    Section.TRADES -> item { Trades(s) }
                    Section.HOLDERS -> item { Holders(s, coin) }
                    Section.ACTIVITY -> item { Activity(s) }
                    Section.CASES -> item { Cases(s, coin, app) }
                }
            }
        }
    }
}

@Composable
private fun Treasury(coin: Coin, s: TokenUiState, onToast: (String) -> Unit) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("This coin's treasury", modifier = Modifier.weight(1f))
            s.inventory?.treasury?.let { CopyChip("Treasury", it, onToast) }
        }
        Spacer(Modifier.padding(5.dp))
        Row {
            StatCell("Fees accrued", Format.eth(coin.vault.accruedWei, 5), Modifier.weight(1f))
            StatCell("Coins held", Format.units(s.inventory?.heldUnits), Modifier.weight(1f))
            StatCell("Committed", Format.units(s.inventory?.committedUnits), Modifier.weight(1f), end = true)
        }
        Spacer(Modifier.padding(5.dp))
        Row {
            StatCell("Treasury ETH", Format.eth(s.inventory?.ethWei, 5), Modifier.weight(1f))
            StatCell("Escrow", Format.eth(s.inventory?.escrowWei, 5), Modifier.weight(1f))
            StatCell("Open rounds", "${coin.vault.activeRounds}", Modifier.weight(1f), end = true)
        }
        s.detail?.milestones?.forEach { m ->
            Spacer(Modifier.padding(5.dp))
            Row { Text(m.label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold); Spacer(Modifier.weight(1f)); Text(if (m.reached) "Reached" else Format.eth(m.targetWei, 3), fontFamily = Mono, fontSize = 10.sp, color = if (m.reached) CasepadColors.Up else CasepadColors.Muted) }
            Spacer(Modifier.padding(2.dp)); ProgressBar(m.progressBps / 10_000.0, tint = CasepadColors.Gold)
        }
        Spacer(Modifier.padding(5.dp))
        Text("Fees: %.1f%% Casepad on every trade → creator / case treasury / CASEPAD burn. Trading fee 1%% Pons.".format(coin.creatorTaxBps / 100.0), fontSize = 10.sp, color = CasepadColors.Muted)
    }
}

@Composable
private fun Trades(s: TokenUiState) {
    val ctx = LocalContext.current
    Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
        if (s.trades.isEmpty()) Text(if (s.historyLoading) "Reading chain..." else "No trades yet.", fontSize = 13.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth(), textAlign = TextAlign.Center)
        s.trades.asReversed().take(60).forEach { t ->
            Row(Modifier.fillMaxWidth().clickable { ctx.openUrl(Chain.txUrl(t.txHash)) }.padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (t.isBuy) "BUY" else "SELL", fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (t.isBuy) CasepadColors.Up else CasepadColors.Down, modifier = Modifier.width(40.dp))
                Text(Format.shortAddress(t.sender), fontFamily = Mono, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Text(Format.ethFromDouble(t.eth), fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Text("${Format.tokens(t.tokens)} tokens", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted)
                }
                Text(Format.timeAgo(t.timestamp), fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
            }
            Divider()
        }
    }
}

@Composable
private fun Holders(s: TokenUiState, coin: Coin) {
    val ctx = LocalContext.current
    val list = s.holders
    Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
        if (list.isEmpty()) Text(if (s.historyLoading) "Reading chain..." else "No holders found yet.", fontSize = 13.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth(), textAlign = TextAlign.Center)
        list.take(40).forEachIndexed { i, (addr, tokens) ->
            Row(Modifier.fillMaxWidth().clickable { ctx.openUrl(Chain.addressUrl(addr)) }.padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("%02d".format(i + 1), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted)
                Text(Format.shortAddress(addr), fontFamily = Mono, fontSize = 12.sp)
                if (addr.equals(coin.creatorAddress, true)) Text("CREATOR", fontFamily = Mono, fontSize = 8.sp, fontWeight = FontWeight.Bold, color = CasepadColors.Gold)
                Spacer(Modifier.weight(1f))
                Text(Format.tokens(tokens), fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Text("%.2f%%".format(tokens / Chain.TOTAL_SUPPLY * 100), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
            }
            Divider()
        }
        Text("Derived from indexed curve trades since launch; transfers outside the curve are not included.", fontSize = 9.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 8.dp))
    }
}

@Composable
private fun Activity(s: TokenUiState) {
    val ctx = LocalContext.current
    val events = s.detail?.events ?: emptyList()
    Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
        if (events.isEmpty()) Text("No activity yet.", fontSize = 13.sp, color = CasepadColors.Muted, modifier = Modifier.padding(vertical = 24.dp).fillMaxWidth(), textAlign = TextAlign.Center)
        events.take(40).forEach { e ->
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(e.kind.replace('.', ' ').uppercase(), fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (e.kind.contains("sell")) CasepadColors.Down else CasepadColors.Up)
                Spacer(Modifier.weight(1f))
                (e.payload.amountWei ?: e.payload.notionalWei)?.let { Text(Format.eth(it, 4), fontFamily = Mono, fontSize = 11.sp) }
                e.payload.txHash?.let { h -> Icon(Icons.Default.OpenInNew, contentDescription = "Open transaction", tint = CasepadColors.Muted, modifier = Modifier.size(14.dp).clickable { ctx.openUrl(Chain.txUrl(h)) }) }
                Text(Format.timeAgo(e.createdAt), fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
            }
            Divider()
        }
    }
}

private val CASE_ART = listOf(R.drawable.case_slate, R.drawable.case_teal, R.drawable.case_blue, R.drawable.case_violet, R.drawable.case_crimson, R.drawable.case_gold)
private val CASE_GLOW = listOf(Color(0xFF9A9A9A), Color(0xFF59B3B3), CasepadColors.Cobalt, Color(0xFFA57FE0), CasepadColors.Down, CasepadColors.Gold)

@Composable
private fun Cases(s: TokenUiState, coin: Coin, app: AppUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (app.openCases?.live != true) {
            Row(Modifier.clip(RoundedCornerShape(10.dp)).background(CasepadColors.Secondary).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = CasepadColors.Muted, modifier = Modifier.size(14.dp))
                Text("Live cases are switched off by the operator right now. Cases are shown for review; no burn is requested until they are switched back on.", fontSize = 12.sp, color = CasepadColors.Muted)
            }
        }
        val d = s.designs
        if (d == null) Skeleton(120) else {
            val all = (d.platform + d.creator).sortedBy { Format.weiToDouble(it.entryUnits) ?: 0.0 }
            if (all.isEmpty()) EmptyState("No cases published", d.note)
            all.forEachIndexed { i, design -> CaseTile(design, minOf(i, 5), coin.ticker, s.rounds.firstOrNull { it.designId == design.id && it.available > 0 }) }
        }
    }
}

@Composable
private fun CaseTile(design: CaseDesign, tier: Int, ticker: String, round: Round?) {
    val best = design.outcomes.maxOfOrNull { Format.weiToDouble(it.units) ?: 0.0 } ?: 0.0
    val entry = Format.weiToDouble(design.entryUnits) ?: 1.0
    val glow = CASE_GLOW[tier]
    Row(Modifier.fillMaxWidth().clip(CardShape).background(CasepadColors.Card).outlined(glow.copy(alpha = 0.25f)).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        AsyncImage(model = CASE_ART[tier], contentDescription = null, modifier = Modifier.size(76.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row { Text(design.name, fontSize = 14.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.weight(1f)); Text(design.provenance.uppercase(), fontFamily = Mono, fontSize = 8.sp, fontWeight = FontWeight.Bold, color = CasepadColors.Muted) }
            Text("Burn ${Format.units(design.entryUnits)} $$ticker", fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Win up to " + if (entry > 0) "%.0fx".format(best / entry) else "—", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = glow)
                Text("${design.profitProbabilityBps / 100}% profit odds", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted)
            }
            Text(round?.let { "${it.available} of ${it.entries} keys left · round ${it.id.takeLast(6)}" } ?: "No funded round open", fontFamily = Mono, fontSize = 10.sp, color = if (round == null) CasepadColors.Down.copy(alpha = 0.8f) else CasepadColors.Up)
        }
    }
}
