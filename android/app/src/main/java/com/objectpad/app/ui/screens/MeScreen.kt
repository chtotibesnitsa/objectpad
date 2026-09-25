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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.Abi
import com.objectpad.app.data.CaptureSession
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ChainClient
import com.objectpad.app.data.CommunityMessage
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.data.ObjectRecord
import com.objectpad.app.data.Scans
import com.objectpad.app.data.TxRequest
import com.objectpad.app.data.isBuilding
import com.objectpad.app.data.isCapturing
import com.objectpad.app.data.isModelReady
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.CoinImage
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.Divider
import com.objectpad.app.ui.components.Field
import com.objectpad.app.ui.components.Glass
import com.objectpad.app.ui.components.GlassIcon
import com.objectpad.app.ui.components.IconCircle
import com.objectpad.app.ui.components.Lab
import com.objectpad.app.ui.components.Loading
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.Notice
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.QrCode
import com.objectpad.app.ui.components.Raised
import com.objectpad.app.ui.components.ScreenPadding
import com.objectpad.app.ui.components.StatCell
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.Sunk
import com.objectpad.app.ui.components.TopBar
import com.objectpad.app.ui.components.copyText
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.math.BigInteger

/** Account, wallet, portfolio, saved scans, creator earnings and settings. */
@Composable
fun MeScreen(app: AppUiState, onCoin: (String) -> Unit, onStudio: (String) -> Unit, onSignIn: () -> Unit, onOpen: (String) -> Unit, onRefresh: () -> Unit) {
    val manager = ObjectPadApp.instance.account
    val account by manager.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LazyColumn(contentPadding = ScreenPadding, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Lab("Your workspace"); Display(account.profile?.alias?.let { "Hi, $it." } ?: "Your objects.", 38, Modifier.padding(top = 6.dp)) }
        item {
            Raised(radius = 28.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GlassIcon(Glass.Shield, 48.dp)
                    Column(Modifier.weight(1f).padding(start = 10.dp)) {
                        Strong(if (account.signedIn) "Signed in" else "Guest on this phone")
                        Body(if (account.signedIn) "Same account, wallet and coins as objectpad.fun." else "Launching never needs an account. Sign in to keep scans and coins across devices.", size = 12)
                    }
                }
                if (account.signedIn) {
                    account.profile?.let { p -> MonoText("PUBLIC ID ${p.publicId.take(12)} · ALIAS ${p.alias}", Modifier.padding(top = 10.dp), size = 10) }
                    PadButton("Sign out", { scope.launch { manager.logout() } }, Modifier.fillMaxWidth().padding(top = 12.dp), style = BtnStyle.Ghost, height = 46.dp)
                } else PadButton("Sign in", onSignIn, Modifier.fillMaxWidth().padding(top = 12.dp), glass = Glass.Wallet, height = 54.dp)
            }
        }
        item { WalletCard(app, onRefresh) }
        item { Portfolio(app, onCoin) }
        item { MyScans(onStudio) }
        item { Earnings(app, onCoin) }
        item {
            Raised(radius = 24.dp, padding = 8.dp) {
                listOf(
                    Triple(Glass.Chain, "How it works", "docs"), Triple(Glass.Vault, "Launch treasury", "treasury"), Triple(Glass.Fingerprint, "Verified activity", "activity"),
                    Triple(Glass.Ai, "Community", "community"), Triple(Glass.Diamond, "Crafting Table", "craft"), Triple(Glass.Shield, "Safety & rights", "safety"), Triple(Glass.Chart, "System status", "status"),
                ).forEachIndexed { i, (g, t, r) ->
                    if (i > 0) Divider()
                    Row(Modifier.fillMaxWidth().press { onOpen(r) }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) { GlassIcon(g, 36.dp); Strong(t, Modifier.padding(start = 10.dp).weight(1f), size = 15); Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(16.dp), tint = Pad.Muted) }
                }
            }
        }
        item { Settings() }
    }
}

@Composable
private fun WalletCard(app: AppUiState, onRefresh: () -> Unit) {
    val context = LocalContext.current
    val manager = ObjectPadApp.instance.account
    val account by manager.state.collectAsStateWithLifecycle()
    var reveal by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }
    var key by remember { mutableStateOf("") }
    var keyError by remember { mutableStateOf<String?>(null) }
    var showQr by remember { mutableStateOf(false) }
    val wallet = account.activeWallet
    val h = app.holdings?.takeIf { it.wallet == wallet }
    Raised(radius = 28.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            GlassIcon(Glass.Wallet, 48.dp)
            Column(Modifier.weight(1f).padding(start = 10.dp)) { Lab("Wallet · Robinhood Chain"); Strong(if (account.accountWallet != null) "Account wallet" else if (wallet != null) "ObjectPad wallet · this phone" else "No wallet yet", size = 15) }
            if (wallet != null) IconCircle(Icons.Default.Refresh, "Refresh", onRefresh, size = 40.dp)
        }
        if (wallet == null) {
            Body("Create a wallet on this phone to trade and receive creator rewards. The key is sealed by Android’s secure hardware and never leaves the device.", Modifier.padding(top = 10.dp), size = 13)
            PadButton("Create my ObjectPad wallet", { manager.ensureLocalWallet(); onRefresh() }, Modifier.fillMaxWidth().padding(top = 12.dp), height = 52.dp)
            PadButton("Import a private key", { importing = true }, Modifier.fillMaxWidth().padding(top = 8.dp), style = BtnStyle.Ghost, height = 46.dp, icon = Icons.Default.Key)
        } else {
            Sunk(Modifier.fillMaxWidth().padding(top = 12.dp).press { context.copyText("Address", wallet) }) {
                Row(verticalAlignment = Alignment.CenterVertically) { MonoText(wallet, Modifier.weight(1f), color = Pad.Ink, size = 12); Icon(Icons.Default.ContentCopy, "Copy", Modifier.size(15.dp)) }
            }
            Row(Modifier.padding(top = 12.dp)) {
                StatCell("ETH", h?.eth?.let { Chain.formatUnits(it, 5) } ?: "…", Modifier.weight(1f))
                StatCell("Value", h?.eth?.let { Fmt.usd(app.ethUsd?.times(Chain.toEth(it))) } ?: "…", Modifier.weight(1f))
            }
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PadButton(if (showQr) "Hide QR" else "Receive", { showQr = !showQr }, Modifier.weight(1f), height = 46.dp)
                PadButton("Blockscout", { context.openUrl(Chain.addressUrl(wallet)) }, Modifier.weight(1f), style = BtnStyle.Glass, height = 46.dp, icon = Icons.AutoMirrored.Filled.OpenInNew)
            }
            if (showQr) Box(Modifier.fillMaxWidth().padding(top = 12.dp), contentAlignment = Alignment.Center) { Box(Modifier.clip(RoundedCornerShape(22.dp)).background(Pad.White).padding(16.dp)) { QrCode(wallet, Modifier.size(180.dp)) } }
            Body("Send only ETH on Robinhood Chain (chain id ${Chain.ID}).", Modifier.padding(top = 8.dp), size = 11)
            val local = manager.localWallet()
            if (local != null && account.accountWallet == null) {
                PadButton(if (reveal) "Hide private key" else "Back up private key", { reveal = !reveal }, Modifier.fillMaxWidth().padding(top = 10.dp), style = BtnStyle.Ghost, height = 44.dp, icon = Icons.Default.Key)
                if (reveal) Column(Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Pad.Down.copy(alpha = 0.07f)).padding(12.dp)) {
                    Text("Never share this. Anyone with it controls the wallet.", style = Type.small.copy(color = Pad.Down, fontSize = 12.sp))
                    MonoText(local.privateKeyHex, Modifier.padding(top = 6.dp), color = Pad.Ink, size = 11)
                    Text("Copy key", style = Type.strong.copy(fontSize = 13.sp), modifier = Modifier.padding(top = 8.dp).press { context.copyText("Private key", local.privateKeyHex) })
                }
            }
            if (local != null && account.accountWallet != null) Notice("This phone also holds an ObjectPad wallet (${Fmt.short(local.address)}) from before you signed in. Back it up from Blockscout balances before removing it.", Modifier.padding(top = 10.dp))
        }
    }
    if (importing) AlertDialog(
        onDismissRequest = { importing = false }, containerColor = Pad.White,
        title = { Text("Import a wallet", style = Type.display(22)) },
        text = { Field(key, { key = it.trim() }, "Private key", "0x… 64 hex characters", error = keyError, mono = true) },
        confirmButton = { TextButton({ manager.importLocalWallet(key).onSuccess { importing = false; key = ""; onRefresh() }.onFailure { keyError = it.message } }) { Text("Import", style = Type.strong) } },
        dismissButton = { TextButton({ importing = false }) { Text("Cancel", style = Type.strong) } },
    )
}

@Composable
private fun Portfolio(app: AppUiState, onCoin: (String) -> Unit) {
    val h = app.holdings ?: return
    val held = app.coins.data.orEmpty().mapNotNull { c -> h.coins[c.token]?.takeIf { it > BigInteger.ZERO }?.let { c to it } }
    Raised(radius = 28.dp, padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) { Lab("Portfolio · read from chain", Modifier.weight(1f)); MonoText(Fmt.timeAgo(h.at).uppercase(), size = 10) }
        if (held.isEmpty()) Body("No ObjectPad coins in this wallet yet.", Modifier.padding(top = 10.dp), size = 13)
        val total = held.sumOf { (c, b) -> Chain.toEth(b) * c.priceEth }
        if (held.isNotEmpty()) Display(Fmt.money(total, app.ethUsd), 28, Modifier.padding(top = 8.dp))
        held.forEach { (c, b) ->
            Row(Modifier.fillMaxWidth().press { onCoin(c.id) }.padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                CoinImage(c.logo, 36.dp, fallback = c.symbol)
                Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong("\$${c.symbol}", size = 14); MonoText(Fmt.compact(Chain.toEth(b)), size = 10) }
                Column(horizontalAlignment = Alignment.End) { Text(Fmt.money(Chain.toEth(b) * c.priceEth, app.ethUsd), style = Type.num); Text(Fmt.pct(c.change24h), style = Type.num.copy(fontSize = 11.sp, color = if (c.change24h >= 0) Pad.Up else Pad.Down)) }
            }
        }
        val failed = h.coins.count { it.value == null }
        if (failed > 0) MonoText("$failed BALANCES COULDN’T BE READ · PULL TO RETRY", Modifier.padding(top = 6.dp), size = 10, color = Pad.Down)
    }
}

@Composable
private fun MyScans(onStudio: (String) -> Unit) {
    val manager = ObjectPadApp.instance.account
    var scans by remember { mutableStateOf<List<CaptureSession>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val account by manager.state.collectAsStateWithLifecycle()
    LaunchedEffect(account.signedIn) { runCatching { Scans.mine(manager) }.onSuccess { scans = it; error = null }.onFailure { error = it.message } }
    Raised(radius = 28.dp, padding = 14.dp) {
        Lab("Saved scans")
        val list = scans
        when {
            list == null && error == null -> Loading()
            list == null -> Body(error ?: "", size = 13)
            list.isEmpty() -> Body("No scans yet. Tap Scan to tokenize your first object.", Modifier.padding(top = 8.dp), size = 13)
            else -> list.take(12).forEach { s ->
                val status = when { s.launch?.recordState == "confirmed" -> "Live"; s.launch != null -> "Launching"; s.isModelReady -> "3D ready"; s.isBuilding -> "Building 3D"; s.isCapturing -> "${s.views.size}/6 photos"; else -> s.state.replace('_', ' ') }
                Row(Modifier.fillMaxWidth().press { onStudio(s.id) }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    CoinImage(s.icon?.url ?: s.model?.thumbnailUrl?.takeIf { s.launch != null }, 40.dp, fallback = s.launchDraft?.symbol ?: "OP")
                    Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong(s.launchDraft?.publicName ?: s.suggestion?.name ?: "Scan ${s.id.take(6)}", size = 14, maxLines = 1); MonoText("${status.uppercase()} · ${Fmt.timeAgo(s.createdAt)}", size = 10) }
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(16.dp), tint = Pad.Muted)
                }
            }
        }
    }
}

/** Creator-fee balance in the Pons fee escrow, claimable by the creator wallet, plus every coin this creator launched. */
@Composable
private fun Earnings(app: AppUiState, onCoin: (String) -> Unit) {
    val context = LocalContext.current
    val manager = ObjectPadApp.instance.account
    val account by manager.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val wallet = account.profile?.wallet ?: account.activeWallet
    var escrow by remember(wallet) { mutableStateOf<BigInteger?>(null) }
    var mine by remember { mutableStateOf<List<ObjectRecord>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(wallet) { wallet?.let { w -> escrow = runCatching { ChainClient.escrowBalance(w) }.getOrNull() } }
    LaunchedEffect(account.profile?.publicId) { account.profile?.publicId?.let { id -> mine = runCatching { ObjectPadApi.creator(id).objects }.getOrNull() } }
    if (wallet == null) return
    val canClaim = account.activeWallet?.equals(wallet, true) == true && (escrow ?: BigInteger.ZERO) > BigInteger.ZERO
    Raised(radius = 28.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Coins, 44.dp); Column(Modifier.padding(start = 10.dp)) { Lab("Creator earnings"); Strong("1.5% of every trade on your coins") } }
        Display(escrow?.let { Fmt.eth(Chain.toEth(it), 6) } ?: "…", 30, Modifier.padding(top = 12.dp))
        MonoText("CLAIMABLE IN THE PONS FEE ESCROW · ${Fmt.short(wallet)}", size = 10)
        PadButton(if (busy) "Claiming…" else "Claim to wallet", {
            busy = true; msg = null
            scope.launch {
                try { val h = manager.signer().send(TxRequest(Chain.PONS_FEE_ESCROW, Abi.CLAIM)); ChainClient.waitForReceipt(h); msg = "Claimed. Receipt: ${Fmt.short(h, 10, 6)}"; escrow = ChainClient.escrowBalance(wallet); ObjectPadApp.instance.sounds.play("seal") }
                catch (e: Exception) { msg = e.message } finally { busy = false }
            }
        }, Modifier.fillMaxWidth().padding(top = 12.dp), enabled = canClaim, loading = busy, height = 50.dp)
        msg?.let { Notice(it, Modifier.padding(top = 8.dp)) }
        mine?.takeIf { it.isNotEmpty() }?.let { list ->
            Lab("Your coins", Modifier.padding(top = 14.dp))
            list.forEach { r ->
                Row(Modifier.fillMaxWidth().press { onCoin(r.objectId) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    CoinImage(r.iconUrl ?: r.model.thumbnailUrl, 36.dp, fallback = r.symbol)
                    Column(Modifier.weight(1f).padding(start = 10.dp)) { Strong(r.verifiedName.ifBlank { r.publicName }, size = 14, maxLines = 1); MonoText("\$${r.symbol}", size = 10) }
                    app.coin(r.objectId)?.let { Text(Fmt.money(it.marketCapEth, app.ethUsd, 2), style = Type.num) }
                }
            }
        }
        Text("Open earnings on objectpad.fun", style = Type.small.copy(fontSize = 12.sp, color = Pad.Ink), modifier = Modifier.padding(top = 8.dp).press { context.openUrl("${ObjectPadApi.SITE}/earnings") })
    }
}

@Composable
private fun Settings() {
    val prefs = ObjectPadApp.instance.prefs
    var sound by remember { mutableStateOf(prefs.sound) }
    var haptics by remember { mutableStateOf(prefs.haptics) }
    Raised(radius = 24.dp, padding = 14.dp) {
        Lab("Settings")
        listOf(Triple("Interface sound", sound) { v: Boolean -> sound = v; prefs.sound = v; if (v) ObjectPadApp.instance.sounds.play("orbit") }, Triple("Haptics", haptics) { v: Boolean -> haptics = v; prefs.haptics = v }).forEach { (label, value, set) ->
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Strong(label, Modifier.weight(1f), size = 15)
                Switch(value, set, colors = SwitchDefaults.colors(checkedTrackColor = Pad.Ink, checkedThumbColor = Pad.White, uncheckedTrackColor = Pad.Stone))
            }
        }
        MonoText("OBJECTPAD ANDROID 1.0 · ROBINHOOD CHAIN ${Chain.ID}", Modifier.padding(top = 10.dp), size = 10)
    }
}

/** Email-code and X sign-in through Privy: the same accounts and wallets as objectpad.fun. */
@Composable
fun SignInScreen(onBack: () -> Unit, onDone: () -> Unit) {
    val manager = ObjectPadApp.instance.account
    val account by manager.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(account.signedIn) { if (account.signedIn) onDone() }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar("Sign in", onBack)
        LazyColumn(contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 60.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { GlassIcon(Glass.Wallet, 80.dp, float = true); Display("One account. Everywhere.", 36, Modifier.padding(top = 10.dp)); Body("Sign in with the same X or email you use on objectpad.fun. Your scans, coins and wallet follow you. Launching stays free without an account.", Modifier.padding(top = 8.dp)) }
            if (!account.signInAvailable) item { Notice("Native sign-in is being switched on for this app build. Until then you can scan, launch and trade with the ObjectPad wallet on this phone — nothing is lost.") }
            else {
                item {
                    PadButton(if (busy && !sent) "Opening X…" else "Continue with X", {
                        busy = true; error = null
                        scope.launch { manager.loginWithX().onFailure { error = it.message ?: "X sign-in was cancelled." }; busy = false }
                    }, Modifier.fillMaxWidth(), height = 58.dp, loading = busy && !sent)
                }
                item {
                    Raised(radius = 26.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Email, null, Modifier.size(18.dp)); Strong("  Email code", size = 15) }
                        Field(email, { email = it.trim() }, "Email", "you@example.com", Modifier.padding(top = 10.dp), keyboard = KeyboardType.Email, enabled = !sent)
                        if (sent) Field(code, { code = it.filter(Char::isDigit).take(6) }, "6-digit code", "123456", Modifier.padding(top = 10.dp), keyboard = KeyboardType.Number, mono = true)
                        PadButton(if (sent) "Sign in" else "Send code", {
                            busy = true; error = null
                            scope.launch {
                                if (!sent) manager.sendEmailCode(email).onSuccess { sent = true }.onFailure { error = it.message ?: "The code couldn’t be sent." }
                                else manager.loginWithEmail(code, email).onFailure { error = it.message ?: "That code didn’t work." }
                                busy = false
                            }
                        }, Modifier.fillMaxWidth().padding(top = 12.dp), style = BtnStyle.Glass, enabled = if (sent) code.length == 6 else email.contains('@'), loading = busy && sent, icon = Icons.AutoMirrored.Filled.Send, height = 52.dp)
                        if (sent) Text("Use a different email", style = Type.small.copy(fontSize = 12.sp, color = Pad.Ink), modifier = Modifier.padding(top = 8.dp).press { sent = false; code = "" })
                    }
                }
            }
            error?.let { e -> item { Notice(e, tone = Pad.Down) } }
        }
    }
}

/** The common room: messages from ObjectPad creators. */
@Composable
fun CommunityScreen(onBack: () -> Unit) {
    val manager = ObjectPadApp.instance.account
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<CommunityMessage>?>(null) }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    suspend fun load() { runCatching { ObjectPadApi.messages().items }.onSuccess { items = it } }
    LaunchedEffect(Unit) { while (true) { load(); kotlinx.coroutines.delay(10_000) } }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar("Community", onBack)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Lab("The common room"); Display("Things bring us together.", 32, Modifier.padding(top = 6.dp, bottom = 6.dp)) }
            val list = items
            if (list == null) item { Loading() } else if (list.isEmpty()) item { Body("Be the first to say gm.") }
            else list.forEach { m -> item(m.id) { Raised(radius = 20.dp, padding = 12.dp) { Row { Strong(m.alias, Modifier.weight(1f), size = 13); MonoText(Fmt.timeAgo(m.createdAt), size = 10) }; Body(m.text, Modifier.padding(top = 4.dp), color = Pad.Ink, size = 14) } } }
        }
        Column(Modifier.padding(16.dp)) {
            error?.let { Notice(it, Modifier.padding(bottom = 8.dp), tone = Pad.Down) }
            Row(verticalAlignment = Alignment.Bottom) {
                Field(text, { text = it.take(600) }, "Message", "Say something to the room", Modifier.weight(1f), singleLine = false)
                Spacer(Modifier.width(8.dp))
                IconCircle(Icons.AutoMirrored.Filled.Send, "Send", {
                    if (text.isBlank() || busy) return@IconCircle
                    busy = true; error = null
                    scope.launch { runCatching { manager.write<kotlinx.serialization.json.JsonObject>("/messages", buildJsonObject { put("text", text.trim()) }) }.onSuccess { text = ""; load() }.onFailure { error = it.message }; busy = false }
                }, dark = true, size = 52.dp)
            }
        }
    }
}

/** The Crafting Table stays locked while the Forge contract is in production (the website shows the same). */
@Composable
fun CraftScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar("Crafting Table", onBack)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { GlassIcon(Glass.Diamond, 110.dp, float = true); Lab("The Crafting Table · launching soon", Modifier.padding(top = 12.dp)); Display("Mix real objects into rarer rewards.", 34, Modifier.padding(top = 6.dp)) }
            listOf("Pick two or three object coins you hold.", "Lock them into one Artifact.", "It earns from every coin inside.", "Longer locks and burns make it rarer.").forEachIndexed { i, t -> item { Raised(radius = 20.dp, padding = 14.dp) { Row(verticalAlignment = Alignment.CenterVertically) { Display("${i + 1}", 24); Body(t, Modifier.padding(start = 14.dp), color = Pad.Ink, weight = 700) } } } }
            item { Notice("Locked while the Forge contract is in production and audit. Nothing here takes deposits yet.") }
        }
    }
}
