package com.objectpad.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.objectpad.app.R
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ObjectCoin
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.CoinImage
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.Donut
import com.objectpad.app.ui.components.Glass
import com.objectpad.app.ui.components.GlassIcon
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.ProgressBar
import com.objectpad.app.ui.components.PulseDot
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.ScreenPadding
import com.objectpad.app.ui.components.SectionTitle
import com.objectpad.app.ui.components.Sparkline
import com.objectpad.app.ui.components.StatCell
import com.objectpad.app.ui.components.Steel
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.copyText
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.delay

private val WORDS = listOf("rubber duck", "Pepe figure", "apple", "grail kicks", "GM mug", "Game Boy", "pet rock", "graded card", "lucky hoodie", "cold pizza", "desk bull")

/** ObjectPad's showcase originals: real textured scans of meme-famous objects, with art served by objectpad.fun. */
object Exhibits {
    val ids = listOf("duck", "wojak", "pepe", "bull", "fine", "beanie", "frog", "rock", "sneaker", "console", "mug", "card", "squirrel", "pizza", "shiba", "banana", "hippo", "penguin")
    fun model(id: String) = "${ObjectPadApi.SITE}/models/memes/$id.glb"
    fun image(id: String) = "${ObjectPadApi.SITE}/assets/objects/$id.webp"
    fun coin(id: String) = "${ObjectPadApi.SITE}/assets/objects/coin-$id.webp"
}

@Composable
fun HomeScreen(app: AppUiState, onScan: () -> Unit, onClaim: () -> Unit, onCoin: (String) -> Unit, onCoins: () -> Unit, onBurn: () -> Unit, onTreasury: () -> Unit, onDocs: () -> Unit, resume: String?, onResume: (String) -> Unit) {
    val context = LocalContext.current
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Hero(onScan, onClaim) }
        if (resume != null) item {
            Raised(Modifier.fillMaxWidth().press { onResume(resume) }, radius = 22.dp, padding = 14.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Mesh, 40.dp); Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong("Scan in progress"); Body("Pick up where you left off.", size = 12) }; Icon(Icons.AutoMirrored.Filled.ArrowForward, null) }
            }
        }
        item { LiveStrip(app, onTreasury, onCoins) }
        item { CaPill(app) }
        item { SectionTitle("03 · Object coins", "Real things. Real charts.", action = { Chip("All coins", onClick = onCoins) }) }
        item {
            val coins = app.coins.data.orEmpty().take(8)
            if (coins.isEmpty()) Body(if (app.coins.loading) "Reading coins from Robinhood Chain…" else app.coins.error ?: "No coins yet.", size = 13)
            else LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(end = 16.dp)) { items(coins, key = { it.id }) { c -> SpecimenCard(c, app.ethUsd) { onCoin(c.id) } } }
        }
        item { FreeLaunch(app, onScan) }
        item { HowItWorks(onDocs) }
        item { FeeSplit(onBurn) }
        item { MarketStrip(app) }
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Image(painterResource(R.drawable.duck_mark), null, Modifier.size(56.dp))
                Body("ObjectPad is not affiliated with, endorsed by or officially connected with Robinhood Markets, Inc. A scan record does not prove ownership, authenticity or value. Coins carry no redemption right.", Modifier.padding(top = 8.dp), size = 11, align = TextAlign.Center)
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("objectpad.fun", onClick = { context.openUrl(ObjectPadApi.SITE) }); Chip("@ObjectPadFun on X", onClick = { context.openUrl("https://x.com/ObjectPadFun") })
                }
            }
        }
    }
}

@Composable
private fun Hero(onScan: () -> Unit, onClaim: () -> Unit) {
    var i by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) { delay(1800); i = (i + 1) % WORDS.size } }
    var ex by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) { delay(2600); ex = (ex + 1) % Exhibits.ids.size } }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) { Image(painterResource(R.drawable.duck_mark), null, Modifier.size(34.dp)); Spacer(Modifier.width(8.dp)); Lab("ObjectPad · physical-object launchpad") }
        Box(Modifier.fillMaxWidth().padding(top = 14.dp).height(260.dp).clip(RoundedCornerShape(34.dp)).background(Pad.steel).border(1.5.dp, Color.White, RoundedCornerShape(34.dp))) {
            AnimatedContent(ex, transitionSpec = { (fadeIn(tween(500)) + slideInVertically { it / 8 }) togetherWith fadeOut(tween(300)) }, label = "ex", modifier = Modifier.fillMaxSize()) { idx ->
                AsyncImage(Exhibits.image(Exhibits.ids[idx]), null, Modifier.fillMaxSize().padding(26.dp), contentScale = ContentScale.Fit)
            }
            Row(Modifier.align(Alignment.TopStart).padding(14.dp)) { Chip("Scan → 3D → coin", dot = Pad.Up) }
            AsyncImage(Exhibits.coin(Exhibits.ids[ex]), null, Modifier.align(Alignment.BottomEnd).padding(14.dp).size(54.dp).clip(CircleShape))
        }
        Display("Tokenize the physical world.", 44, Modifier.padding(top = 18.dp))
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Scan your ", style = Type.strong.copy(fontSize = 20.sp))
            AnimatedContent(i, transitionSpec = { (slideInVertically { it } + fadeIn()) togetherWith (slideOutVertically { -it } + fadeOut()) }, label = "word") { w -> Text(WORDS[w], style = Type.strong.copy(fontSize = 20.sp)) }
        }
        Text("We launch its coin. You pay $0.", style = Type.strong.copy(fontSize = 20.sp, color = Pad.Ink.copy(alpha = 0.72f)))
        PadButton("Scan & launch my coin", onScan, Modifier.fillMaxWidth().padding(top = 18.dp), glass = Glass.Qr, height = 70.dp)
        PadButton("Scan a QR from my computer", onClaim, Modifier.fillMaxWidth().padding(top = 10.dp), style = BtnStyle.Glass, icon = Icons.Default.QrCodeScanner)
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            listOf("$0 launch", "No account", "Full 3D", "1 object = 1 coin").forEach { t -> Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Check, null, Modifier.size(14.dp)); Text(t, style = Type.small.copy(fontSize = 12.sp, color = Pad.Ink.copy(alpha = 0.75f))) } }
        }
    }
}

@Composable
private fun LiveStrip(app: AppUiState, onTreasury: () -> Unit, onCoins: () -> Unit) {
    val t = app.treasury; val checks = app.status.data?.checks.orEmpty()
    Raised(radius = 26.dp, padding = 14.dp) {
        Row { StatCell("Launch treasury", t.balanceEth?.let { "%.4f ETH".format(it) } ?: "…", Modifier.weight(1f).press(onClick = onTreasury), Glass.Vault); StatCell("Free today", if (app.status.loading) "…" else if (t.open) "${t.launchesLeft} left" else "Topping up", Modifier.weight(1f), Glass.Rocket) }
        Spacer(Modifier.height(12.dp))
        Row { StatCell("Per launch · paid by us", Fmt.money(t.costEth, app.ethUsd), Modifier.weight(1f), Glass.Coins); StatCell("Coins live", app.market.data?.objectpad?.launched?.toString() ?: app.coins.data?.size?.toString() ?: "…", Modifier.weight(1f).press(onClick = onCoins), Glass.Chart) }
        Spacer(Modifier.height(12.dp))
        StatCell("Systems", if (checks.isEmpty()) "…" else "${checks.count { it.ready }}/${checks.size} live", glass = Glass.Shield, valueColor = if (checks.isNotEmpty() && checks.all { it.ready }) Pad.Up else Pad.Ink)
    }
}

@Composable
private fun CaPill(app: AppUiState) {
    val context = LocalContext.current
    val ca = app.status.data?.contracts?.token ?: app.burns.data?.token
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(if (ca != null) Pad.raised else Pad.sunk).border(1.dp, Pad.Ink08, RoundedCornerShape(50)).press(ca != null) { ca?.let { context.copyText("\$OBJECTPAD", it) } }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(Pad.Ink), contentAlignment = Alignment.Center) { Icon(if (ca != null) Icons.Default.ContentCopy else Icons.Default.Check, null, tint = Pad.White, modifier = Modifier.size(16.dp)) }
        Column(Modifier.padding(start = 12.dp)) {
            Strong(if (ca != null) "\$ObjectPad is live" else "\$ObjectPad · launching soon", size = 14)
            MonoText(if (ca != null) "CA: $ca" else "CA: drops here at launch", maxLines = 1, size = 11)
        }
    }
}

@Composable
fun SpecimenCard(c: ObjectCoin, ethUsd: Double?, onClick: () -> Unit) {
    Raised(Modifier.width(186.dp).press(onClick = onClick), radius = 26.dp, padding = 12.dp) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp)).background(Pad.steel)) {
            AsyncImage(if (c.kind == "original") Exhibits.image(c.id) else c.logo, c.name, Modifier.fillMaxSize().padding(if (c.kind == "original") 14.dp else 0.dp), contentScale = if (c.kind == "original") ContentScale.Fit else ContentScale.Crop)
            Box(Modifier.padding(8.dp)) { Chip(if (c.kind == "original") "Original" else c.tag ?: "Creator") }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            CoinImage(c.logo, 26.dp, fallback = c.symbol); Spacer(Modifier.width(6.dp))
            Strong("\$${c.symbol}", size = 15, maxLines = 1)
        }
        Body(c.name, size = 12, maxLines = 1)
        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { MonoText(Fmt.money(c.marketCapEth, ethUsd, 2), color = Pad.Ink, size = 13); Text(Fmt.pct(c.change24h), style = Type.num.copy(fontSize = 11.sp, color = if (c.change24h >= 0) Pad.Up else Pad.Down)) }
            Sparkline(c.spark, Modifier.width(56.dp).height(26.dp), c.change24h >= 0)
        }
    }
}

@Composable
private fun FreeLaunch(app: AppUiState, onScan: () -> Unit) {
    val t = app.treasury
    Raised(radius = 34.dp, padding = 20.dp) {
        Lab("02 · Free launch program")
        Display("We fund every launch.", 36, Modifier.padding(top = 10.dp))
        Body("Your phone scans it. Our treasury pays for it. It goes live.", Modifier.padding(top = 8.dp), size = 16, weight = 800)
        Steel(Modifier.fillMaxWidth().padding(top = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GlassIcon(Glass.Vault, 50.dp, float = true)
                Column(Modifier.padding(start = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { if (t.open) PulseDot(Pad.Up); MonoText("  LAUNCH TREASURY", size = 10) }
                    val v by animateFloatAsState((t.balanceEth ?: 0.0).toFloat(), tween(1200), label = "bal")
                    Display(if (t.balanceEth == null) "…" else "%.4f ETH".format(v), 30)
                }
            }
            ProgressBar(if (t.affordable > 0) minOf(1f, t.affordable / 60f) else 0f, Modifier.padding(top = 12.dp))
            Row(Modifier.padding(top = 8.dp)) { MonoText("COVERS ${t.affordable} LAUNCHES", Modifier.weight(1f), size = 10); MonoText("${Fmt.money(t.costEth, app.ethUsd)} EACH", size = 10) }
            MonoText("${t.perPerson} FREE / PERSON / DAY", Modifier.padding(top = 2.dp), size = 10)
        }
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("1" to "Scan", "2" to "3D build", "3" to "Coin live").forEach { (n, l) -> Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Pad.sunk).padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) { Display(n, 22); Text(l, style = Type.small.copy(fontSize = 12.sp, color = Pad.Ink)) } }
        }
        PadButton("Open the scanner", onScan, Modifier.fillMaxWidth().padding(top = 14.dp), glass = Glass.Qr)
    }
}

@Composable
private fun HowItWorks(onDocs: () -> Unit) {
    Column {
        SectionTitle("04 · Scan engine", "Phone camera in. Real 3D out.")
        Spacer(Modifier.height(12.dp))
        listOf(
            Triple(Glass.Qr, "Auto-shutter", "Six guided angles, shot by themselves"),
            Triple(Glass.Mesh, "Full-colour mesh", "~90K triangles, PBR textures"),
            Triple(Glass.Fingerprint, "AI fingerprint", "One object, one coin, ever"),
            Triple(Glass.Chain, "Written into the tx", "Name, tag and 3D specs on Robinhood Chain"),
        ).forEach { (g, t, d) ->
            Raised(Modifier.fillMaxWidth().padding(bottom = 8.dp), radius = 22.dp, padding = 10.dp) { Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(g, 48.dp); Column(Modifier.padding(start = 10.dp)) { Strong(t, size = 15); Body(d, size = 12) } } }
        }
        PadButton("How it works", onDocs, Modifier.padding(top = 4.dp), style = BtnStyle.Glass, height = 48.dp)
    }
}

@Composable
private fun FeeSplit(onBurn: () -> Unit) {
    Steel(radius = 34.dp, padding = 20.dp) {
        Lab("08 · Fee split"); Display("Every trade pays back.", 32, Modifier.padding(top = 8.dp))
        Donut(listOf(3333f to Pad.Graphite, 3334f to Color(0xFF7C8391), 3333f to Color(0xFFC3C8D1)), Modifier.padding(vertical = 18.dp).size(200.dp).align(Alignment.CenterHorizontally), thickness = 28.dp) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Display("1.5%", 38); MonoText("EVERY TRADE", size = 10) }
        }
        listOf(Triple(Glass.Burn, "Buyback & burn", "Buys \$OBJECTPAD and burns it"), Triple(Glass.Coins, "Creator", "Whoever scanned the object"), Triple(Glass.Diamond, "Diamond hands", "Longest holders earn most")).forEach { (g, t, d) ->
            Raised(Modifier.fillMaxWidth().padding(bottom = 8.dp), radius = 20.dp, padding = 10.dp) { Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(g, 44.dp); Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong(t, size = 15); Body(d, size = 12) }; Display("0.5%", 22) } }
        }
        PadButton("Watch the burn", onBurn, Modifier.fillMaxWidth().padding(top = 4.dp), glass = Glass.Burn, height = 54.dp)
    }
}

@Composable
private fun MarketStrip(app: AppUiState) {
    val context = LocalContext.current
    val m = app.market.data ?: return
    Column {
        SectionTitle("09 · Robinhood Chain", "The pad is moving.")
        Raised(Modifier.fillMaxWidth().padding(top = 12.dp), radius = 26.dp, padding = 14.dp) {
            Row { StatCell("Trades · ${m.windowSeconds / 60}m", m.totals.trades.toString(), Modifier.weight(1f)); StatCell("Volume", Fmt.money(m.totals.volumeEth, m.ethUsd), Modifier.weight(1f)); StatCell("ETH", Fmt.usd(m.ethUsd), Modifier.weight(1f)) }
            m.trades.take(8).forEach { tr ->
                Row(Modifier.fillMaxWidth().padding(top = 10.dp).press { context.openUrl(Chain.txUrl(tr.hash)) }, verticalAlignment = Alignment.CenterVertically) {
                    CoinImage(tr.logo, 30.dp, fallback = tr.symbol); Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) { Strong("\$${tr.symbol}", size = 14, maxLines = 1); MonoText("${Fmt.short(tr.trader)} · ${Fmt.timeAgo(tr.at)}", size = 10) }
                    Text("${if (tr.side == "buy") "Buy" else "Sell"} ${Fmt.eth(tr.eth, 4)}", style = Type.num.copy(color = if (tr.side == "buy") Pad.Up else Pad.Down))
                }
            }
        }
    }
}
