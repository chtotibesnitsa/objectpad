package com.rork.tagstock.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import coil3.compose.AsyncImage
import com.rork.tagstock.R
import com.rork.tagstock.data.ActivityItem
import com.rork.tagstock.data.Battle
import com.rork.tagstock.data.CasepadApi
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.Format
import com.rork.tagstock.data.LeaderboardRow
import com.rork.tagstock.data.OpenCase
import com.rork.tagstock.data.PnlRow
import com.rork.tagstock.data.Quest
import com.rork.tagstock.data.TransactionsFeed
import com.rork.tagstock.ui.AppUiState
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val CASE_ART = listOf(R.drawable.case_slate, R.drawable.case_teal, R.drawable.case_blue, R.drawable.case_violet, R.drawable.case_crimson, R.drawable.case_gold)

@Composable
fun CasesScreen(app: AppUiState, onToken: (String) -> Unit, modifier: Modifier = Modifier) {
    val all = app.openCases?.cases ?: emptyList()
    val coins = all.map { it.round.token }.toSet().size
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("Cases", "${all.size} open case${if (all.size == 1) "" else "s"} across $coins coin${if (coins == 1) "" else "s"} · ${all.sumOf { it.round.available }} keys left") }
        if (app.openCases?.live == false) item {
            Row(Modifier.clip(RoundedCornerShape(10.dp)).background(CasepadColors.Secondary).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = CasepadColors.Muted, modifier = Modifier.size(14.dp))
                Text("Live cases are switched off by the operator right now. Cases are shown for review; no burn is requested until they are switched back on.", fontSize = 12.sp, color = CasepadColors.Muted)
            }
        }
        when {
            app.openCases == null -> items(3) { Skeleton(120) }
            all.isEmpty() -> item {
                Card(padding = 24) {
                    AsyncImage(model = R.drawable.feat_cases, contentDescription = null, modifier = Modifier.size(90.dp).align(Alignment.CenterHorizontally))
                    Text("No funded cases open yet", fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    Text("Creators publish a case once their coin's treasury holds enough of the coin to cover every prize. Open a coin page to see its designs and funding.", fontSize = 13.sp, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                }
            }
            else -> items(all.sortedByDescending { it.round.createdAt }, key = { it.round.id }) { OpenCaseRow(it, Modifier.clickable { onToken(it.round.token) }) }
        }
        item { Text("Every case pays out in the coin that was burned to open it. Odds are fixed and published before the round; each draw carries a public RNG record.", fontSize = 10.sp, color = CasepadColors.Muted) }
    }
}

@Composable
private fun OpenCaseRow(item: OpenCase, modifier: Modifier = Modifier) {
    val r = item.round
    Row(modifier.fillMaxWidth().clip(CardShape).background(CasepadColors.Card).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        AsyncImage(model = CASE_ART[Math.abs(r.token.hashCode()) % CASE_ART.size], contentDescription = null, modifier = Modifier.size(72.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) { Text(r.crateName, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis); ModeBadge(r.mode) }
            Text("$" + (item.token?.ticker ?: Format.shortAddress(r.token)), fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Text("Burn ${Format.units(r.entryUnits)}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold); Text("Best ${Format.units(item.bestPrizeUnits)}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = CasepadColors.Gold) }
            Row { Text("${r.available}/${r.entries} keys · ${item.opened} opened", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Up); Spacer(Modifier.weight(1f)); Text("${item.market.burns} burns", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
        }
    }
}

@Composable
fun BattlesScreen(onToken: (String) -> Unit, modifier: Modifier = Modifier) {
    var battles by remember { mutableStateOf<List<Battle>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(reload) { runCatching { CasepadApi.battles() }.onSuccess { battles = it; error = null }.onFailure { error = it.message } }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("Live Battles", "same case · same round · one shared reel") }
        val list = battles
        when {
            list == null && error != null -> item { ErrorState(error!!, { reload++ }) }
            list == null -> item { Skeleton(120) }
            list.isEmpty() -> item {
                Card(padding = 24) {
                    AsyncImage(model = R.drawable.feat_battles, contentDescription = null, modifier = Modifier.size(90.dp).align(Alignment.CenterHorizontally))
                    Text("No battles open", fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    Text("Battles are hosted from a coin page once a funded round is live. Two or four players open the same case; the highest pull takes the table.", fontSize = 13.sp, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                }
            }
            else -> items(list, key = { it.id }) { b ->
                Card(Modifier.clickable { onToken(b.token) }, padding = 12) {
                    Row { Text(b.crateName, fontSize = 14.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.weight(1f)); Text(b.state.uppercase(), fontFamily = Mono, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = if (b.state == "live") CasepadColors.Up else CasepadColors.Muted) }
                    Text("$${b.tokenInfo?.ticker ?: ""} · host @${b.host.handle} · ${b.participants.size}/${b.size} seats", fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted)
                    Text(b.rules, fontSize = 11.sp, color = CasepadColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
fun QuestsScreen(onToken: (String) -> Unit, modifier: Modifier = Modifier) {
    var quests by remember { mutableStateOf<List<Quest>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(reload) { runCatching { CasepadApi.quests() }.onSuccess { quests = it; error = null }.onFailure { error = it.message } }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("Quests", "creator tasks that pay keys") }
        val list = quests
        when {
            list == null && error != null -> item { ErrorState(error!!, { reload++ }) }
            list == null -> item { Skeleton(120) }
            list.isEmpty() -> item {
                Card(padding = 24) {
                    AsyncImage(model = R.drawable.nav_quests, contentDescription = null, modifier = Modifier.size(80.dp).align(Alignment.CenterHorizontally))
                    Text("No open quests", fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                    Text("Creators post quests from Creator Studio. Approved deliverables are paid in keys for that coin's cases.", fontSize = 13.sp, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                }
            }
            else -> items(list, key = { it.id }) { q ->
                Card(Modifier.clickable { onToken(q.token) }, padding = 12) {
                    Row { Text(q.title, fontSize = 14.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.weight(1f)); Text("${q.allocationsLeft}/${q.allocationsTotal} left", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Up) }
                    Text(q.description, fontSize = 12.sp, color = CasepadColors.Muted, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    Text("$${q.tokenInfo?.ticker ?: ""} · ${q.quantity} ${q.tier} key${if (q.quantity == 1) "" else "s"} · closes ${SimpleDateFormat("MMM d", Locale.US).format(Date(q.deadline))}", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted)
                }
            }
        }
    }
}

@Composable
fun LeaderboardScreen(modifier: Modifier = Modifier) {
    var pnl by remember { mutableStateOf<List<PnlRow>>(emptyList()) }
    var note by remember { mutableStateOf("") }
    var points by remember { mutableStateOf<List<LeaderboardRow>>(emptyList()) }
    var scoring by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }
    var board by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        runCatching { CasepadApi.pnlBoard() }.onSuccess { pnl = it.leaderboard; note = it.note }
        runCatching { CasepadApi.leaderboard() }.onSuccess { points = it.leaderboard; scoring = it.scoring }
        loaded = true
    }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("Leaderboard", "verified results only") }
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("Net P&L", "Points").forEachIndexed { i, l ->
                    SegmentedButton(selected = board == i, onClick = { board = i }, shape = SegmentedButtonDefaults.itemShape(i, 2),
                        colors = SegmentedButtonDefaults.colors(activeContainerColor = CasepadColors.Secondary, activeContentColor = CasepadColors.Foreground, inactiveContainerColor = Color.Transparent, inactiveContentColor = CasepadColors.Muted, activeBorderColor = CasepadColors.Border, inactiveBorderColor = CasepadColors.Border)) { Text(l, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }
        if (!loaded) item { Skeleton(200) }
        else if (board == 0) {
            val rows = pnl.filter { Format.isPositive(it.wonWei) || Format.isPositive(it.spentWei) }
            if (rows.isEmpty()) item { EmptyState("Verified results will rank here.", note.ifEmpty { "Opened live cases and confirmed payouts feed this board." }) }
            item {
                Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
                    rows.forEachIndexed { i, r ->
                        Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("%02d".format(i + 1), fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted); Text("@${r.user.handle}", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f)); Text("${r.opens} opens", fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted)
                            Text(Format.eth(r.netWei.removePrefix("-"), 3).let { if (r.netWei.startsWith("-")) "-$it" else it }, fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (r.netWei.startsWith("-")) CasepadColors.Down else CasepadColors.Up)
                        }
                        Divider()
                    }
                }
            }
        } else {
            if (points.isEmpty()) item { EmptyState("No scored activity yet", scoring) }
            item {
                Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
                    points.forEachIndexed { i, r ->
                        Row(Modifier.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("%02d".format(i + 1), fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted); Text("@${r.user.handle}", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.weight(1f)); Text("${r.score} pts", fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = CasepadColors.Gold)
                        }
                        Divider()
                    }
                }
            }
            if (scoring.isNotEmpty()) item { Text(scoring, fontSize = 10.sp, color = CasepadColors.Muted) }
        }
    }
}

@Composable
fun TransactionsScreen(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    var feed by remember { mutableStateOf<TransactionsFeed?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(reload) { runCatching { CasepadApi.transactions() }.onSuccess { feed = it; error = null }.onFailure { error = it.message } }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("Transactions", feed?.scope ?: "sitewide treasury operations") }
        val f = feed
        when {
            f == null && error != null -> item { ErrorState(error!!, { reload++ }) }
            f == null -> item { Skeleton(240) }
            else -> {
                if (f.items.isEmpty()) item { EmptyState("No treasury operations yet", "Dev payouts, case funding and CASEPAD buybacks appear here with their receipts.") }
                item {
                    Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
                        f.items.forEach { tx ->
                            Row(Modifier.fillMaxWidth().clickable(enabled = tx.tx_hash != null) { ctx.openUrl(Chain.txUrl(tx.tx_hash!!)) }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(tx.kind.replace('_', ' ').uppercase(), fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (tx.kind.contains("buyback") || tx.kind.contains("burn")) CasepadColors.Gold else CasepadColors.Up)
                                    Text("$" + (tx.tokenInfo?.ticker ?: Format.shortAddress(tx.token)), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Spacer(Modifier.weight(1f))
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(Format.eth(tx.amount_wei, 5), fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { StatusDot(tx.state == "confirmed"); Text(tx.state, fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
                                }
                                Text(Format.timeAgo(tx.confirmed_at ?: tx.created_at), fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
                            }
                            Divider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ActivityScreen(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    var items by remember { mutableStateOf<List<ActivityItem>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    LaunchedEffect(reload) { runCatching { CasepadApi.activity() }.onSuccess { items = it; error = null }.onFailure { error = it.message } }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionHead("Activity", "newest 50 public actions sitewide") }
        val list = items
        when {
            list == null && error != null -> item { ErrorState(error!!, { reload++ }) }
            list == null -> item { Skeleton(240) }
            list.isEmpty() -> item { EmptyState("Nothing yet", "Launches, treasury movements and opened cases land here.") }
            else -> item {
                Column(Modifier.clip(CardShape).background(CasepadColors.Card).padding(horizontal = 12.dp)) {
                    list.forEach { a ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(a.label.uppercase(), fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (a.type == "draw") CasepadColors.Gold else CasepadColors.Up)
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { Text("$" + (a.tokenInfo?.ticker ?: ""), fontSize = 12.sp, fontWeight = FontWeight.SemiBold); a.user?.let { Text("@${it.handle}", fontSize = 11.sp, color = CasepadColors.Muted) } }
                            }
                            Spacer(Modifier.weight(1f))
                            a.amountWei?.let { Text(if (a.asset == null || a.asset == "ETH") Format.eth(it, 5) else Format.units(it), fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                            a.txHash?.let { h -> Icon(Icons.Default.OpenInNew, contentDescription = "Open transaction", tint = CasepadColors.Muted, modifier = Modifier.size(14.dp).clickable { ctx.openUrl(Chain.txUrl(h)) }) }
                            Text(Format.timeAgo(a.at), fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
                        }
                        Divider()
                    }
                }
            }
        }
    }
}
