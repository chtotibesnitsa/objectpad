package com.objectpad.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.objectpad.app.data.ObjectCoin
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.CoinImage
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.ErrorCard
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.Loading
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.ProgressBar
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.Sparkline
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Sans
import com.objectpad.app.ui.theme.Type

private enum class Sort(val label: String) { Trending("Trending"), Newest("Newest"), Cap("Market cap"), Volume("24h volume"), Watch("Watchlist") }

/** Every ObjectPad coin with exact stats indexed from Robinhood Chain, refreshed every 10 seconds. */
@Composable
fun CoinsScreen(app: AppUiState, onCoin: (String) -> Unit, onRetry: () -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf(Sort.Trending) }
    var kind by rememberSaveable { mutableStateOf("all") }
    val list = remember(app.coins.data, q, sort, kind, app.watchlist) {
        app.coins.data.orEmpty().asSequence()
            .filter { kind == "all" || it.kind == kind }
            .filter { sort != Sort.Watch || it.id in app.watchlist }
            .filter { q.isBlank() || it.name.contains(q, true) || it.symbol.contains(q, true) || (it.objectName?.contains(q, true) ?: false) || it.tag?.contains(q, true) == true }
            .let { s -> when (sort) { Sort.Trending, Sort.Watch -> s.sortedWith(compareByDescending<ObjectCoin> { it.kind == "creator" }.thenByDescending { it.trending }.thenByDescending { it.volume24hEth }); Sort.Newest -> s.sortedByDescending { it.launchedAt }; Sort.Cap -> s.sortedByDescending { it.marketCapEth }; Sort.Volume -> s.sortedByDescending { it.volume24hEth } } }
            .toList()
    }
    LazyColumn(contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Lab("Explore · Robinhood Chain"); Display("Object coins.", 40, Modifier.padding(top = 6.dp)) }
        item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Pad.White).border(1.5.dp, Pad.Ink.copy(alpha = 0.1f), RoundedCornerShape(50)).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Search, null, tint = Pad.Muted, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(10.dp))
                BasicTextField(q, { q = it }, singleLine = true, textStyle = Type.body.copy(fontFamily = Sans), cursorBrush = SolidColor(Pad.Ink), modifier = Modifier.weight(1f),
                    decorationBox = { inner -> if (q.isEmpty()) Text("Search name, ticker or OP- tag", style = Type.body.copy(color = Pad.Ink.copy(alpha = 0.35f))); inner() })
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(Sort.entries.toList()) { s -> Chip(s.label, selected = sort == s, onClick = { sort = s }) }
                item { Spacer(Modifier.width(6.dp)) }
                items(listOf("all" to "All", "creator" to "Creators", "original" to "Originals")) { (k, l) -> Chip(l, selected = kind == k, onClick = { kind = k }) }
            }
        }
        if (app.building.isNotEmpty()) item {
            Raised(radius = 22.dp, padding = 14.dp) {
                Lab("Building now · launches when its 3D model lands")
                app.building.forEach { b -> Column(Modifier.padding(top = 10.dp)) { Row { Strong("\$${b.symbol}", Modifier.weight(1f), size = 14); MonoText(b.stage.uppercase(), size = 10) }; ProgressBar((b.progress / 100).toFloat(), Modifier.padding(top = 6.dp), height = 6.dp) } }
            }
        }
        when {
            app.coins.data == null && app.coins.loading -> item { Loading("Reading coins from Robinhood Chain…") }
            app.coins.data == null -> item { ErrorCard(app.coins.error ?: "Coins could not be loaded.", onRetry) }
            list.isEmpty() -> item { Body(if (sort == Sort.Watch) "Tap the star on any coin to follow it here." else "No coins match “$q”.", Modifier.padding(20.dp)) }
            else -> items(list, key = { it.id }) { c -> CoinRow(c, app.ethUsd, c.id in app.watchlist) { onCoin(c.id) } }
        }
        item { MonoText("LIVE FROM ROBINHOOD CHAIN · UPDATED ${app.coins.at.takeIf { it > 0 }?.let { Fmt.timeAgo(it).uppercase() } ?: "—"}", Modifier.padding(top = 6.dp), size = 10) }
    }
}

@Composable
fun CoinRow(c: ObjectCoin, ethUsd: Double?, watched: Boolean, onClick: () -> Unit) {
    Raised(Modifier.fillMaxWidth().press(onClick = onClick), radius = 22.dp, padding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CoinImage(c.logo, 48.dp, fallback = c.symbol)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Strong("\$${c.symbol}", size = 15, maxLines = 1)
                    if (watched) Icon(Icons.Default.Star, null, tint = Pad.Ink, modifier = Modifier.padding(start = 4.dp).size(13.dp))
                    if (c.state == "launching") Box(Modifier.padding(start = 6.dp)) { Chip("Launching") }
                }
                Body(c.name, size = 12, maxLines = 1)
                MonoText("${c.holders} holders · ${c.trades24h} trades 24h", size = 10, maxLines = 1)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(Fmt.money(c.marketCapEth, ethUsd, 2), style = Type.num.copy(fontSize = 14.sp))
                Text(Fmt.pct(c.change24h), style = Type.num.copy(fontSize = 12.sp, color = if (c.change24h >= 0) Pad.Up else Pad.Down))
                Sparkline(c.spark, Modifier.padding(top = 4.dp).width(60.dp).height(20.dp), c.change24h >= 0)
            }
        }
        if (!c.graduated && c.progress > 0) ProgressBar(c.progress.toFloat(), Modifier.padding(top = 10.dp), height = 4.dp)
    }
}
