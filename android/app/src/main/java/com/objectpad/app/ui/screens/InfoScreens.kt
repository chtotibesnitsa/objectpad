package com.objectpad.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.data.PublicFeed
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.CoinImage
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.Divider
import com.objectpad.app.ui.components.Donut
import com.objectpad.app.ui.components.Glass
import com.objectpad.app.ui.components.GlassIcon
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.Loading
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.Notice
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.ProgressBar
import com.objectpad.app.ui.components.PulseDot
import com.objectpad.app.ui.components.QrCode
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.ScreenPadding
import com.objectpad.app.ui.components.StatCell
import com.objectpad.app.ui.components.Steel
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.Sunk
import com.objectpad.app.ui.components.TopBar
import com.objectpad.app.ui.components.copyText
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.delay
import java.math.BigInteger

/** Live $OBJECTPAD buyback & burn: real burns from the treasury plus the 0.5% routed from every trade. */
@Composable
fun BurnScreen(app: AppUiState) {
    val context = LocalContext.current
    val b = app.burns.data
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    val routed = remember(app.recent) { app.recent.sortedByDescending { it.at }.take(40) }
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Raised(radius = 32.dp, padding = 22.dp) {
                Chip("\$OBJECTPAD · buy and burn", dot = if (b?.live == true) Pad.Up else null)
                Display("Every trade shrinks the supply.", 38, Modifier.padding(top = 14.dp))
                Body("0.5% of every trade on every ObjectPad coin buys \$OBJECTPAD and burns it. Automatic. No withdraw function.", Modifier.padding(top = 8.dp), size = 15, weight = 700)
                Donut(listOf(3333f to Pad.Graphite, 3333f to Pad.Aqua, 3334f to Color(0xFFD3D7DE)), Modifier.padding(top = 18.dp).size(160.dp).align(Alignment.CenterHorizontally), thickness = 20.dp) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) { Display("0.5%", 26); MonoText("OF TRADES", size = 10) }
                }
            }
        }
        item {
            when {
                b == null && app.burns.loading -> Loading("Reading the burn engine…")
                b == null -> Notice(app.burns.error ?: "The burn feed could not be read.")
                !b.live && b.burns == 0 -> Notice("The \$OBJECTPAD token and burn engine aren’t live yet, so nothing has burned. Live totals appear here the moment they are. No projected numbers are shown.")
                else -> Steel(radius = 26.dp) {
                    Row { StatCell("Burned", Fmt.compact(Chain.toEth(BigInteger(b.totalTokens.ifBlank { "0" }))), Modifier.weight(1f), Glass.Burn); StatCell("ETH spent", Fmt.eth(Chain.toEth(BigInteger(b.totalEth.ifBlank { "0" }))), Modifier.weight(1f)) }
                    Row(Modifier.padding(top = 12.dp)) { StatCell("Burns", b.burns.toString(), Modifier.weight(1f)); StatCell("Waiting", Fmt.eth(Chain.toEth(BigInteger(b.pendingEth.ifBlank { "0" })))  , Modifier.weight(1f)) }
                    b.nextAt?.let { MonoText("NEXT BURN IN ${Fmt.clock(it - now)}", Modifier.padding(top = 12.dp), color = Pad.Ink) }
                }
            }
        }
        if (b != null && b.items.isNotEmpty()) item {
            Raised(radius = 26.dp, padding = 12.dp) {
                Lab("Burns sent by the treasury", Modifier.padding(6.dp))
                b.items.forEachIndexed { i, e ->
                    if (i > 0) Divider()
                    Row(Modifier.fillMaxWidth().press { e.hash?.let { context.openUrl(Chain.txUrl(it)) } }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(38.dp).clip(CircleShape).background(Pad.Ink05), contentAlignment = Alignment.Center) { Icon(Icons.Default.LocalFireDepartment, null, Modifier.size(18.dp)) }
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Strong("${Fmt.compact(Chain.toEth(BigInteger(e.tokensBurned.ifBlank { "0" })))} \$OBJECTPAD", size = 14)
                            MonoText("for ${Fmt.eth(Chain.toEth(BigInteger(e.ethIn.ifBlank { "0" })))} · ${Fmt.timeAgo(e.at)} · ${e.state.uppercase()}", size = 10)
                        }
                        if (e.hash != null) Icon(Icons.AutoMirrored.Filled.OpenInNew, null, Modifier.size(14.dp))
                    }
                }
            }
        }
        item {
            Raised(radius = 26.dp, padding = 12.dp) {
                Row(Modifier.padding(6.dp), verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Burn, 34.dp); Strong("Routed to the burn", Modifier.padding(start = 8.dp).weight(1f)); PulseDot(Pad.Up) }
                Body("0.5% of each recent ObjectPad trade, read from Robinhood Chain.", Modifier.padding(horizontal = 6.dp), size = 12)
                if (routed.isEmpty()) Body("No trades yet.", Modifier.padding(10.dp))
                routed.forEach { t ->
                    val coin = app.coins.data?.firstOrNull { it.curve.equals(t.curve, true) }
                    Row(Modifier.fillMaxWidth().press { context.openUrl(Chain.txUrl(t.hash)) }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        CoinImage(coin?.logo, 32.dp, fallback = coin?.symbol ?: "")
                        Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong("\$${coin?.symbol ?: "COIN"} ${t.side}", size = 13); MonoText(Fmt.timeAgo(t.at), size = 10) }
                        Text(Fmt.eth(t.eth * 0.005, 6), style = Type.num)
                    }
                }
            }
        }
    }
}

/** The launch treasury: pays the launch fee, first buy and gas for every free launch. Balance read live from chain. */
@Composable
fun TreasuryScreen(app: AppUiState, onBack: () -> Unit) {
    val context = LocalContext.current
    val t = app.treasury
    var copied by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar("Launch treasury", onBack)
        LazyColumn(contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 60.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Raised(radius = 32.dp, padding = 22.dp) {
                    GlassIcon(Glass.Vault, 84.dp, float = true)
                    Display(t.balanceEth?.let { "%.4f ETH".format(it) } ?: "…", 40, Modifier.padding(top = 12.dp))
                    Body("Covers ${t.affordable} free launches · ${Fmt.money(t.costEth, app.ethUsd)} each · anyone can top it up.", Modifier.padding(top = 6.dp))
                    ProgressBar(if (t.affordable > 0) minOf(1f, t.affordable / 60f) else 0f, Modifier.padding(top = 14.dp))
                    Row(Modifier.padding(top = 14.dp)) { StatCell("Used today", "${t.usedToday}/${t.dailyLimit}", Modifier.weight(1f)); StatCell("Per person / day", t.perPerson.toString(), Modifier.weight(1f)) }
                }
            }
            t.address?.let { addr ->
                item {
                    Raised(radius = 28.dp) {
                        Lab("Fund it · ETH on Robinhood Chain")
                        Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) { Box(Modifier.clip(RoundedCornerShape(24.dp)).background(Pad.White).padding(18.dp)) { QrCode(addr, Modifier.size(200.dp)) } }
                        Sunk(Modifier.fillMaxWidth().press { context.copyText("Treasury", addr); copied = true }) { MonoText(addr, color = Pad.Ink, size = 12) }
                        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PadButton(if (copied) "Copied" else "Copy address", { context.copyText("Treasury", addr); copied = true }, Modifier.weight(1f), icon = if (copied) Icons.Default.Check else Icons.Default.ContentCopy, height = 50.dp)
                            PadButton("Blockscout", { context.openUrl(Chain.addressUrl(addr)) }, Modifier.weight(1f), style = BtnStyle.Glass, height = 50.dp)
                        }
                        Body("Only send ETH on Robinhood Chain (chain id ${Chain.ID}). Every free launch is paid from this address and is visible on-chain.", Modifier.padding(top = 10.dp), size = 12)
                    }
                }
            }
        }
    }
}

/** How it works, safety rules, live system status and verified activity. */
@Composable
fun InfoScreen(kind: String, app: AppUiState, onBack: () -> Unit, onCoin: (String) -> Unit) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar(when (kind) { "docs" -> "How it works"; "safety" -> "Safety & rights"; "status" -> "System status"; else -> "Verified activity" }, onBack)
        LazyColumn(contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 60.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (kind) {
                "docs" -> {
                    item { Lab("How it works · 4 stations"); Display("Real thing in. Coin out.", 36, Modifier.padding(top = 6.dp)) }
                    items(listOf(
                        Triple(Glass.Qr, "1 · Scan", "Your phone walks you around the object and shoots six angles by itself. Location data is removed."),
                        Triple(Glass.Ai, "2 · AI check", "AI names the object, screens out people, documents and screens, and compares it with every object on ObjectPad."),
                        Triple(Glass.Mesh, "3 · 3D model", "The photos become a full-colour 3D model. It’s validated and hashed; the hashes are sealed before launch."),
                        Triple(Glass.Rocket, "4 · Launch", "The ObjectPad treasury launches the coin on Robinhood Chain via Pons, paying the fee, gas and a burned first buy. You pay \$0."),
                    )) { (g, t, d) -> Raised(radius = 24.dp) { Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(g, 54.dp); Column(Modifier.padding(start = 12.dp)) { Strong(t); Body(d, size = 13) } } } }
                    item { Raised(radius = 24.dp) { Lab("On Robinhood Chain"); Strong("The object is written into its launch.", Modifier.padding(top = 6.dp)); Body("Its catalogue name, OP- tag and 3D fingerprint (triangles, vertices, proportions) are appended to the launch transaction, readable by anyone on Blockscout.", Modifier.padding(top = 4.dp), size = 13) } }
                    item { Raised(radius = 24.dp) { Lab("Fee split · 0.5 · 0.5 · 0.5"); Body("A 1.5% creator tax on every trade goes to the object’s fee vault and splits in thirds: buyback & burn of \$OBJECTPAD, the creator, and long-term holders. Pons keeps its own 1% protocol fee.", Modifier.padding(top = 6.dp), size = 13) } }
                    item { Notice("ObjectPad is not affiliated with Robinhood Markets, Inc. Coins carry no redemption right and no promise of value.") }
                }
                "safety" -> {
                    item { Lab("Safety and rights"); Display("What we accept.", 36, Modifier.padding(top = 6.dp)) }
                    items(listOf(
                        "Only physical objects you may photograph." to true, "One object, plain surface, even light." to true, "Each real object can become exactly one coin." to true,
                        "No people, faces or personal documents." to false, "No screens, photos of photos or archive images." to false, "No weapons, drugs or other prohibited items." to false,
                    )) { (t, ok) -> Raised(radius = 20.dp, padding = 12.dp) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(30.dp).clip(CircleShape).background(if (ok) Pad.Up else Pad.Down), contentAlignment = Alignment.Center) { Icon(if (ok) Icons.Default.Check else Icons.Default.Close, null, tint = Pad.White, modifier = Modifier.size(16.dp)) }; Body(t, Modifier.padding(start = 12.dp), weight = 700, color = Pad.Ink) } } }
                    item { Notice("A scan record does not prove legal ownership, authenticity or value. Report a coin from objectpad.fun if it breaks these rules.") }
                }
                "status" -> {
                    val s = app.status.data
                    item { Lab("System status · evidence, not assumptions"); Display(if (s?.mode == "launch_ready") "Everything is live." else "Not live until it is proven.", 34, Modifier.padding(top = 6.dp)) }
                    item { if (s != null) Notice(s.blocker, tone = if (s.mode == "launch_ready") Pad.Up else Pad.Ink) else Loading() }
                    items(s?.checks.orEmpty()) { c -> Raised(radius = 20.dp, padding = 14.dp) { Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(10.dp).clip(CircleShape).background(if (c.ready) Pad.Up else Pad.Down)); Strong(c.label, Modifier.padding(start = 12.dp).weight(1f), size = 14); MonoText(if (c.ready) "LIVE" else "PAUSED", color = if (c.ready) Pad.Up else Pad.Down) } } }
                    item { MonoText("CHAIN ${s?.chainId ?: Chain.ID} · ${Chain.RPC.removePrefix("https://")}", size = 10) }
                }
                else -> {
                    item { Lab("Verified activity"); Display("The archive, unfolding.", 34, Modifier.padding(top = 6.dp)) }
                    item { ActivityFeed(onCoin) }
                }
            }
            item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Chip("objectpad.fun", onClick = { context.openUrl(ObjectPadApi.SITE) }); Chip("Blockscout", onClick = { context.openUrl(Chain.EXPLORER) }) } }
        }
    }
}

@Composable
private fun ActivityFeed(onCoin: (String) -> Unit) {
    var feed by remember { mutableStateOf<PublicFeed?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { runCatching { ObjectPadApi.activity() }.onSuccess { feed = it }.onFailure { error = it.message } }
    val f = feed
    if (f == null) { if (error != null) Notice(error!!) else Loading(); return }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (f.items.isEmpty()) Body("No confirmed objects yet.")
        f.items.forEach { r ->
            Raised(Modifier.fillMaxWidth().press { onCoin(r.objectId) }, radius = 22.dp, padding = 12.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CoinImage(r.iconUrl ?: r.model.thumbnailUrl, 48.dp, fallback = r.symbol)
                    Column(Modifier.weight(1f).padding(start = 12.dp)) { Strong(r.verifiedName.ifBlank { r.publicName }, size = 15, maxLines = 1); MonoText("\$${r.symbol} · ${r.objectTag ?: ""}", size = 10) }
                    MonoText(r.confirmedAt?.let { Fmt.timeAgo(it) } ?: "", size = 10)
                }
            }
        }
    }
}

@Suppress("unused") private val keepSpacer: @Composable () -> Unit = { Spacer(Modifier.width(0.dp)) }
