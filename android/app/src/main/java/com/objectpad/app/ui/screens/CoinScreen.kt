package com.objectpad.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.Abi
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ChainClient
import com.objectpad.app.data.CoinHolder
import com.objectpad.app.data.CoinTrade
import com.objectpad.app.data.ObjectCoin
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.data.ObjectRecord
import com.objectpad.app.data.TxRequest
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.CoinImage
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.Divider
import com.objectpad.app.ui.components.Glass
import com.objectpad.app.ui.components.GlassIcon
import com.objectpad.app.ui.components.IconCircle
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.Loading
import com.objectpad.app.ui.components.ModelSource
import com.objectpad.app.ui.components.ModelViewer
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.Notice
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.ProgressBar
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.StatCell
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.Sunk
import com.objectpad.app.ui.components.TopBar
import com.objectpad.app.ui.components.copyText
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.components.shareText
import com.objectpad.app.ui.theme.Mono
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.math.BigInteger

/** One coin: its real 3D object, live chart from curve logs, trades, holders, the on-chain record and native trading. */
@Composable
fun CoinScreen(id: String, app: AppUiState, onBack: () -> Unit, onToggleWatch: (String) -> Unit, onRefreshHoldings: () -> Unit, onSignIn: () -> Unit) {
    val context = LocalContext.current
    val coin = app.coin(id)
    var record by remember(id) { mutableStateOf<ObjectRecord?>(null) }
    var trades by remember(id) { mutableStateOf<List<CoinTrade>?>(null) }
    var holders by remember(id) { mutableStateOf<List<CoinHolder>?>(null) }
    var holderCount by remember(id) { mutableStateOf(0) }
    var tab by remember { mutableStateOf("trades") }

    LaunchedEffect(coin?.id, coin?.kind) { if (coin?.kind == "creator") record = runCatching { ObjectPadApi.record(coin.id) }.getOrNull() }
    LaunchedEffect(coin?.curve) {
        val curve = coin?.curve ?: return@LaunchedEffect
        while (true) { runCatching { ObjectPadApi.curveTrades(curve) }.onSuccess { trades = it.trades }; delay(8_000) }
    }
    LaunchedEffect(coin?.curve) {
        val curve = coin?.curve ?: return@LaunchedEffect
        while (true) { runCatching { ObjectPadApi.holders(curve) }.onSuccess { holders = it.holders; holderCount = it.count }; delay(20_000) }
    }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar(coin?.let { "\$${it.symbol}" } ?: "Coin", onBack) {
            if (coin != null) {
                IconCircle(if (coin.id in app.watchlist) Icons.Default.Star else Icons.Default.StarBorder, "Watch", { onToggleWatch(coin.id) })
                Spacer(Modifier.width(8.dp))
                IconCircle(Icons.Default.Share, "Share", { context.shareText("\$${coin.symbol} on ObjectPad — ${coin.name}. ${ObjectPadApi.SITE}${coin.path}") })
            }
        }
        if (coin == null) { if (app.coins.loading) Loading("Reading the coin…") else Body("This coin isn’t live yet, or doesn’t exist.", Modifier.padding(20.dp)); return@Column }
        LazyColumn(contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 80.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { ObjectStage(coin, record) }
            item { Header(coin, app.ethUsd) }
            item { Chart(trades, coin, app.ethUsd) }
            item { TradePanel(coin, app, onRefreshHoldings, onSignIn) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { Chip("Trades", selected = tab == "trades", onClick = { tab = "trades" }); Chip("Holders · $holderCount", selected = tab == "holders", onClick = { tab = "holders" }); Chip("Object record", selected = tab == "record", onClick = { tab = "record" }) }
            }
            item {
                when (tab) {
                    "trades" -> TradesList(trades, coin.symbol)
                    "holders" -> HoldersList(holders)
                    else -> RecordCard(coin, record)
                }
            }
            item { FeesCard() }
        }
    }
}

@Composable
private fun ObjectStage(coin: ObjectCoin, record: ObjectRecord?) {
    val url = if (coin.kind == "original") Exhibits.model(coin.id) else record?.model?.modelUrl
    Box(Modifier.fillMaxWidth().height(340.dp).clip(RoundedCornerShape(32.dp)).background(Brush.radialGradient(listOf(Color.White, Pad.Stone, Pad.Steel))).border(1.5.dp, Color.White, RoundedCornerShape(32.dp))) {
        if (url != null) ModelViewer(ModelSource(url), Modifier.fillMaxSize()) else if (coin.kind == "creator") Loading("Loading the scan…", Modifier.align(Alignment.Center))
        Column(Modifier.padding(16.dp)) {
            Lab(if (coin.kind == "original") "ObjectPad original" else coin.tag ?: "Creator scan")
            Display(coin.objectName ?: coin.name, 24, Modifier.padding(top = 4.dp))
        }
        Row(Modifier.align(Alignment.BottomStart).padding(14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip("Drag 360°"); record?.model?.triangles?.takeIf { it > 0 }?.let { Chip("${"%,d".format(it)} tris") }
        }
    }
}

@Composable
private fun Header(c: ObjectCoin, ethUsd: Double?) {
    Raised(radius = 26.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CoinImage(c.logo, 54.dp, fallback = c.symbol)
            Column(Modifier.weight(1f).padding(start = 12.dp)) { Strong(c.name, size = 18, maxLines = 1); MonoText("\$${c.symbol} · ${Fmt.short(c.token)}"); c.pair?.let { com.objectpad.app.ui.components.PairBadge(it, Modifier.padding(top = 4.dp), showChange = true) } }
            Column(horizontalAlignment = Alignment.End) {
                Text(Fmt.price(c.priceEth, ethUsd), style = Type.num.copy(fontSize = 17.sp))
                Text(Fmt.pct(c.change24h) + " 24h", style = Type.num.copy(fontSize = 12.sp, color = if (c.change24h >= 0) Pad.Up else Pad.Down))
            }
        }
        Row(Modifier.padding(top = 14.dp)) {
            StatCell("Market cap", Fmt.money(c.marketCapEth, ethUsd, 2), Modifier.weight(1f)); StatCell("Vol 24h", Fmt.money(c.volume24hEth, ethUsd, 3), Modifier.weight(1f)); StatCell("Holders", c.holders.toString(), Modifier.weight(0.7f))
        }
        Row(Modifier.padding(top = 12.dp)) { StatCell("Buys / sells 24h", "${c.buys24h} / ${c.sells24h}", Modifier.weight(1f)); StatCell("Curve", if (c.graduated) "Graduated" else "${(c.progress * 100).let { "%.1f".format(it) }}%", Modifier.weight(1f)) }
        if (!c.graduated) ProgressBar(c.progress.toFloat(), Modifier.padding(top = 10.dp), height = 6.dp)
    }
}

@Composable
private fun Chart(trades: List<CoinTrade>?, coin: ObjectCoin, ethUsd: Double?) {
    Raised(radius = 26.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) { Lab("Chart · from curve logs", Modifier.weight(1f)); MonoText(trades?.let { "${it.size} TRADES" } ?: "…", size = 10) }
        val pts = trades?.filter { it.price > 0 }?.map { it.price }.orEmpty().ifEmpty { coin.spark }
        if (pts.size < 2) Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) { Body(if (trades == null) "Reading trades…" else "Not enough trades for a chart yet.", size = 13) }
        else {
            val up = pts.last() >= pts.first()
            val color = if (up) Pad.Up else Pad.Down
            Canvas(Modifier.fillMaxWidth().height(180.dp).padding(top = 10.dp)) {
                val min = pts.min(); val max = pts.max(); val span = (max - min).takeIf { it > 0 } ?: max * 0.1 + 1e-18
                val path = Path(); val fill = Path()
                pts.forEachIndexed { i, v ->
                    val x = size.width * i / (pts.size - 1); val y = (size.height * (1 - (v - min) / span)).toFloat() * 0.9f + size.height * 0.05f
                    if (i == 0) { path.moveTo(x, y); fill.moveTo(x, size.height); fill.lineTo(x, y) } else { path.lineTo(x, y); fill.lineTo(x, y) }
                }
                fill.lineTo(size.width, size.height); fill.close()
                drawPath(fill, Brush.verticalGradient(listOf(color.copy(alpha = 0.22f), Color.Transparent)))
                drawPath(path, color, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round))
                for (k in 1..3) drawLine(Pad.Ink.copy(alpha = 0.05f), Offset(0f, size.height * k / 4), Offset(size.width, size.height * k / 4), 1f)
            }
            Row(Modifier.padding(top = 6.dp)) { MonoText("LOW ${Fmt.price(pts.min(), ethUsd)}", Modifier.weight(1f), size = 10); MonoText("HIGH ${Fmt.price(pts.max(), ethUsd)}", size = 10) }
        }
    }
}

@Composable
private fun TradePanel(coin: ObjectCoin, app: AppUiState, onRefreshHoldings: () -> Unit, onSignIn: () -> Unit) {
    val context = LocalContext.current
    val manager = ObjectPadApp.instance.account
    val account by manager.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var side by remember { mutableStateOf("buy") }
    var amount by remember { mutableStateOf("") }
    var slippage by remember { mutableStateOf(300) }
    var quote by remember { mutableStateOf<BigInteger?>(null) }
    var quoting by remember { mutableStateOf(false) }
    var quoteError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var lastHash by remember { mutableStateOf<String?>(null) }
    var confirmed by remember { mutableStateOf(false) }
    var ethBal by remember { mutableStateOf<BigInteger?>(null) }
    var tokenBal by remember { mutableStateOf<BigInteger?>(null) }
    val wallet = account.activeWallet
    val units = Chain.parseAmount(amount)

    suspend fun loadBalances() { val w = wallet ?: return; ethBal = runCatching { ChainClient.balance(w) }.getOrNull(); tokenBal = runCatching { ChainClient.tokenBalance(coin.token, w) }.getOrNull() }
    LaunchedEffect(wallet, coin.token) { while (true) { loadBalances(); delay(20_000) } }
    LaunchedEffect(units, side, wallet) {
        quote = null; quoteError = null
        val u = units ?: return@LaunchedEffect
        if (side == "sell" && wallet == null) return@LaunchedEffect
        delay(350); quoting = true
        val pq = coin.pair?.let { app.pair(it.address) }
        runCatching {
            if (side == "buy" && coin.pair != null) { val r = pq?.route ?: throw IllegalStateException("No route"); com.objectpad.app.data.PairTrade.curveBuy(coin.curve, com.objectpad.app.data.PairTrade.quoteSwap(r, u, app.pairs?.router?.quoter)) }
            else if (side == "buy") ChainClient.quoteBuy(coin.curve, u) else ChainClient.quoteSell(coin.curve, wallet!!, u)
        }
            .onSuccess { quote = it }.onFailure { quoteError = "Unavailable" }
        quoting = false
    }
    val balance = if (side == "buy") ethBal else tokenBal
    val spendable = balance?.let { if (side == "buy") (it - Chain.GAS_RESERVE).max(BigInteger.ZERO) else it }
    val insufficient = units != null && balance != null && units > balance
    val minOut = quote?.let { it * BigInteger.valueOf(10_000L - slippage) / BigInteger.valueOf(10_000) }

    fun trade() {
        val u = units ?: return
        busy = "Confirming…"; error = null; lastHash = null; confirmed = false
        scope.launch {
            try {
                val signer = manager.signer()
                val pair = coin.pair
                if (side == "buy" && pair != null) {
                    // Stock-paired: ETH -> pair asset on Uniswap V3, approve the curve, then buy. Each leg is quoted on-chain.
                    val route = app.pair(pair.address)?.route ?: throw IllegalStateException("No on-chain ETH route to ${pair.symbol} right now.")
                    val router = app.pairs?.router?.swapRouter?.ifBlank { null } ?: com.objectpad.app.data.PairTrade.FALLBACK_ROUTER
                    val ten = BigInteger.valueOf(10_000); val keep = BigInteger.valueOf(10_000L - slippage)
                    val quoted = com.objectpad.app.data.PairTrade.quoteSwap(route, u, app.pairs?.router?.quoter)
                    val before = ChainClient.tokenBalance(pair.address, signer.address)
                    busy = "1/3 Swapping ETH → ${pair.symbol}…"
                    val h1 = signer.send(TxRequest(router, com.objectpad.app.data.PairTrade.swapData(route, signer.address, u, quoted * keep / ten), u)); ChainClient.waitForReceipt(h1)
                    val received = ChainClient.tokenBalance(pair.address, signer.address) - before
                    if (received <= BigInteger.ZERO) throw IllegalStateException("The swap to ${pair.symbol} returned nothing.")
                    if (ChainClient.allowance(pair.address, signer.address, coin.curve) < received) { busy = "2/3 Approving ${pair.symbol}…"; val h2 = signer.send(TxRequest(pair.address, Abi.approve(coin.curve, received))); ChainClient.waitForReceipt(h2) }
                    val minimum = com.objectpad.app.data.PairTrade.curveBuy(coin.curve, received) * keep / ten
                    if (minimum <= BigInteger.ZERO) throw IllegalStateException("The curve would return nothing for this amount.")
                    busy = "3/3 Buying \$${coin.symbol}…"
                    val h3 = signer.send(TxRequest(coin.curve, Abi.buy(received, minimum, signer.address), BigInteger.ZERO))
                    lastHash = h3; ChainClient.waitForReceipt(h3); confirmed = true
                    ObjectPadApp.instance.sounds.play("launch"); amount = ""; loadBalances(); onRefreshHoldings()
                    return@launch
                }
                val expected = if (side == "buy") ChainClient.quoteBuy(coin.curve, u) else ChainClient.quoteSell(coin.curve, signer.address, u)
                val minimum = expected * BigInteger.valueOf(10_000L - slippage) / BigInteger.valueOf(10_000)
                if (minimum <= BigInteger.ZERO) throw IllegalStateException("The curve would return nothing for this amount.")
                if (side == "sell" && ChainClient.allowance(coin.token, signer.address, coin.curve) < u) {
                    busy = "Approving \$${coin.symbol}…"
                    val h = signer.send(TxRequest(coin.token, Abi.approve(coin.curve, u)))
                    ChainClient.waitForReceipt(h)
                }
                busy = if (side == "buy") "Buying…" else "Selling…"
                val data = if (side == "buy") Abi.buy(u, minimum, signer.address) else Abi.sell(u, minimum, signer.address)
                val hash = signer.send(TxRequest(coin.curve, data, if (side == "buy") u else BigInteger.ZERO))
                lastHash = hash; busy = "Confirming on-chain…"
                ChainClient.waitForReceipt(hash); confirmed = true
                ObjectPadApp.instance.sounds.play("launch"); amount = ""
                loadBalances(); onRefreshHoldings()
            } catch (e: Exception) { error = e.message?.lineSequence()?.firstOrNull() ?: "The trade didn’t go through. Nothing was sent." }
            finally { busy = null }
        }
    }

    Raised(radius = 28.dp) {
        Lab("Trade \$${coin.symbol}")
        coin.pair?.let { p -> Notice(if (side == "buy") "Paired with ${p.symbol}. Pay with ETH; it routes on-chain into ${p.symbol} (swap, approve, buy)." else "Paired with ${p.symbol}. Sells pay out in ${p.symbol}.", Modifier.padding(top = 8.dp)) }
        Row(Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pad.Ink.copy(alpha = 0.07f)).padding(4.dp)) {
            listOf("buy", "sell").forEach { s ->
                Box(Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).background(if (side == s) (if (s == "buy") Pad.Up else Pad.Down) else Color.Transparent).press { side = s; amount = "" }, contentAlignment = Alignment.Center) {
                    Text(s.replaceFirstChar { it.uppercase() }, style = Type.strong.copy(color = if (side == s) Pad.White else Pad.Ink.copy(alpha = 0.6f)))
                }
            }
        }
        if (coin.graduated) { Notice("This coin graduated off its curve. Curve trades are closed.", Modifier.padding(top = 12.dp)); return@Raised }
        Column(Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Pad.White).border(2.dp, if (insufficient) Pad.Down else Pad.Ink.copy(alpha = 0.1f), RoundedCornerShape(18.dp)).padding(14.dp)) {
            Row { Text(if (side == "buy") "You pay" else "You sell", style = Type.small.copy(fontSize = 13.sp, color = Pad.Ink.copy(alpha = 0.7f)), modifier = Modifier.weight(1f)); MonoText(balance?.let { if (side == "buy") "${Chain.formatUnits(it, 5)} ETH" else "${Fmt.compact(Chain.toEth(it))} \$${coin.symbol}" } ?: "—", size = 11) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(amount, { amount = it.replace(',', '.').filter { c -> c.isDigit() || c == '.' } }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = Type.display(30).copy(fontFamily = Mono), cursorBrush = SolidColor(Pad.Ink), modifier = Modifier.weight(1f).padding(top = 4.dp),
                    decorationBox = { inner -> if (amount.isEmpty()) Text("0.0", style = Type.display(30).copy(fontFamily = Mono, color = Pad.Ink.copy(alpha = 0.2f))); inner() })
                Box(Modifier.clip(RoundedCornerShape(50)).background(Pad.Ink).padding(horizontal = 12.dp, vertical = 7.dp)) { Text(if (side == "buy") "ETH" else "\$${coin.symbol}", style = Type.strong.copy(color = Pad.White, fontSize = 13.sp)) }
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(25, 50, 75, 100).forEach { p -> Box(Modifier.weight(1f).heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).background(Pad.Ink.copy(alpha = 0.07f)).press(spendable != null) { spendable?.let { amount = Chain.formatUnits(it * BigInteger.valueOf(p.toLong()) / BigInteger.valueOf(100), 8) } }, contentAlignment = Alignment.Center) { Text(if (p == 100) "Max" else "$p%", style = Type.strong.copy(fontSize = 13.sp)) } }
        }
        Sunk(Modifier.fillMaxWidth().padding(top = 10.dp)) {
            Text("You receive", style = Type.small.copy(fontSize = 13.sp))
            Text(when { units == null -> "—"; quoting -> "Quoting…"; quoteError != null -> "Unavailable"; quote != null -> if (side == "buy") "${Fmt.compact(Chain.toEth(quote!!))} \$${coin.symbol}" else "${Chain.formatUnits(quote!!, 6)} ETH"; side == "sell" && wallet == null -> "Connect to quote"; else -> "—" }, style = Type.display(22).copy(fontFamily = Mono))
            minOut?.let { MonoText("Min. after ${slippage / 100.0}% slippage: ${if (side == "buy") Fmt.compact(Chain.toEth(it)) else Chain.formatUnits(it, 6)}", size = 11) }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Slippage", style = Type.small.copy(fontSize = 13.sp, color = Pad.Ink.copy(alpha = 0.7f)), modifier = Modifier.weight(1f))
            listOf(100, 300, 500).forEach { v -> Box(Modifier.padding(start = 4.dp).clip(RoundedCornerShape(10.dp)).background(if (slippage == v) Pad.Ink else Pad.Ink.copy(alpha = 0.07f)).press { slippage = v }.padding(horizontal = 12.dp, vertical = 8.dp)) { Text("${v / 100}%", style = Type.strong.copy(fontSize = 13.sp, color = if (slippage == v) Pad.White else Pad.Ink)) } }
        }
        val label = when { busy != null -> busy!!; units == null -> "Enter an amount"; insufficient -> "Not enough balance"; side == "buy" -> "Buy \$${coin.symbol}"; else -> "Sell \$${coin.symbol}" }
        PadButton(label, { trade() }, Modifier.fillMaxWidth().padding(top = 12.dp), style = if (side == "buy") BtnStyle.Buy else BtnStyle.Sell, enabled = units != null && !insufficient && busy == null && quoteError == null, loading = busy != null)
        MonoText(if (account.accountWallet != null) "SIGNED WITH YOUR ACCOUNT WALLET · ${Fmt.short(wallet)}" else if (wallet != null) "SIGNED ON THIS PHONE · ${Fmt.short(wallet)}" else "AN OBJECTPAD WALLET IS CREATED ON THIS PHONE ON FIRST TRADE", Modifier.padding(top = 8.dp), size = 10)
        if (!account.signedIn && account.signInAvailable) Text("Sign in to trade with your objectpad.fun wallet", style = Type.small.copy(fontSize = 12.sp, color = Pad.Ink), modifier = Modifier.padding(top = 4.dp).press(onClick = onSignIn))
        if (wallet != null && ethBal != null && ethBal!! < Chain.GAS_RESERVE && side == "buy") Notice("Fund this wallet with ETH on Robinhood Chain to trade. Copy the address in Me → Wallet.", Modifier.padding(top = 8.dp))
        Body("Each trade: 0.5% burns \$OBJECTPAD · 0.5% creator · 0.5% long-term holders.", Modifier.padding(top = 8.dp), size = 12)
        error?.let { Notice(it, Modifier.padding(top = 8.dp), tone = Pad.Down) }
        lastHash?.let { h -> Row(Modifier.padding(top = 8.dp).press { context.openUrl(Chain.txUrl(h)) }, verticalAlignment = Alignment.CenterVertically) { Strong(if (confirmed) "Confirmed · view receipt" else "Submitted · view receipt", size = 13); Icon(Icons.AutoMirrored.Filled.OpenInNew, null, Modifier.padding(start = 4.dp).size(13.dp)) } }
    }
}

@Composable
private fun TradesList(trades: List<CoinTrade>?, symbol: String) {
    val context = LocalContext.current
    Raised(radius = 24.dp, padding = 12.dp) {
        if (trades == null) Loading("Reading trades…") else if (trades.isEmpty()) Body("No trades yet.", Modifier.padding(8.dp))
        else trades.sortedByDescending { it.at }.take(40).forEachIndexed { i, t ->
            if (i > 0) Divider()
            Row(Modifier.fillMaxWidth().press { context.openUrl(Chain.txUrl(t.hash)) }.padding(vertical = 9.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(RoundedCornerShape(50)).background(if (t.side == "buy") Pad.Up else Pad.Down))
                Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong("${if (t.side == "buy") "Buy" else "Sell"} ${Fmt.compact(t.tokens)} \$$symbol", size = 13, maxLines = 1); MonoText("${Fmt.short(t.trader)} · ${Fmt.timeAgo(t.at)}", size = 10) }
                Text(Fmt.eth(t.eth, 4), style = Type.num.copy(color = if (t.side == "buy") Pad.Up else Pad.Down))
            }
        }
    }
}

@Composable
private fun HoldersList(holders: List<CoinHolder>?) {
    val context = LocalContext.current
    Raised(radius = 24.dp, padding = 12.dp) {
        if (holders == null) Loading("Reading holders…") else holders.take(30).forEachIndexed { i, h ->
            if (i > 0) Divider()
            Row(Modifier.fillMaxWidth().press { context.openUrl(Chain.addressUrl(h.address)) }.padding(vertical = 9.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                MonoText("#${i + 1}", Modifier.width(34.dp), size = 11)
                Column(Modifier.weight(1f)) { Strong(h.label ?: Fmt.short(h.address), size = 13); MonoText(Fmt.compact(h.balance), size = 10) }
                Text("%.2f%%".format(h.share * 100), style = Type.num)
            }
        }
    }
}

@Composable
private fun RecordCard(coin: ObjectCoin, r: ObjectRecord?) {
    val context = LocalContext.current
    Raised(radius = 24.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Fingerprint, 44.dp); Column(Modifier.padding(start = 10.dp)) { Lab("Scan certificate"); Strong(r?.objectName ?: coin.objectName ?: coin.name) } }
        val rows = buildList {
            add("Token" to coin.token); add("Curve" to coin.curve)
            coin.launchHash?.let { add("Launch tx" to it) }
            r?.objectTag?.let { add("Tag" to it) }; r?.objectSpecs?.let { add("3D specs" to it) }
            r?.let { add("Views" to "${it.acceptedViewCount} photos"); add("Model hash" to it.originalModelHash); add("Capture manifest" to it.captureManifestHash); it.uniqueness?.let { u -> add("One-of-one check" to "Compared with ${u.compared} objects") }; it.launchMode?.let { m -> add("Launch" to if (m == "sponsored") "Sponsored by the ObjectPad treasury" else "Wallet") } }
        }
        rows.forEach { (k, v) ->
            Row(Modifier.fillMaxWidth().padding(top = 10.dp).press { if (v.startsWith("0x")) context.copyText(k, v) }, verticalAlignment = Alignment.CenterVertically) {
                MonoText(k.uppercase(), Modifier.width(110.dp), size = 10); MonoText(if (v.length > 30) Fmt.short(v, 12, 8) else v, Modifier.weight(1f), color = Pad.Ink, size = 11)
                if (v.startsWith("0x")) Icon(Icons.Default.ContentCopy, "Copy", Modifier.size(13.dp), tint = Pad.Muted)
            }
        }
        r?.story?.takeIf { it.isNotBlank() }?.let { Body(it, Modifier.padding(top = 12.dp), size = 14) }
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Blockscout", onClick = { context.openUrl(Chain.tokenUrl(coin.token)) })
            coin.launchHash?.let { h -> Chip("Launch tx", onClick = { context.openUrl(Chain.txUrl(h)) }) }
            r?.xUrl?.takeIf { it.isNotBlank() }?.let { x -> Chip("X", onClick = { context.openUrl(x) }) }
            r?.telegram?.takeIf { it.isNotBlank() }?.let { t -> Chip("Telegram", onClick = { context.openUrl(t) }) }
        }
    }
}

@Composable
private fun FeesCard() {
    Sunk(radius = 22.dp, padding = 14.dp) {
        Lab("Where the 1.5% goes")
        listOf("Buyback & burn \$OBJECTPAD" to "0.5%", "Creator of the scan" to "0.5%", "Long-term holders" to "0.5%", "Pons protocol" to "1.0%").forEach { (k, v) -> Row(Modifier.padding(top = 8.dp)) { Body(k, Modifier.weight(1f), size = 13, weight = 700); MonoText(v, color = Pad.Ink) } }
    }
}
