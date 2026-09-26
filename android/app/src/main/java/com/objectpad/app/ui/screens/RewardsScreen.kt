package com.objectpad.app.ui.screens

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.AllInclusive
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ChainClient
import com.objectpad.app.data.Reward
import com.objectpad.app.data.RewardBoard
import com.objectpad.app.data.RewardPhoto
import com.objectpad.app.data.RewardProof
import com.objectpad.app.data.RewardSort
import com.objectpad.app.data.RewardsApi
import com.objectpad.app.data.TxRequest
import com.objectpad.app.data.countdown
import com.objectpad.app.data.rewardError
import com.objectpad.app.data.sortedBy
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Field
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.PulseDot
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.Sunk
import com.objectpad.app.ui.components.TopBar
import com.objectpad.app.ui.components.copyText
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.components.shareText
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.math.BigInteger

private val Sky = Color(0xFF2F7BF2)
private val SkyLight = Color(0xFF6FB2FF)
private val Amber = Color(0xFFF59E0B)
private fun money(v: Double) = "$" + "%,d".format(Math.round(v))

/** Ticks every second for live countdowns. */
@Composable private fun rememberNow(): Long { var now by remember { mutableLongStateOf(System.currentTimeMillis()) }; LaunchedEffect(Unit) { while (true) { delay(1000); now = System.currentTimeMillis() } }; return now }

/** Picks a photo and returns a ≤1600px JPEG. */
private suspend fun jpegFrom(context: Context, uri: Uri): ByteArray = withContext(Dispatchers.IO) {
    val src = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: error("That photo couldn’t be opened. Try a JPG or PNG.")
    val scale = minOf(1f, 1600f / maxOf(src.width, src.height))
    val bmp = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true) else src
    ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 88, it) }.toByteArray()
}

@Composable
private fun CountdownPill(deadline: Long?, modifier: Modifier = Modifier, big: Boolean = false) {
    val c = countdown(deadline, rememberNow())
    val (bg, fg) = when (c.tier) { "urgent" -> Pad.Down to Pad.White; "soon" -> Amber to Pad.Ink; "ended" -> Pad.Ink.copy(alpha = 0.7f) to Pad.White.copy(alpha = 0.7f); else -> Pad.Ink.copy(alpha = 0.78f) to Pad.White }
    Row(modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = if (big) 12.dp else 9.dp, vertical = if (big) 6.dp else 4.dp), verticalAlignment = Alignment.CenterVertically) {
        if (c.tier == "urgent") PulseDot(Pad.White, 6.dp) else Icon(Icons.Default.Timer, null, tint = fg, modifier = Modifier.size(if (big) 14.dp else 11.dp))
        Spacer(Modifier.width(5.dp)); Text(c.label.uppercase(), style = Type.lab.copy(color = fg, fontSize = if (big) 13.sp else 10.5.sp))
    }
}

/** Bounty cover: the real image, or a drawn sky poster while the AI paints. */
@Composable
private fun SkyPoster(r: Reward, modifier: Modifier = Modifier, big: Boolean = false, reveal: Boolean = true) {
    val painting = r.coverState == "generating"
    val t = rememberInfiniteTransition(label = "sky"); val drift by t.animateFloat(0.96f, 1.04f, infiniteRepeatable(tween(4200), RepeatMode.Reverse), label = "d")
    Box(modifier.clip(RoundedCornerShape(if (big) 26.dp else 22.dp)).background(Brush.verticalGradient(listOf(Sky, SkyLight, Color(0xFFBFE0FF))))) {
        if (r.image.isNotBlank() && !painting) AsyncImage(r.image, r.title, Modifier.fillMaxSize().let { if (!reveal) it.blur(40.dp) else it }, contentScale = ContentScale.Crop)
        else {
            Box(Modifier.align(Alignment.TopStart).padding(8.dp).size(90.dp).scale(drift).clip(CircleShape).background(Color.White.copy(alpha = 0.45f)).blur(24.dp))
            Column(Modifier.align(Alignment.CenterStart).fillMaxWidth(0.62f).padding(start = 16.dp)) {
                Text("FIRST ${r.`object`.uppercase()} SCAN: ${money(r.rewardUsd)}", style = Type.display(if (big) 28 else 19).copy(color = Color.White), maxLines = 3)
                Text("REWARDS ONLY GO UP.", style = Type.lab.copy(color = Color.White, fontSize = if (big) 12.sp else 9.sp), modifier = Modifier.padding(top = 6.dp))
                Text("objectpad.fun", style = Type.display(if (big) 20 else 14).copy(color = Color.White))
            }
            Box(Modifier.align(Alignment.BottomEnd).padding(end = 18.dp, bottom = 14.dp).width(if (big) 120.dp else 90.dp).height(18.dp).clip(RoundedCornerShape(50)).background(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.8f), SkyLight.copy(alpha = 0.4f)))))
            if (painting) Row(Modifier.align(Alignment.TopEnd).padding(10.dp).clip(RoundedCornerShape(50)).background(Pad.Ink.copy(alpha = 0.7f)).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(11.dp), color = Color.White, strokeWidth = 1.5.dp); Spacer(Modifier.width(6.dp)); Text("AI PAINTING", style = Type.lab.copy(color = Color.White, fontSize = 10.sp))
            }
        }
        if (!reveal) Text("18+ · TAP TO VIEW", style = Type.lab.copy(color = Color.White), modifier = Modifier.align(Alignment.Center))
    }
}

@Composable
private fun Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.clip(RoundedCornerShape(18.dp)).background(Pad.Ink).padding(4.dp)) {
        options.forEach { (id, label) ->
            val on = id == selected
            Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(14.dp)).background(if (on) Pad.White else Color.Transparent).press { onSelect(id) }, contentAlignment = Alignment.Center) {
                Text(label, style = Type.strong.copy(fontSize = 12.5.sp, color = if (on) Pad.Ink else Pad.White.copy(alpha = 0.72f)), maxLines = 1)
            }
        }
    }
}

@Composable
private fun Pill(text: String, on: Boolean, onClick: () -> Unit, accent: Color = Pad.Ink, icon: ImageVector? = null) {
    Row(Modifier.padding(end = 6.dp).height(40.dp).clip(RoundedCornerShape(50)).background(if (on) accent else Pad.White).border(1.dp, if (on) accent else Pad.Ink.copy(alpha = 0.08f), RoundedCornerShape(50)).press(onClick = onClick).padding(horizontal = 15.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) { Icon(icon, null, tint = if (on) Pad.White else Pad.Ink.copy(alpha = 0.6f), modifier = Modifier.size(14.dp)); Spacer(Modifier.width(5.dp)) }
        Text(text, style = Type.strong.copy(fontSize = 13.sp, color = if (on) Pad.White else Pad.Ink.copy(alpha = 0.72f)))
    }
}

/** Paid Rewards board: source + status filters, “best right now” sorting and live deadline countdowns. */
@Composable
fun RewardsScreen(onOpen: (String) -> Unit, onCreate: () -> Unit) {
    val api = remember { RewardsApi(ObjectPadApp.instance.account) }
    var board by remember { mutableStateOf<RewardBoard?>(null) }; var error by remember { mutableStateOf<String?>(null) }
    var source by remember { mutableStateOf("all") }; var status by remember { mutableStateOf("open") }; var sort by remember { mutableStateOf(RewardSort.Best) }; var q by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { while (true) { runCatching { api.board() }.onSuccess { board = it; error = null }.onFailure { if (board == null) error = rewardError(it) }; delay(15_000) } }
    val now = remember(board) { System.currentTimeMillis() }
    val all = board?.bounties.orEmpty()
    val list = remember(all, source, status, sort, q) {
        all.filter { b -> when (status) { "open" -> b.status == "open"; "paid" -> b.status == "paid"; "mine" -> b.mine || b.submissions.any { it.mine }; else -> b.status != "cancelled" } }
            .filter { source == "all" || (source == "objectpad") == (it.kind == "platform") }
            .filter { q.isBlank() || "${it.title} ${it.`object`} ${it.tagline}".contains(q.trim(), true) }
            .sortedBy(sort, now)
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 130.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Pad.night).padding(20.dp)) {
                Column {
                    Lab("ObjectPad · Paid Rewards", color = Pad.White.copy(alpha = 0.55f))
                    Text("Scan it first.\nGet paid.", style = Type.display(38).copy(color = Pad.White), modifier = Modifier.padding(top = 8.dp))
                    Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("Open" to money(board?.stats?.openUsd ?: 0.0), "Paid" to money(board?.stats?.paidUsd ?: 0.0), "Escrow" to "%.3f Ξ".format(board?.stats?.escrowEth ?: 0.0)).forEach { (k, v) ->
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Pad.White.copy(alpha = 0.08f)).padding(10.dp)) { Text(k.uppercase(), style = Type.lab.copy(color = Pad.White.copy(alpha = 0.5f), fontSize = 9.5.sp)); Text(v, style = Type.display(19).copy(color = Pad.White), maxLines = 1) }
                        }
                    }
                    PadButton("Post a bounty", onCreate, Modifier.padding(top = 16.dp).fillMaxWidth(), style = BtnStyle.Glass, icon = Icons.Default.Add)
                }
            }
        }
        item {
            Segmented(listOf("all" to "Everyone", "objectpad" to "By ObjectPad", "community" to "By users"), source, { source = it }, Modifier.fillMaxWidth())
            Row(Modifier.padding(top = 10.dp).horizontalScroll(rememberScrollState())) {
                listOf("open" to "Open now", "all" to "All", "paid" to "Paid out", "mine" to "Mine").forEach { (id, l) -> Pill(l, status == id, { status = id }) }
            }
            Row(Modifier.padding(top = 8.dp).horizontalScroll(rememberScrollState())) {
                RewardSort.entries.forEach { s -> Pill(s.label, sort == s, { sort = s }, Sky, if (s == RewardSort.Best) Icons.Default.AutoAwesome else if (s == RewardSort.Ending) Icons.Default.Timer else null) }
            }
            Field(q, { q = it }, "", "Search objects", Modifier.padding(top = 4.dp))
        }
        when {
            error != null -> item { Text(error ?: "", style = Type.body.copy(color = Pad.Down)) }
            board == null -> items(3) { Box(Modifier.fillMaxWidth().aspectRatio(1.2f).clip(RoundedCornerShape(26.dp)).background(Pad.Ink.copy(alpha = 0.05f))) }
            list.isEmpty() -> item { Sunk(Modifier.fillMaxWidth()) { Text(if (status == "mine") "Nothing yet. Post a bounty or send a proof." else "No bounties match.", style = Type.body) } }
            else -> items(list, key = { it.id }) { r -> RewardCard(r) { onOpen(r.id) } }
        }
    }
}

@Composable
private fun RewardCard(r: Reward, onClick: () -> Unit) {
    Raised(Modifier.fillMaxWidth().press(onClick = onClick), padding = 0.dp) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
            SkyPoster(r, Modifier.fillMaxSize(), reveal = !r.adult)
            StatusPill(r, Modifier.align(Alignment.TopStart).padding(10.dp))
            Text(money(r.rewardUsd), style = Type.display(22).copy(color = Pad.White), modifier = Modifier.align(Alignment.TopEnd).padding(10.dp).clip(RoundedCornerShape(14.dp)).background(Pad.Ink.copy(alpha = 0.85f)).padding(horizontal = 11.dp, vertical = 6.dp))
            if (r.status == "open") CountdownPill(r.deadline, Modifier.align(Alignment.BottomStart).padding(10.dp))
            if (r.kind == "community" && r.status == "open") Row(Modifier.align(Alignment.BottomEnd).padding(10.dp).clip(RoundedCornerShape(50)).background(Pad.White.copy(alpha = 0.92f)).padding(horizontal = 9.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Lock, null, Modifier.size(11.dp), tint = Pad.Ink); Spacer(Modifier.width(4.dp)); Text("ESCROWED", style = Type.lab.copy(fontSize = 10.sp, color = Pad.Ink)) }
        }
        Column(Modifier.padding(16.dp)) {
            Lab("${categoryLabel(r.category)} · ${if (r.kind == "platform") "ObjectPad" else "Community"}", color = Pad.Ink.copy(alpha = 0.5f))
            Text(r.title, style = Type.display(22), modifier = Modifier.padding(top = 4.dp))
            Text(r.tagline, style = Type.small, maxLines = 2, modifier = Modifier.padding(top = 4.dp))
            Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (r.poster.handle.isNotBlank()) "@${r.poster.handle}" else r.poster.name.ifBlank { "Anonymous" }, style = Type.strong.copy(fontSize = 13.sp), modifier = Modifier.weight(1f))
                Text("${r.submissions.size} proofs", style = Type.num.copy(color = Pad.Muted)); Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = Pad.Muted, modifier = Modifier.padding(start = 6.dp).size(16.dp))
            }
        }
    }
}

@Composable
private fun StatusPill(r: Reward, modifier: Modifier = Modifier) {
    val (label, bg, fg) = when (r.status) { "open" -> Triple("OPEN", Pad.White, Pad.Ink); "paid" -> Triple("PAID", Pad.Up, Pad.White); "won" -> Triple("WINNER PICKED", Pad.Up, Pad.White); "draft" -> Triple("DRAFT · FUND TO GO LIVE", Pad.Ink, Pad.White); "paying" -> Triple("PAYING OUT", Pad.White, Pad.Ink); else -> Triple("CLOSED", Pad.White.copy(alpha = 0.8f), Pad.Muted) }
    Row(modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        if (r.status == "open") { PulseDot(Pad.Up, 6.dp); Spacer(Modifier.width(5.dp)) } else if (r.status == "paid") { Icon(Icons.Default.Check, null, Modifier.size(12.dp), tint = fg); Spacer(Modifier.width(4.dp)) }
        Text(label, style = Type.lab.copy(color = fg, fontSize = 10.5.sp))
    }
}

private fun categoryLabel(c: String) = when (c) { "find" -> "Find it"; "scan" -> "Scan it"; "promo" -> "Promote"; "meme" -> "Meme IRL"; "art" -> "Art"; else -> "Other" }

// ---------------- Detail ----------------

@Composable
fun RewardDetailScreen(id: String, onBack: () -> Unit, onSignIn: () -> Unit) {
    val app = ObjectPadApp.instance; val api = remember { RewardsApi(app.account) }; val context = LocalContext.current; val scope = rememberCoroutineScope()
    var r by remember { mutableStateOf<Reward?>(null) }; var error by remember { mutableStateOf<String?>(null) }; var reveal by remember { mutableStateOf(false) }
    var tick by remember { mutableLongStateOf(0L) }
    LaunchedEffect(id, tick) { while (true) { runCatching { api.detail(id) }.onSuccess { r = it; error = null }.onFailure { if (r == null) error = rewardError(it) }; delay(if (r?.coverState == "generating" || r?.status == "paying") 4000 else 15_000) } }
    val refresh: () -> Unit = { tick++ }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar(r?.title ?: "Bounty", onBack) { r?.let { b -> Box(Modifier.size(44.dp).clip(CircleShape).background(Pad.White).press { context.shareText("${b.title} · ${money(b.rewardUsd)} on @ObjectPadFun\nhttps://objectpad.fun/rewards/${b.id}") }, contentAlignment = Alignment.Center) { Icon(Icons.Default.Share, "Share", tint = Pad.Ink, modifier = Modifier.size(18.dp)) } } }
        val b = r
        if (b == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { if (error != null) Text(error ?: "", style = Type.body.copy(color = Pad.Down)) else CircularProgressIndicator(color = Pad.Ink) }; return@Column }
        LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 60.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).press(enabled = b.adult && !reveal) { reveal = true }) {
                    SkyPoster(b, Modifier.fillMaxSize(), big = true, reveal = !b.adult || reveal)
                    StatusPill(b, Modifier.align(Alignment.TopStart).padding(12.dp))
                    Text(money(b.rewardUsd), style = Type.display(28).copy(color = Pad.White), modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).clip(RoundedCornerShape(16.dp)).background(Pad.Ink.copy(alpha = 0.85f)).padding(horizontal = 13.dp, vertical = 7.dp))
                    if (b.status == "open") CountdownPill(b.deadline, Modifier.align(Alignment.BottomStart).padding(12.dp), big = true)
                }
            }
            item {
                Lab("${categoryLabel(b.category)} · ${if (b.kind == "platform") "ObjectPad bounty" else "Community bounty"} · posted ${b.postedAt}", color = Pad.Muted)
                Text(b.title, style = Type.display(32), modifier = Modifier.padding(top = 6.dp))
                Text(b.tagline, style = Type.body.copy(color = Pad.Ink.copy(alpha = 0.7f)), modifier = Modifier.padding(top = 6.dp))
                Row(Modifier.padding(top = 10.dp).horizontalScroll(rememberScrollState())) { b.rules.forEach { Row(Modifier.padding(end = 6.dp).clip(RoundedCornerShape(50)).background(Pad.Ink.copy(alpha = 0.06f)).padding(horizontal = 11.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Check, null, Modifier.size(12.dp), tint = Pad.Ink); Spacer(Modifier.width(4.dp)); Text(it, style = Type.strong.copy(fontSize = 12.sp)) } } }
            }
            val winner = b.submissions.firstOrNull { it.state == "paid" || it.state == "winner" }
            if (winner != null || b.winner != null) item {
                Raised(Modifier.fillMaxWidth().border(2.dp, Pad.Up, RoundedCornerShape(26.dp))) {
                    Lab(if (b.status == "paid") "Winner paid · confirmed" else "Payout sending…", color = Pad.Up)
                    Text(winner?.handle?.takeIf { it.isNotBlank() }?.let { "@$it" } ?: winner?.wallet ?: b.winner?.coinName ?: "Winner", style = Type.strong, modifier = Modifier.padding(top = 6.dp))
                    (b.payoutTx ?: winner?.payoutTx)?.let { tx -> Text("View payout ↗", style = Type.strong.copy(color = Pad.Up, fontSize = 13.sp), modifier = Modifier.padding(top = 6.dp).press { context.openUrl(Chain.txUrl(tx)) }) }
                }
            }
            if (b.mine && b.kind == "community" && (b.status == "draft" || b.status == "open")) item { CoverStudio(b, api) { r = it } }
            if (b.mine && b.status == "draft") item { FundCard(b, api, onSignIn) { r = it } }
            if (b.status == "open" && !b.mine) item { ProofForm(b, api, onSignIn, refresh) }
            item { Text("Proofs · ${b.submissions.size}", style = Type.display(24)) }
            if (b.submissions.isEmpty()) item { Sunk(Modifier.fillMaxWidth()) { Text("No proofs yet. The first real one takes it.", style = Type.body) } }
            items(b.submissions, key = { it.id }) { p -> ProofRow(p, b, api, scope = { block -> scope.launch { block() } }) { r = it } }
            if (b.kind == "community" && b.escrow != null && b.status != "draft") item {
                Raised(Modifier.fillMaxWidth()) {
                    Lab("Escrow"); Text("${"%.6f".format(b.rewardEth ?: 0.0)} ETH locked", style = Type.strong, modifier = Modifier.padding(top = 4.dp))
                    b.fundTx?.let { Text("Deposit ${Fmt.short(it, 8, 6)} ↗", style = Type.num, modifier = Modifier.padding(top = 4.dp).press { context.openUrl(Chain.txUrl(it)) }) }
                    Text("Wallet ${Fmt.short(b.escrow)} ↗", style = Type.num, modifier = Modifier.padding(top = 4.dp).press { context.openUrl(Chain.addressUrl(b.escrow)) })
                }
            }
            if (b.audit.isNotEmpty()) item {
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Pad.night).padding(16.dp)) {
                    Column { Lab("Public audit log", color = Pad.White.copy(alpha = 0.5f)); b.audit.forEach { a -> Column(Modifier.padding(top = 10.dp)) { Text("${a.event.replace('_', ' ').uppercase()} · ${Fmt.timeAgo(a.at)}", style = Type.lab.copy(color = Pad.White.copy(alpha = 0.45f), fontSize = 10.sp)); Text(a.detail, style = Type.small.copy(color = Pad.White.copy(alpha = 0.85f))) } } }
                }
            }
        }
    }
}

@Composable
private fun PhotoPicker(photo: RewardPhoto?, busy: Boolean, label: String, sub: String, onPick: (Uri) -> Unit, onClear: () -> Unit, dark: Boolean = false) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(onPick) }
    val launch = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    val shape = RoundedCornerShape(22.dp)
    Box(Modifier.fillMaxWidth().clip(shape).background(if (dark) Pad.White.copy(alpha = 0.06f) else Pad.White).border(2.dp, if (dark) Pad.White.copy(alpha = 0.22f) else Pad.Ink.copy(alpha = 0.16f), shape)) {
        if (photo != null) Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f)) {
            AsyncImage(photo.url, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Row(Modifier.align(Alignment.BottomCenter).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PadButton("Replace", { launch() }, Modifier.weight(1f), height = 42.dp)
                Box(Modifier.size(42.dp).clip(CircleShape).background(Pad.White).press(onClick = onClear), contentAlignment = Alignment.Center) { Icon(Icons.Default.Close, "Remove", tint = Pad.Ink) }
            }
        } else Column(Modifier.fillMaxWidth().press { launch() }.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(if (dark) Pad.White else Pad.Ink), contentAlignment = Alignment.Center) { if (busy) CircularProgressIndicator(Modifier.size(22.dp), color = if (dark) Pad.Ink else Pad.White, strokeWidth = 2.dp) else Icon(Icons.Default.AddPhotoAlternate, null, tint = if (dark) Pad.Ink else Pad.White) }
            Text(if (busy) "Uploading…" else label, style = Type.strong.copy(color = if (dark) Pad.White else Pad.Ink), modifier = Modifier.padding(top = 10.dp))
            Text(sub, style = Type.small.copy(color = if (dark) Pad.White.copy(alpha = 0.6f) else Pad.Muted), textAlign = TextAlign.Center, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun CoverStudio(b: Reward, api: RewardsApi, onUpdate: (Reward) -> Unit) {
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<RewardPhoto?>(null) }; var busy by remember { mutableStateOf(false) }; var err by remember { mutableStateOf<String?>(null) }
    val painting = b.coverState == "generating"
    Raised(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.AutoAwesome, null, tint = Sky); Spacer(Modifier.width(8.dp)); Text("Cover studio", style = Type.strong) }
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.weight(1f).height(50.dp).clip(RoundedCornerShape(16.dp)).background(Sky).press(!painting && !busy) { scope.launch { busy = true; runCatching { api.cover(b.id, "ai", photo?.hash ?: "") }.onSuccess(onUpdate).onFailure { err = rewardError(it) }; busy = false } }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                if (painting) CircularProgressIndicator(Modifier.size(16.dp), color = Pad.White, strokeWidth = 2.dp) else Icon(Icons.Default.AutoAwesome, null, tint = Pad.White, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp)); Text(if (painting) "Painting…" else if (photo != null) "Repaint from photo" else "Regenerate", style = Type.strong.copy(color = Pad.White, fontSize = 13.sp))
            }
            PadButton("Use as cover", { scope.launch { photo?.let { p -> busy = true; runCatching { api.cover(b.id, "upload", p.hash) }.onSuccess(onUpdate).onFailure { err = rewardError(it) }; busy = false } } }, Modifier.weight(1f), enabled = photo != null, height = 50.dp)
        }
        Spacer(Modifier.height(10.dp))
        PhotoPicker(photo, busy, "Add a photo", "Use it as the cover, or let the AI repaint the poster inspired by it.", { uri -> scope.launch { busy = true; runCatching { api.upload(jpegFrom(context, uri)) }.onSuccess { photo = it }.onFailure { err = rewardError(it) }; busy = false } }, { photo = null })
        err?.let { Text(it, style = Type.small.copy(color = Pad.Down), modifier = Modifier.padding(top = 6.dp)) }
    }
}

@Composable
private fun FundCard(b: Reward, api: RewardsApi, onSignIn: () -> Unit, onUpdate: (Reward) -> Unit) {
    val context = LocalContext.current; val scope = rememberCoroutineScope(); val account = ObjectPadApp.instance.account
    var hash by remember { mutableStateOf("") }; var busy by remember { mutableStateOf<String?>(null) }; var err by remember { mutableStateOf<String?>(null) }
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Pad.night).padding(18.dp)) {
        Column {
            Lab("Lock in escrow", color = Pad.White.copy(alpha = 0.55f))
            Text("${"%.6f".format(b.rewardEth ?: 0.0)} ETH", style = Type.display(32).copy(color = Pad.White), modifier = Modifier.padding(top = 4.dp))
            Text("= ${money(b.rewardUsd)} · Robinhood Chain (4663)", style = Type.num.copy(color = Pad.White.copy(alpha = 0.55f)))
            b.escrow?.let { e -> Text(e, style = Type.num.copy(color = Pad.White, fontSize = 12.sp), modifier = Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Pad.White.copy(alpha = 0.1f)).press { context.copyText("Escrow", e); ObjectPadApp.instance.sounds.play("orbit") }.padding(12.dp)) }
            PadButton(busy ?: "Fund from my wallet", {
                scope.launch {
                    if (account.accountToken() == null) { onSignIn(); return@launch }
                    err = null
                    try {
                        busy = "Sending…"; val h = account.signer().send(TxRequest(b.escrow ?: "", "0x", BigInteger(b.rewardWei ?: "0"))); hash = h
                        busy = "Confirming…"; ChainClient.waitForReceipt(h); busy = "Verifying…"; onUpdate(api.fund(b.id, h)); ObjectPadApp.instance.sounds.play("seal")
                    } catch (e: Exception) { err = rewardError(e) } finally { busy = null }
                }
            }, Modifier.padding(top = 14.dp).fillMaxWidth(), style = BtnStyle.Glass, loading = busy != null)
            Text("Or send from any wallet and paste the tx hash:", style = Type.small.copy(color = Pad.White.copy(alpha = 0.6f)), modifier = Modifier.padding(top = 12.dp))
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { Field(hash, { hash = it.trim() }, "", "0x…", mono = true) }
                PadButton("Verify", { scope.launch { busy = "Verifying…"; runCatching { api.fund(b.id, hash) }.onSuccess(onUpdate).onFailure { err = rewardError(it) }; busy = null } }, Modifier.padding(start = 8.dp, top = 6.dp), style = BtnStyle.Glass, enabled = Chain.isHash(hash), height = 50.dp)
            }
            err?.let { Text(it, style = Type.small.copy(color = Color(0xFFFF8A8E)), modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}

@Composable
private fun ProofForm(b: Reward, api: RewardsApi, onSignIn: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<RewardPhoto?>(null) }; var coin by remember { mutableStateOf("") }; var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }; var err by remember { mutableStateOf<String?>(null) }; var sent by remember { mutableStateOf(false) }
    Raised(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.CameraAlt, null); Spacer(Modifier.width(8.dp)); Text(if (sent) "Proof sent" else "Send your proof", style = Type.strong) }
        if (sent) { Text("The poster reviews proofs in order. You’ll be paid straight to your wallet if you win.", style = Type.small, modifier = Modifier.padding(top = 6.dp)); return@Raised }
        Spacer(Modifier.height(10.dp))
        PhotoPicker(photo, busy, "Photo of the real object", "Location data is stripped on upload.", { uri -> scope.launch { if (ObjectPadApp.instance.account.accountToken() == null) { onSignIn(); return@launch }; busy = true; runCatching { api.upload(jpegFrom(context, uri)) }.onSuccess { photo = it }.onFailure { err = rewardError(it) }; busy = false } }, { photo = null })
        Field(coin, { coin = it }, "Your ObjectPad coin (optional)", "0x… or objectpad.fun link", Modifier.padding(top = 10.dp), mono = true)
        Field(note, { note = it.take(280) }, "Note (optional)", "Where you found it…", Modifier.padding(top = 10.dp))
        err?.let { Text(it, style = Type.small.copy(color = Pad.Down), modifier = Modifier.padding(top = 6.dp)) }
        PadButton("Submit proof", { scope.launch { busy = true; err = null; runCatching { api.submit(b.id, photo?.hash ?: "", coin.trim(), note.trim()) }.onSuccess { sent = true; ObjectPadApp.instance.sounds.play("seal"); onDone() }.onFailure { err = rewardError(it); if ((it as? com.objectpad.app.data.ApiException)?.code == "SIGN_IN_REQUIRED") onSignIn() }; busy = false } },
            Modifier.padding(top = 12.dp).fillMaxWidth(), enabled = (photo != null || coin.isNotBlank()) && !busy, loading = busy)
    }
}

@Composable
private fun ProofRow(p: RewardProof, b: Reward, api: RewardsApi, scope: (suspend () -> Unit) -> Unit, onUpdate: (Reward) -> Unit) {
    var busy by remember { mutableStateOf(false) }; var err by remember { mutableStateOf<String?>(null) }; var rejecting by remember { mutableStateOf(false) }; var reason by remember { mutableStateOf("") }
    Raised(Modifier.fillMaxWidth(), padding = 0.dp) {
        if (p.photo.isNotBlank()) AsyncImage(p.photo, "Proof photo", Modifier.fillMaxWidth().aspectRatio(4f / 3f), contentScale = ContentScale.Crop)
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(p.handle.takeIf { it.isNotBlank() }?.let { "@$it" } ?: p.wallet, style = Type.strong.copy(fontSize = 14.sp), modifier = Modifier.weight(1f), maxLines = 1)
                val (label, color) = when (p.state) { "paid" -> "PAID" to Pad.Up; "winner" -> "WINNER" to Pad.Up; "rejected" -> "NOT ACCEPTED" to Pad.Down; else -> "IN REVIEW" to Pad.Muted }
                Text(label, style = Type.lab.copy(color = color, fontSize = 10.sp))
            }
            if (p.coinSymbol.isNotBlank()) Text("Coin \$${p.coinSymbol} · ${p.coinName}", style = Type.num, modifier = Modifier.padding(top = 4.dp))
            if (p.note.isNotBlank()) Text(p.note, style = Type.small, modifier = Modifier.padding(top = 4.dp))
            if (p.reviewNote.isNotBlank()) Text("“${p.reviewNote}”", style = Type.small.copy(color = Pad.Down), modifier = Modifier.padding(top = 4.dp))
            Text(Fmt.timeAgo(p.createdAt), style = Type.num.copy(color = Pad.Muted, fontSize = 11.sp), modifier = Modifier.padding(top = 4.dp))
            if (b.mine && b.kind == "community" && b.status == "open" && p.state == "submitted") {
                if (!rejecting) Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PadButton("Pay winner", { scope { busy = true; runCatching { api.payout(p.id) }.onSuccess { onUpdate(it); ObjectPadApp.instance.sounds.play("launch") }.onFailure { err = rewardError(it) }; busy = false } }, Modifier.weight(1f), style = BtnStyle.Buy, loading = busy, height = 46.dp)
                    PadButton("Reject", { rejecting = true }, Modifier.weight(1f), style = BtnStyle.Ghost, height = 46.dp)
                } else {
                    Field(reason, { reason = it.take(200) }, "Public reason", "Not the right object…", Modifier.padding(top = 8.dp))
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PadButton("Cancel", { rejecting = false }, Modifier.weight(1f), style = BtnStyle.Ghost, height = 44.dp)
                        PadButton("Reject", { scope { busy = true; runCatching { api.reject(p.id, reason) }.onSuccess(onUpdate).onFailure { err = rewardError(it) }; busy = false } }, Modifier.weight(1f), style = BtnStyle.Danger, enabled = reason.trim().length >= 3, loading = busy, height = 44.dp)
                    }
                }
            }
            err?.let { Text(it, style = Type.small.copy(color = Pad.Down), modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}

// ---------------- Create ----------------

private data class Cat(val id: String, val label: String, val blurb: String, val icon: ImageVector, val a: Color, val b: Color)
private val CATS = listOf(
    Cat("find", "Find it", "Track it down IRL", Icons.Default.Search, Sky, SkyLight), Cat("scan", "Scan it", "Scan it in 3D", Icons.Default.ViewInAr, Pad.Graphite, Color(0xFF3A3E48)),
    Cat("promo", "Promote", "Promote my coin", Icons.Default.Campaign, Amber, Color(0xFFFBBF24)), Cat("meme", "Meme IRL", "Meme made real", Icons.Default.EmojiEmotions, Color(0xFF10B981), Color(0xFF34D399)),
    Cat("art", "Art", "Art & merch", Icons.Default.Brush, Color(0xFFEC4899), Color(0xFFF472B6)), Cat("other", "Other", "Anything else", Icons.Default.Diamond, Color(0xFF6366F1), Color(0xFF818CF8)),
)

/** Four visual steps (object, reward, cover, post) with a live poster, then the cover studio and escrow. */
@Composable
fun RewardCreateScreen(onBack: () -> Unit, onSignIn: () -> Unit, onPosted: (String) -> Unit) {
    val app = ObjectPadApp.instance; val api = remember { RewardsApi(app.account) }; val context = LocalContext.current; val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(0) }
    var obj by remember { mutableStateOf("") }; var brief by remember { mutableStateOf("") }; var cat by remember { mutableStateOf("find") }
    var usd by remember { mutableStateOf(50) }; var days by remember { mutableStateOf(14) }; var aiCover by remember { mutableStateOf(true) }; var photo by remember { mutableStateOf<RewardPhoto?>(null) }
    var promo by remember { mutableStateOf("") }; var adult by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }; var err by remember { mutableStateOf<String?>(null) }
    var signedIn by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(Unit) { signedIn = app.account.accountToken() != null }
    val preview = Reward(id = "preview", title = "First ${obj.ifBlank { "object" }} scan", `object` = obj.ifBlank { "your object" }, category = cat, rewardUsd = usd.toDouble(), image = if (!aiCover) photo?.url ?: "" else "")
    val valid = listOf(obj.trim().length >= 2, usd in 5..10_000, aiCover || photo != null, true)
    val auto = "Find a real ${obj.trim().ifBlank { "object" }} in the wild, scan it on ObjectPad and launch its coin. First approved proof takes the reward."
    fun post() = scope.launch {
        busy = true; err = null
        runCatching { api.create(obj.trim(), (if (brief.trim().length >= 10) brief.trim() else auto).take(280), cat, usd, days, promo.trim(), adult, listOf("Real object, found in person", "Clear photo proof", "First approved proof wins"), if (!aiCover) photo?.hash ?: "" else "", if (aiCover) photo?.hash ?: "" else "") }
            .onSuccess { app.sounds.play("seal"); onPosted(it.id) }.onFailure { err = rewardError(it) }
        busy = false
    }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(RoundedCornerShape(26.dp)).background(Pad.night).padding(16.dp)) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Lab("Step ${step + 1} of 4", color = Pad.White.copy(alpha = 0.55f)); Text(listOf("What’s the hunt?", "Put money on it", "Pick a cover", "Ready to post")[step], style = Type.display(24).copy(color = Pad.White)) }
                    Box(Modifier.size(44.dp).clip(CircleShape).background(Pad.White.copy(alpha = 0.12f)).press(onClick = onBack), contentAlignment = Alignment.Center) { Icon(Icons.Default.Close, "Close", tint = Pad.White) }
                }
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) { repeat(4) { i -> Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(50)).background(if (i <= step) Pad.White else Pad.White.copy(alpha = 0.15f))) } }
            }
        }
        if (signedIn == false) { Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { Text("Sign in to post a bounty", style = Type.display(26), textAlign = TextAlign.Center); PadButton("Sign in", onSignIn, Modifier.padding(top = 16.dp).fillMaxWidth()) }; return@Column }
        AnimatedContent(step, Modifier.weight(1f), transitionSpec = { (fadeIn() + slideInHorizontally { it / 6 }) togetherWith fadeOut() }, label = "step") { s ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (s != 1) SkyPoster(preview, Modifier.fillMaxWidth().aspectRatio(if (s == 0) 16f / 7f else 16f / 9f))
                when (s) {
                    0 -> {
                        Field(obj, { obj = it.take(60) }, "Name the object", "Rotary phone, Pepe plush…")
                        Row(Modifier.horizontalScroll(rememberScrollState())) { listOf("Rotary phone", "Pepe plush", "Singing fish", "Gold Nokia", "Vintage Game Boy").forEach { i -> Pill(i, false, { obj = i }) } }
                        Text("What kind of hunt?", style = Type.strong.copy(fontSize = 14.sp))
                        CATS.chunked(2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { row.forEach { c -> CatTile(c, cat == c.id, Modifier.weight(1f)) { cat = c.id } } } }
                        Field(brief, { brief = it.take(280) }, "The ask (optional)", auto, singleLine = false, minLines = 3)
                    }
                    1 -> {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Pad.night).padding(18.dp)) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                                Lab("Reward · paid in ETH", color = Pad.White.copy(alpha = 0.55f))
                                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    StepBtn(Icons.Default.Remove) { usd = maxOf(5, usd - if (usd > 100) 50 else 5) }
                                    Text(money(usd.toDouble()), style = Type.display(52).copy(color = Pad.White), modifier = Modifier.padding(horizontal = 14.dp))
                                    StepBtn(Icons.Default.Add) { usd = minOf(10_000, usd + if (usd >= 100) 50 else 5) }
                                }
                                Text("$5 – $10,000 · locked at the live ETH rate", style = Type.num.copy(color = Pad.White.copy(alpha = 0.5f), fontSize = 11.sp))
                                Row(Modifier.padding(top = 14.dp).horizontalScroll(rememberScrollState())) { listOf(10, 25, 50, 100, 250, 500, 1000).forEach { v -> Box(Modifier.padding(end = 6.dp).height(40.dp).clip(RoundedCornerShape(12.dp)).background(if (usd == v) Pad.White else Pad.White.copy(alpha = 0.1f)).press { usd = v }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) { Text(money(v.toDouble()), style = Type.strong.copy(fontSize = 13.5.sp, color = if (usd == v) Pad.Ink else Pad.White)) } } }
                            }
                        }
                        Text("Runs for", style = Type.strong.copy(fontSize = 14.sp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(3, 7, 14, 30, 0).forEach { d -> val on = days == d
                            Column(Modifier.weight(1f).height(76.dp).clip(RoundedCornerShape(18.dp)).background(if (on) Pad.Ink else Pad.White).press { days = d }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                if (d == 0) Icon(Icons.Default.AllInclusive, null, tint = if (on) Pad.White else Pad.Ink) else Text("$d", style = Type.display(24).copy(color = if (on) Pad.White else Pad.Ink))
                                Text(if (d == 0) "until won" else "days", style = Type.small.copy(fontSize = 11.sp, color = if (on) Pad.White.copy(alpha = 0.6f) else Pad.Muted))
                            } } }
                        Text("A live countdown shows on your bounty. Shorter deadlines rank higher in “Best right now”.", style = Type.small)
                    }
                    2 -> {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ModeTile("AI sky poster", "Painted for you", Icons.Default.AutoAwesome, aiCover, Sky, Modifier.weight(1f)) { aiCover = true }
                            ModeTile("My own photo", "Upload your cover", Icons.Default.CameraAlt, !aiCover, Pad.Ink, Modifier.weight(1f)) { aiCover = false }
                        }
                        PhotoPicker(photo, busy, if (aiCover) "Inspire the AI (optional)" else "Upload your cover", if (aiCover) "Add a photo of the object and the AI paints the poster to match. You can regenerate after posting." else "JPG or PNG. Location data is stripped.",
                            { uri -> scope.launch { busy = true; runCatching { api.upload(jpegFrom(context, uri)) }.onSuccess { photo = it }.onFailure { err = rewardError(it) }; busy = false } }, { photo = null })
                    }
                    else -> {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("Reward" to money(usd.toDouble()), "Runs" to if (days == 0) "Until won" else "$days days", "Cover" to if (aiCover) "AI" else "Photo").forEach { (k, v) -> Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Pad.White).padding(12.dp)) { Lab(k, color = Pad.Muted); Text(v, style = Type.strong, maxLines = 1) } } }
                        Field(promo, { promo = it }, "Your link (optional)", "https://x.com/yourcoin")
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (adult) Pad.Ink else Pad.White).press { adult = !adult }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(22.dp).clip(RoundedCornerShape(7.dp)).background(if (adult) Pad.White else Pad.Ink.copy(alpha = 0.08f)), contentAlignment = Alignment.Center) { if (adult) Icon(Icons.Default.Check, null, Modifier.size(14.dp), tint = Pad.Ink) }
                            Spacer(Modifier.width(10.dp)); Text("18+ object · cover blurred until tapped", style = Type.strong.copy(fontSize = 13.sp, color = if (adult) Pad.White else Pad.Ink))
                        }
                    }
                }
                err?.let { Text(it, style = Type.small.copy(color = Pad.Down)) }
            }
        }
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (step > 0) Box(Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(Pad.White).press { step-- }, contentAlignment = Alignment.Center) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Pad.Ink) }
            PadButton(if (step == 3) "Post bounty · ${money(usd.toDouble())}" else "Continue", { if (step < 3) step++ else post() }, Modifier.weight(1f), enabled = valid[step] && !busy, loading = busy && step == 3, icon = if (step == 3) Icons.Default.AutoAwesome else Icons.AutoMirrored.Filled.ArrowForward)
        }
    }
}

@Composable private fun StepBtn(icon: ImageVector, onClick: () -> Unit) = Box(Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(Pad.White.copy(alpha = 0.12f)).press(onClick = onClick), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Pad.White) }

@Composable
private fun CatTile(c: Cat, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val s by androidx.compose.animation.core.animateFloatAsState(if (on) 1.03f else 1f, label = "cat")
    Box(modifier.scale(s).height(96.dp).clip(RoundedCornerShape(20.dp)).background(if (on) Pad.Ink else Pad.White).border(if (on) 2.dp else 1.dp, if (on) Pad.Ink else Pad.Ink.copy(alpha = 0.07f), RoundedCornerShape(20.dp)).press(onClick = onClick).padding(12.dp)) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(listOf(c.a, c.b))), contentAlignment = Alignment.Center) { Icon(c.icon, null, tint = Pad.White, modifier = Modifier.size(20.dp)) }
        Column(Modifier.align(Alignment.BottomStart)) { Text(c.label, style = Type.strong.copy(fontSize = 14.sp, color = if (on) Pad.White else Pad.Ink)); Text(c.blurb, style = Type.small.copy(fontSize = 11.sp, color = if (on) Pad.White.copy(alpha = 0.6f) else Pad.Muted)) }
        if (on) Icon(Icons.Default.Check, null, tint = Pad.White, modifier = Modifier.align(Alignment.TopEnd).size(18.dp))
    }
}

@Composable
private fun ModeTile(title: String, sub: String, icon: ImageVector, on: Boolean, accent: Color, modifier: Modifier, onClick: () -> Unit) {
    Box(modifier.height(120.dp).clip(RoundedCornerShape(22.dp)).background(if (on) accent else Pad.White).press(onClick = onClick).padding(14.dp)) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(if (on) Pad.White.copy(alpha = 0.2f) else Pad.Ink), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Pad.White) }
        Column(Modifier.align(Alignment.BottomStart)) { Text(title, style = Type.strong.copy(color = if (on) Pad.White else Pad.Ink)); Text(sub, style = Type.small.copy(fontSize = 11.5.sp, color = if (on) Pad.White.copy(alpha = 0.75f) else Pad.Muted)) }
        if (on) Icon(Icons.Default.Check, null, tint = Pad.White, modifier = Modifier.align(Alignment.TopEnd))
    }
}

@Suppress("unused") private fun BoxScope.unused(d: Dp) = Unit
