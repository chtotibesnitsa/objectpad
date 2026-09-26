package com.objectpad.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.GoldBrush
import com.objectpad.app.ui.components.GoldText
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.PairLogo
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.TopBar
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.theme.Mono
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type

private val NOTES = listOf(
    Triple("New", "Stock pairing at launch", "Pair your coin with any tokenized stock, ETF, commodity or asset Pons V2 approves: NVDA, TSLA, AAPL, SPCX, GME, SPY, GLD, USDG, cbBTC and more. ETH is still the default."),
    Triple("New", "AI pair suggestion", "After your scan, the AI suggests the stock whose story fits your object. One tap to use it, or keep ETH."),
    Triple("New", "Pay with ETH for paired coins", "Buying a stock-paired coin routes your ETH through Uniswap V3 on Robinhood Chain into the pair asset, then into the curve."),
    Triple("New", "Pairs across the market", "Every coin shows what it's paired with, with the company logo and the asset's live move. Filter the market by pair."),
    Triple("Shipped", "ObjectPad for iPhone", "Native iOS app in TestFlight and submitted for App Store review."),
)
private val STATUS = listOf(Triple("Web app", Pad.Up, "V2 live"), Triple("Android", Pad.Up, "V2 pairing"), Triple("iOS", Color(0xFFD9A521), "App Store review"), Triple("Launch engine", Pad.Up, "ETH & stock pairs"))
private val ROADMAP = listOf("iOS on the App Store" to "Public release once Apple review clears.", "One-signature paired buys" to "Swap, approve and buy in a single confirmation.", "Pair performance leaderboard" to "Which stocks carry the strongest object coins.", "Crafting Table" to "Combine object coins into new, rarer objects.")

/** ObjectPad V2 release notes and developer log, opened from the gold V2 pill. */
@Composable
fun V2Screen(app: AppUiState, onBack: () -> Unit, onScan: () -> Unit) {
    val context = LocalContext.current
    val movers = app.pairs?.assets.orEmpty().filter { it.kind in setOf("stock", "etf", "commodity") && it.priceUsd != null }.take(9)
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 60.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { TopBar("What's new", onBack) }
        item {
            Lab("Release · 26 Sep 2026 · V2.0")
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Display("ObjectPad", 38); Spacer(Modifier.width(8.dp))
                Box(Modifier.clip(RoundedCornerShape(50)).background(GoldBrush).padding(horizontal = 12.dp, vertical = 2.dp)) { Text("V2", style = Type.display(30).copy(color = GoldText)) }
            }
            Body("Real objects, now backed by real markets. Pair any scanned object with a tokenized stock and launch it on Robinhood Chain.", Modifier.padding(top = 8.dp))
        }
        item {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(24.dp)).background(Pad.Ink)) {
                AsyncImage("${ObjectPadApi.SITE}/v2/trailer-poster.webp", null, Modifier.fillMaxWidth().aspectRatio(16f / 9f), contentScale = ContentScale.Crop)
                PadButton("Watch the V2 trailer", { context.openUrl("${ObjectPadApi.SITE}/trailers/objectpad-v2-launch.mp4") }, Modifier.align(Alignment.BottomCenter).padding(12.dp), height = 46.dp)
            }
        }
        item {
            Lab("How pairing works")
            AsyncImage("${ObjectPadApi.SITE}/v2/duck_stock_coin_fusion.webp", "Object plus stock equals a paired coin", Modifier.padding(top = 8.dp).fillMaxWidth().aspectRatio(1.5f).clip(RoundedCornerShape(24.dp)), contentScale = ContentScale.Crop)
        }
        item { PadButton("Launch a paired coin", onScan, Modifier.fillMaxWidth()) }
        item {
            Raised(radius = 24.dp) {
                Strong("Release notes", size = 17)
                NOTES.forEach { (tag, title, body) ->
                    Row(Modifier.padding(top = 12.dp)) {
                        Box(Modifier.clip(RoundedCornerShape(50)).background(if (tag == "New") GoldBrush else androidx.compose.ui.graphics.SolidColor(Pad.Up.copy(alpha = 0.12f))).padding(horizontal = 6.dp, vertical = 2.dp)) {
                            Text(tag.uppercase(), style = TextStyle(fontFamily = Mono, fontWeight = FontWeight(800), fontSize = 9.5.sp, color = if (tag == "New") GoldText else Pad.Up))
                        }
                        Column(Modifier.padding(start = 10.dp)) { Strong(title, size = 15); Body(body, size = 13) }
                    }
                }
            }
        }
        item {
            Raised(radius = 24.dp) {
                Strong("Platform status", size = 17)
                STATUS.forEach { (name, color, note) -> Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(8.dp).clip(CircleShape).background(color)); Strong(name, Modifier.padding(start = 10.dp).weight(1f), size = 14); MonoText(note, size = 11) } }
            }
        }
        item {
            Raised(radius = 24.dp) {
                Strong("Next few days", size = 17)
                ROADMAP.forEach { (t, d) -> Column(Modifier.padding(top = 10.dp)) { Strong(t, size = 14); Body(d, size = 12) } }
            }
        }
        item {
            Lab("Pair assets · priced on-chain")
            if (movers.isEmpty()) Body("Reading pair prices from Robinhood Chain…", Modifier.padding(top = 8.dp), size = 13)
            movers.chunked(3).forEach { row ->
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { a ->
                        Raised(Modifier.weight(1f), radius = 16.dp, padding = 10.dp) {
                            Row(verticalAlignment = Alignment.CenterVertically) { PairLogo(a.logo, a.symbol, 20.dp); Strong(a.symbol, Modifier.padding(start = 5.dp), size = 13, maxLines = 1) }
                            MonoText(Fmt.usd(a.priceUsd ?: 0.0), color = Pad.Ink)
                            a.change24h?.let { Text(Fmt.pct(it), style = Type.num.copy(fontSize = 10.5.sp, color = if (it >= 0) Pad.Up else Pad.Down)) }
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        item { Body("Tokenized stocks on Robinhood Chain are issued by third parties. Pairing a coin with an asset gives holders no claim on that asset or company. Not affiliated with Robinhood Markets, Inc., Pons, or any listed company. Not financial advice.", size = 11) }
    }
}
