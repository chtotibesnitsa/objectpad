package com.objectpad.app.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.objectpad.app.data.CoinPair
import com.objectpad.app.data.PairCatalog
import com.objectpad.app.data.PairQuote
import com.objectpad.app.data.PairSuggestion
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.theme.Mono
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Sans
import com.objectpad.app.ui.theme.Type

val GoldText = Color(0xFF3A2A05)
val GoldBrush = Brush.verticalGradient(listOf(Color(0xFFFCE7A2), Color(0xFFF2C94C), Color(0xFFD9A521)))
val GoldTint = Color(0xFFFFF8E6)
val GoldLine = Color(0xFFD9A521)

/** Gold "V2" pill next to the ObjectPad wordmark; opens the V2 release notes. */
@Composable
fun V2Pill(onClick: () -> Unit, modifier: Modifier = Modifier, label: String = "V2", small: Boolean = false) {
    val t = rememberInfiniteTransition(label = "v2")
    val a by t.animateFloat(1f, 0.4f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a")
    Row(
        modifier.clip(RoundedCornerShape(50)).background(GoldBrush).border(1.dp, GoldLine.copy(alpha = 0.6f), RoundedCornerShape(50)).press(onClick = onClick)
            .heightIn(min = if (small) 22.dp else 26.dp).padding(horizontal = if (small) 8.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = TextStyle(fontFamily = Mono, fontWeight = FontWeight(800), fontSize = if (small) 10.sp else 11.5.sp, color = GoldText))
        Spacer(Modifier.width(4.dp)); Box(Modifier.size(5.dp).clip(CircleShape).background(GoldText.copy(alpha = 0.7f * a)))
    }
}

/** "Paired with NVDA" capsule used on rows and coin pages. */
@Composable
fun PairBadge(pair: CoinPair, modifier: Modifier = Modifier, showChange: Boolean = false) {
    Row(modifier.clip(RoundedCornerShape(50)).background(Pad.White).border(1.dp, Pad.Ink.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(start = 2.dp, end = 8.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        CoinImage(pair.logo, 16.dp, fallback = pair.symbol); Spacer(Modifier.width(4.dp))
        Text(pair.symbol, style = Type.num.copy(fontSize = 10.5.sp, fontWeight = FontWeight(800)))
        val c = pair.change24h
        if (showChange && c != null) Text(" " + Fmt.pct(c), style = Type.num.copy(fontSize = 10.sp, color = if (c >= 0) Pad.Up else Pad.Down))
    }
}

@Composable
private fun GoldTag(text: String) = Box(Modifier.clip(RoundedCornerShape(50)).background(GoldBrush).padding(horizontal = 6.dp, vertical = 1.dp)) { Text(text, style = TextStyle(fontFamily = Mono, fontWeight = FontWeight(800), fontSize = 9.5.sp, color = GoldText)) }

@Composable
fun PairLogo(url: String?, symbol: String, size: Dp) = CoinImage(url, size, fallback = symbol)

/**
 * V2 pair selector for the coin form: ETH by default, the AI pick as a one-tap suggestion, and a searchable list of every
 * asset the Pons V2 factory approves, with company logos and live on-chain prices.
 */
@Composable
fun PairPicker(app: AppUiState, selection: String, onSelect: (String) -> Unit, suggestion: PairSuggestion?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    var open by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("popular") }
    val assets = app.pairs?.assets.orEmpty().filter { it.approved }
    val selected = app.pair(selection)
    val paired = !PairCatalog.isEth(selection)
    val suggested = suggestion?.let { s -> assets.firstOrNull { it.address.equals(s.address, true) } }
    val shape = RoundedCornerShape(22.dp)
    Column(modifier.fillMaxWidth().clip(shape).background(if (paired) GoldTint else Pad.White).border(1.5.dp, if (paired) GoldLine.copy(alpha = 0.6f) else Pad.Ink.copy(alpha = 0.1f), shape).padding(14.dp).animateContentSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Pair with a stock", style = Type.strong.copy(fontSize = 14.5.sp)); Spacer(Modifier.width(6.dp)); GoldTag("V2")
            Spacer(Modifier.weight(1f)); MonoText("${assets.size} LIVE", size = 10)
        }
        Row(Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pad.sunk).press(enabled) { open = !open }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            PairLogo(selected?.logo, selected?.symbol ?: "ETH", 36.dp)
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Strong(selected?.let { "${it.symbol} · ${it.name}" } ?: "ETH · Ether", size = 15, maxLines = 1)
                Body(if (paired) "Coin trades against this asset" else "Default · coin trades against ETH", size = 12, maxLines = 1)
            }
            if (paired) selected?.priceUsd?.let { MonoText(Fmt.usd(it), color = Pad.Ink) }
            Spacer(Modifier.width(6.dp)); MonoText(if (open) "CLOSE" else "CHANGE", size = 10)
        }
        if (!open && enabled && suggested != null && !suggested.address.equals(selection, true)) {
            Row(Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pad.Ink).press { onSelect(suggested.address.lowercase()) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AutoAwesome, null, tint = Color(0xFFF2C94C), modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp))
                PairLogo(suggested.logo, suggested.symbol, 24.dp)
                Column(Modifier.weight(1f).padding(horizontal = 8.dp)) { Strong("AI suggests ${suggested.symbol}", size = 13, color = Pad.White); Body(suggestion.reason, size = 11, color = Pad.White.copy(alpha = 0.7f), maxLines = 2) }
                Box(Modifier.clip(RoundedCornerShape(50)).background(Pad.White).padding(horizontal = 12.dp, vertical = 6.dp)) { Text("Use", style = Type.strong.copy(fontSize = 12.sp)) }
            }
        }
        if (!open && paired && enabled) Text("Switch back to ETH", style = Type.small.copy(fontWeight = FontWeight(800)), modifier = Modifier.padding(top = 8.dp).press { onSelect("") })
        if (open) {
            val shape2 = RoundedCornerShape(14.dp)
            Box(Modifier.padding(top = 10.dp).fillMaxWidth().clip(shape2).background(Pad.White).border(1.dp, Pad.Ink.copy(alpha = 0.12f), shape2).padding(12.dp)) {
                BasicTextField(query, { query = it }, singleLine = true, textStyle = TextStyle(fontFamily = Sans, fontWeight = FontWeight(700), fontSize = 14.sp, color = Pad.Ink), cursorBrush = SolidColor(Pad.Ink), modifier = Modifier.fillMaxWidth(),
                    decorationBox = { inner -> if (query.isEmpty()) Text("Search NVDA, Tesla, gold…", style = Type.small); inner() })
            }
            if (query.isBlank()) Row(Modifier.padding(top = 8.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) { PairCatalog.kinds.forEach { (id, label) -> Chip(label, selected = kind == id, onClick = { kind = id }) } }
            val list: List<PairQuote> = when {
                query.isNotBlank() -> assets.filter { "${it.symbol} ${it.name} ${it.sector.orEmpty()}".contains(query, true) }
                kind == "popular" -> PairCatalog.popular.mapNotNull { s -> assets.firstOrNull { it.symbol == s } }
                kind == "all" -> assets
                else -> assets.filter { it.kind == kind }
            }
            Column(Modifier.padding(top = 6.dp)) {
                list.take(40).forEach { a ->
                    val on = if (PairCatalog.isEth(selection)) a.isEth else a.address.equals(selection, true)
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (on) Pad.Ink.copy(alpha = 0.07f) else Color.Transparent).press { onSelect(if (a.isEth) "" else a.address.lowercase()); open = false }.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        PairLogo(a.logo, a.symbol, 30.dp)
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) { Strong(a.symbol, size = 14); if (suggestion?.address.equals(a.address, true)) Icon(Icons.Default.AutoAwesome, null, tint = GoldLine, modifier = Modifier.padding(start = 4.dp).size(12.dp)) }
                            Body(listOfNotNull(a.name, a.sector).joinToString(" · "), size = 11, maxLines = 1)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            MonoText(a.priceUsd?.let { Fmt.usd(it) } ?: "—", color = Pad.Ink)
                            a.change24h?.let { Text(Fmt.pct(it), style = Type.num.copy(fontSize = 11.sp, color = if (it >= 0) Pad.Up else Pad.Down)) }
                        }
                        if (on) Icon(Icons.Default.Check, null, modifier = Modifier.padding(start = 6.dp).size(16.dp))
                    }
                }
                if (list.isEmpty()) Body(if (app.pairs == null) "Reading prices from Robinhood Chain…" else "No matching asset.", Modifier.padding(8.dp), size = 13)
            }
        }
        Body("Buyers pay in ETH; it routes on-chain into the pair asset. Pairing gives no claim on the company or asset.", Modifier.padding(top = 8.dp), size = 11)
    }
}
