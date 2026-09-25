package com.objectpad.app.ui.studio

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.CaptureSession
import com.objectpad.app.data.Chain
import com.objectpad.app.data.ScanView
import com.objectpad.app.data.describeError
import com.objectpad.app.data.isBuilding
import com.objectpad.app.data.isCapturing
import com.objectpad.app.data.isModelReady
import com.objectpad.app.data.isTerminal
import com.objectpad.app.ui.AppUiState
import com.objectpad.app.ui.Fmt
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Chip
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.ErrorCard
import com.objectpad.app.ui.components.Field
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
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.Sunk
import com.objectpad.app.ui.components.TopBar
import com.objectpad.app.ui.components.copyText
import com.objectpad.app.ui.components.openUrl
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.components.shareText
import com.objectpad.app.ui.scan.CameraRig
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type

private const val MAX_REGENERATIONS = 2

private fun stepOf(s: CaptureSession): Int = when {
    s.launch != null -> 4
    s.isModelReady -> 4
    s.state in setOf("reconstructing", "validating") -> 3
    s.state == "screening" || (s.state == "review" && s.views.size >= 6) -> 2
    s.views.isNotEmpty() -> 1
    else -> 0
}

/** The studio for one scan: progress, 3D model, coin details and launch. Mirrors objectpad.fun/launch/<id>. */
@Composable
fun StudioScreen(id: String, app: AppUiState, onBack: () -> Unit, onScan: (String) -> Unit, onOpen: (String) -> Unit, onCoin: (String) -> Unit) {
    val vm: StudioViewModel = viewModel(key = "studio")
    LaunchedEffect(id) { vm.open(id) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var confirmReset by remember { mutableStateOf(false) }
    val s = ui.session

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar(s?.launchDraft?.publicName ?: s?.suggestion?.name ?: if (s?.isCapturing == true) "Your scan" else "Your object", onBack) {
            val canReset = s != null && s.launch == null && !s.isTerminal && s.autoLaunch != true && s.launchQueuedAt == null
            if (canReset) IconCircle(Icons.Default.RestartAlt, "Start over", { confirmReset = true })
        }
        when {
            ui.loading -> Loading("Opening your scan…")
            s == null -> Column(Modifier.padding(16.dp)) {
                ErrorCard(ui.error ?: "The scan could not be opened.", { vm.open(id) })
                PadButton("Start a new scan", { onScan("") }, Modifier.fillMaxWidth().padding(top = 12.dp), glass = Glass.Qr)
            }
            else -> LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 4.dp, 16.dp, 60.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item { Stepper(s) }
                item {
                    when {
                        s.launch != null -> if (s.model != null) ModelCard(vm, s, 360) else ModelPending(s)
                        s.isCapturing -> CaptureCard(s, onScan)
                        s.isBuilding -> Building(s)
                        s.isModelReady -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            ModelCard(vm, s, 380)
                            Raised(padding = 10.dp, radius = 22.dp) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Strong("Like it?", Modifier.padding(start = 6.dp), size = 14)
                                    Spacer(Modifier.weight(1f))
                                    val left = MAX_REGENERATIONS - (s.regenerations ?: 0)
                                    PadButton("Regenerate · $left", vm::regenerate, style = BtnStyle.Ghost, enabled = left > 0, loading = ui.busy == "regenerate", height = 42.dp, icon = Icons.Default.Refresh)
                                    PadButton("Rescan", { vm.rescan(onScan) }, style = BtnStyle.Ghost, loading = ui.busy == "rescan", height = 42.dp)
                                }
                                s.model?.let { MonoText("${"%,d".format(it.triangles)} TRIS · ${it.textures} TEXTURES · ${s.views.size} PHOTOS", Modifier.padding(start = 6.dp, top = 6.dp), size = 10) }
                            }
                        }
                        s.state == "review" && s.failureCode != null -> Problem("Let’s try that again.", describeError(s.failureCode)) {
                            PadButton("Try again now", vm::reconstruct, Modifier.fillMaxWidth(), loading = ui.busy == "reconstruct", icon = Icons.Default.Refresh)
                            PadButton("Rescan", { vm.rescan(onScan) }, Modifier.fillMaxWidth().padding(top = 8.dp), style = BtnStyle.Glass)
                        }
                        s.state == "failed" || (s.state == "blocked" && s.failureCode == "PROVIDER_SUBMISSION_UNCERTAIN") -> {
                            val retries = 8 - (s.failureRetries ?: 0)
                            Problem(if (retries > 0) "The 3D engine hiccupped." else "We couldn’t build this one.", if (retries > 0) "Your photos are safe. Rebuild from the same photos. Free, and it doesn’t use up your rebuilds." else "Rescan the object on a plain surface in even light.") {
                                if (retries > 0) PadButton(if (ui.busy == "regenerate") "Sending to the 3D engine…" else "Try again now", vm::regenerate, Modifier.fillMaxWidth(), loading = ui.busy == "regenerate", icon = Icons.Default.Refresh)
                                PadButton("Rescan", { vm.rescan(onScan) }, Modifier.fillMaxWidth().padding(top = 8.dp), style = BtnStyle.Glass)
                            }
                        }
                        else -> Problem(
                            when { s.failureCode == "DUPLICATE_OBJECT" -> "Already on ObjectPad."; s.state == "cancelled" -> "Scan cancelled."; s.state == "expired" -> "This scan expired."; else -> "This scan is on hold." },
                            s.failureCode?.let { if (it == "PROVIDER_SUBMISSION_UNCERTAIN") "We couldn’t confirm the 3D job started, so we paused instead of paying twice. An operator will review it." else describeError(it) } ?: "Start a fresh scan any time.",
                        ) { PadButton("Start a new scan", { onScan("") }, Modifier.fillMaxWidth(), glass = Glass.Qr) }
                    }
                }
                ui.actionError?.let { e -> item { Notice(e, tone = Pad.Down) } }
                item {
                    when {
                        s.launch != null -> LaunchProgress(vm, s, onOpen, onCoin)
                        !s.isTerminal && s.state != "failed" && (s.isBuilding || s.isModelReady) -> CoinPanel(vm, s, app)
                        s.isCapturing -> NextSteps()
                        else -> Unit
                    }
                }
                if (s.launch == null && (s.isBuilding || s.isModelReady)) item { SaveLink(s) }
            }
        }
    }
    if (confirmReset) AlertDialog(
        onDismissRequest = { confirmReset = false }, containerColor = Pad.White,
        title = { Text("Start a new scan?", style = Type.display(24)) },
        text = { Body(if (s?.views?.isNotEmpty() == true) "This cancels the current scan and deletes its ${s.views.size} photo${if (s.views.size == 1) "" else "s"}. Paired devices are disconnected." else "This cancels the current scan.") },
        confirmButton = { TextButton({ confirmReset = false; vm.startOver { onScan(it) } }) { Text("Cancel scan & start new", style = Type.strong.copy(color = Pad.Down, fontSize = 14.sp)) } },
        dismissButton = { TextButton({ confirmReset = false }) { Text("Keep this scan", style = Type.strong.copy(fontSize = 14.sp)) } },
    )
}

@Composable
private fun Stepper(s: CaptureSession) {
    val steps = listOf("Phone" to Glass.Qr, "Photos" to Glass.Mesh, "AI check" to Glass.Ai, "3D model" to Glass.Fingerprint, "Coin" to Glass.Rocket)
    val current = stepOf(s)
    Raised(radius = 22.dp, padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Lab(if (s.guest == true) "Private scan · saved on this phone" else "Saved to your inventory")
                Strong("Step ${current + 1} of 5 · ${steps[current].first}", Modifier.padding(top = 4.dp))
            }
            GlassIcon(steps[current].second, 40.dp)
        }
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            steps.indices.forEach { i -> Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(50)).background(if (i < current) Pad.Ink else if (i == current) Pad.Ink.copy(alpha = 0.55f) else Pad.Ink.copy(alpha = 0.1f))) }
        }
    }
}

@Composable
private fun ModelCard(vm: StudioViewModel, s: CaptureSession, height: Int) {
    val model = s.model ?: return
    val headers = remember(s.id) { suspend { vm.caller.headersForDownload() } }
    Box(Modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(32.dp)).background(Pad.raised).border(1.dp, Pad.Ink.copy(alpha = 0.08f), RoundedCornerShape(32.dp))) {
        ScanGrid()
        ModelViewer(ModelSource(model.modelUrl, headers, key = model.optimizedHash), Modifier.fillMaxSize(), snapshot = vm.needsSnapshot(s), onSnapshot = { vm.uploadSnapshot(it) })
        Row(Modifier.padding(14.dp)) { Chip("Drag 360°") ; Spacer(Modifier.width(6.dp)); Chip("Private until launch") }
    }
}

@Composable
private fun ScanGrid() {
    Canvas(Modifier.fillMaxSize()) {
        val step = 28.dp.toPx(); val c = Pad.Ink.copy(alpha = 0.045f)
        var x = 0f; while (x < size.width) { drawLine(c, Offset(x, 0f), Offset(x, size.height), 1f); x += step }
        var y = 0f; while (y < size.height) { drawLine(c, Offset(0f, y), Offset(size.width, y), 1f); y += step }
    }
}

@Composable
private fun CaptureCard(s: CaptureSession, onScan: (String) -> Unit) {
    Raised(radius = 30.dp) {
        GlassIcon(Glass.Qr, 64.dp, float = true)
        Display(if (s.views.isEmpty()) "Scan your object." else "${s.views.size} of 6 photos in.", 30, Modifier.padding(top = 12.dp))
        Body(if (s.views.isEmpty()) "Walk around it once. The camera shoots six angles by itself." else "Pick up where you left off. Accepted angles stay saved.", Modifier.padding(top = 6.dp))
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ScanView.entries.forEach { v ->
                val done = s.views.any { it.view == v.id }
                Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(if (done) Pad.Ink else Pad.Ink.copy(alpha = 0.06f)).padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (done) Icon(Icons.Default.Check, null, tint = Pad.White, modifier = Modifier.size(14.dp)) else Box(Modifier.size(14.dp))
                    MonoText(v.short.uppercase(), size = 8, color = if (done) Pad.White else Pad.Ink.copy(alpha = 0.55f))
                }
            }
        }
        PadButton(if (s.views.isEmpty()) "Open the scanner" else "Continue scanning", { onScan(s.id) }, Modifier.fillMaxWidth().padding(top = 16.dp), glass = Glass.Qr, height = 62.dp)
    }
}

@Composable
private fun Building(s: CaptureSession) {
    val validating = s.state == "validating"; val screening = s.state == "screening" || s.state == "review"
    val progress = if (validating) 100.0 else s.job?.progress ?: 0.0
    val headline = when { screening -> "AI is naming your object"; validating -> "Checking your model"; progress < 45 -> "Building the shape"; progress < 85 -> "Painting the colours"; else -> "Final touches" }
    val stages = listOf("AI check", "Shape", "Colour", "Finishing", "Checking")
    val active = when { screening -> 0; validating -> 4; progress >= 85 -> 3; progress >= 45 -> 2; else -> 1 }
    val t = rememberInfiniteTransition(label = "lattice")
    val phase by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2400), RepeatMode.Restart), label = "p")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp)).background(Pad.night)) {
        Box(Modifier.fillMaxWidth().height(280.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val cols = 22; val rows = 14; val fill = (progress / 100.0).toFloat()
                for (r in 0 until rows) for (c in 0 until cols) {
                    val x = size.width * (c + 0.5f) / cols; val y = size.height * (r + 0.5f) / rows
                    val on = (r * cols + c).toFloat() / (rows * cols) < fill || (screening && ((c + r + (phase * 30).toInt()) % 9 == 0))
                    drawCircle(if (on) Color.White.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.12f), radius = if (on) 3.2f else 2f, center = Offset(x, y))
                }
                drawLine(Color.White.copy(alpha = 0.6f), Offset(0f, size.height * phase), Offset(size.width, size.height * phase), 2f)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                GlassIcon(if (screening) Glass.Ai else Glass.Mesh, 84.dp, float = true)
                Display(if (screening) "…" else "${progress.toInt()}%", 44, Modifier.padding(top = 6.dp), color = Color.White)
            }
        }
        Column(Modifier.fillMaxWidth().background(Pad.White).padding(18.dp)) {
            Strong(headline, size = 18)
            Body(if (screening) "Checking it’s a real, single object that isn’t already on ObjectPad." else "Your six photos are becoming a full-colour 3D model. About 2–4 minutes.", Modifier.padding(top = 4.dp), size = 13)
            ProgressBar((if (screening) 0.06 else progress / 100).toFloat(), Modifier.padding(top = 12.dp))
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                stages.forEachIndexed { i, st -> Box(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(if (i < active) Pad.Ink else if (i == active) Pad.Ink.copy(alpha = 0.12f) else Pad.Ink.copy(alpha = 0.04f)).padding(vertical = 7.dp), contentAlignment = Alignment.Center) { MonoText(st.uppercase(), size = 8, color = if (i < active) Pad.White else Pad.Ink.copy(alpha = 0.65f), maxLines = 1) } }
            }
            s.job?.queue?.takeIf { it > 0 }?.let { MonoText("$it AHEAD IN THE 3D ENGINE QUEUE", Modifier.padding(top = 8.dp), size = 10) }
            MonoText("You can leave this screen. The build keeps going.", Modifier.padding(top = 8.dp), size = 10)
        }
    }
}

@Composable
private fun ModelPending(s: CaptureSession) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp)).background(Pad.night).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        GlassIcon(Glass.Mesh, 72.dp, float = true)
        Strong("Coin sealed. 3D model still building${s.job?.progress?.let { " · ${it.toInt()}%" } ?: ""}.", Modifier.padding(top = 10.dp), color = Color.White)
        Body("It goes live on Robinhood Chain the moment the model is done.", Modifier.padding(top = 4.dp), color = Color.White.copy(alpha = 0.6f), size = 13)
    }
}

@Composable
private fun Problem(title: String, text: String, actions: @Composable () -> Unit) {
    Raised(radius = 30.dp) {
        GlassIcon(Glass.Shield, 56.dp)
        Display(title, 28, Modifier.padding(top = 12.dp))
        Body(text, Modifier.padding(top = 6.dp, bottom = 14.dp))
        actions()
    }
}

@Composable
private fun NextSteps() {
    Raised(radius = 28.dp) {
        Lab("Next: 3D model → coin")
        Strong("Launch unlocks once your 3D model is built.", Modifier.padding(top = 8.dp), size = 17)
        listOf(Glass.Mesh to "One object, plain table, even daylight.", Glass.Qr to "Keep it still. Move yourself around it.", Glass.Ai to "AI names it and checks it’s one of one.", Glass.Shield to "Six angles. The camera guides you.").forEach { (g, t) ->
            Sunk(Modifier.fillMaxWidth().padding(top = 8.dp), padding = 8.dp) { Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(g, 34.dp); Spacer(Modifier.width(10.dp)); Body(t, size = 13, weight = 700) } }
        }
    }
}

@Composable
private fun CoinPanel(vm: StudioViewModel, s: CaptureSession, app: AppUiState) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val account by ObjectPadApp.instance.account.state.collectAsStateWithLifecycle()
    val f = ui.form; val errors = if (ui.showErrors) f.errors() else emptyMap()
    val ready = s.isModelReady; val building = s.isBuilding; val queued = building && s.autoLaunch == true
    val t = app.treasury
    Raised(radius = 30.dp, modifier = Modifier.animateContentSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            GlassIcon(Glass.Coins, 40.dp); Strong("Name your coin", Modifier.padding(start = 8.dp).weight(1f), size = 19)
            if (s.suggestion != null) Chip("AI filled")
        }
        Body(s.suggestion?.let { "Detected: ${it.`object`}. " } ?: "AI suggests a name after the one-of-one check. " + "The coin name can’t change after launch.", Modifier.padding(top = 4.dp), size = 12)
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Field(f.publicName, { v -> vm.edit { it.copy(publicName = v.take(32)) } }, "Coin name", "Chubby Vinyl Frog", Modifier.weight(1.5f), errors["name"])
            Field(f.symbol, { v -> vm.edit { it.copy(symbol = v.uppercase().filter { c -> c.isLetterOrDigit() }.take(10)) } }, "Ticker", "FROG", Modifier.weight(1f), errors["symbol"], mono = true)
        }
        Field(f.story, { v -> vm.edit { it.copy(story = v.take(280)) } }, "Description", "Where it came from, why it matters.", Modifier.padding(top = 10.dp), errors["story"], singleLine = false, minLines = 2)
        Field(f.xUrl, { v -> vm.edit { it.copy(xUrl = v.trim()) } }, "X (optional)", "https://x.com/handle", Modifier.padding(top = 10.dp), errors["x"])
        Field(f.telegram, { v -> vm.edit { it.copy(telegram = v.trim()) } }, "Telegram (optional)", "https://t.me/group", Modifier.padding(top = 10.dp), errors["telegram"])
        val coinPath = s.coinUrl?.removePrefix("https://") ?: "objectpad.fun/o/…"
        Field(coinPath, {}, "Website", "", Modifier.padding(top = 10.dp), hint = "Your coin’s permanent ObjectPad page, fixed before launch.", mono = true, enabled = false)
        IconPicker(vm, s, Modifier.padding(top = 12.dp))
        Field(f.feeWallet, { v -> vm.edit { it.copy(feeWallet = v.trim()) } }, "Fee wallet (optional)", "0x… receives the 1.5% creator fee", Modifier.padding(top = 10.dp), errors["fee"], mono = true,
            hint = if (account.activeWallet != null) "Prefilled with your ${if (account.signedIn) "account" else "ObjectPad"} wallet." else "Leave empty: we create an ObjectPad wallet on this phone at launch.")
        s.onchain?.let { o ->
            Sunk(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                MonoText("WRITTEN INTO YOUR LAUNCH TRANSACTION", size = 10)
                Strong(o.objectName, Modifier.padding(top = 4.dp)); MonoText(o.objectTag, Modifier.padding(top = 2.dp), color = Pad.Ink)
            }
        }
        val label = when { queued -> "Launch queued — building your 3D model"; ui.busy == "launch" -> "Sealing & launching…"; !(ready || building) -> "Unlocks when your 3D model is ready"; ready -> if (t.open) "Launch free" else "Seal & queue launch"; else -> "Seal now · launches when 3D is done" }
        PadButton(label, vm::launch, Modifier.fillMaxWidth().padding(top = 16.dp), enabled = (ready || building) && !queued, loading = ui.busy == "launch", glass = Glass.Rocket, height = 62.dp)
        if (queued) Notice("Sealed. Your coin launches the second the 3D model finishes building. You can close the app.", Modifier.padding(top = 8.dp), tone = Pad.Up)
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PadButton(if (ui.busy == "save") "Saving…" else if (s.launchDraft != null && !ui.dirty) "Details saved" else "Save details", vm::save, Modifier.weight(1f), style = BtnStyle.Ghost, height = 46.dp, enabled = ui.dirty || s.launchDraft == null)
            Sunk(Modifier.weight(1f), radius = 50.dp, padding = 12.dp) { MonoText(if (s.guest == true) "SAVED ON THIS PHONE" else "IN YOUR INVENTORY", Modifier.align(Alignment.CenterHorizontally), size = 10, maxLines = 1) }
        }
        Body(if (t.open) "$0 to you. The ObjectPad treasury pays the launch fee, first buy (burned) and gas · ${t.launchesLeft} free launches left today." else "The treasury is topping up. Your coin is sealed now and launches automatically.", Modifier.padding(top = 10.dp), size = 11)
    }
}

@Composable
private fun IconPicker(vm: StudioViewModel, s: CaptureSession, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val ui by vm.ui.collectAsStateWithLifecycle()
    val locked = s.launch?.hash != null
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            val bmp = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: error("That image couldn’t be opened. Try a JPG or PNG.")
            vm.customIcon(CameraRig.squareIcon(bmp))
        }.onFailure { ObjectPadApp.instance.sounds.play("rejected") }
    }
    Sunk(modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(58.dp).clip(RoundedCornerShape(16.dp)).background(Pad.White), contentAlignment = Alignment.Center) {
                val icon = s.icon
                if (icon != null) AsyncImage(icon.url, "Coin icon", Modifier.fillMaxSize()) else MonoText(if (s.model != null) "…" else "LOADING", size = 9)
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Strong("Coin icon", size = 14)
                Body(when { locked -> "Locked in with the launch."; s.icon?.source == "custom" -> "Your own image."; s.icon != null -> "Front snapshot of your 3D model."; else -> "Snapshot of your 3D model, made when it lands." }, size = 12)
            }
            if (!locked) {
                if (s.icon?.source == "custom") IconCircle(Icons.Default.RestartAlt, "Use the 3D snapshot", vm::resetIcon, size = 40.dp)
                Spacer(Modifier.width(6.dp))
                IconCircle(Icons.Default.AddPhotoAlternate, "Use my own image", { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, size = 40.dp, dark = true)
            } else Icon(Icons.Default.Lock, null, tint = Pad.Muted)
        }
        if (ui.iconBusy) ProgressBar(0.6f, Modifier.padding(top = 8.dp), height = 4.dp)
    }
}

@Composable
private fun SaveLink(s: CaptureSession) {
    val context = LocalContext.current
    val url = "https://www.objectpad.fun/launch/${s.id}"
    var copied by remember { mutableStateOf(false) }
    Raised(radius = 26.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Qr, 40.dp); Column(Modifier.padding(start = 10.dp)) { Strong("Save your scan link"); Body("Come back any time to check progress and launch.", size = 12) } }
        Sunk(Modifier.fillMaxWidth().padding(top = 10.dp).press { context.copyText("Scan link", url); copied = true }) { MonoText(url.removePrefix("https://"), color = Pad.Ink.copy(alpha = 0.75f), maxLines = 1) }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PadButton(if (copied) "Copied" else "Copy link", { context.copyText("Scan link", url); copied = true }, Modifier.weight(1f), height = 46.dp, icon = if (copied) Icons.Default.Check else Icons.Default.ContentCopy)
            PadButton("Share", { context.shareText(url) }, Modifier.weight(1f), style = BtnStyle.Glass, height = 46.dp, icon = Icons.Default.Share)
        }
    }
}

@Composable
private fun LaunchProgress(vm: StudioViewModel, s: CaptureSession, onOpen: (String) -> Unit, onCoin: (String) -> Unit) {
    val context = LocalContext.current
    val ui by vm.ui.collectAsStateWithLifecycle()
    val launch = s.launch ?: return
    val confirmed = launch.recordState == "confirmed"
    val review = launch.recordState == "reorg_review" || launch.state == "reorg_review"
    val queued = launch.hash == null && s.failureCode != null
    val stage = if (confirmed) 3 else if (launch.hash != null) 2 else 1
    val symbol = s.launchDraft?.symbol ?: ""
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Raised(radius = 30.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (confirmed) GlassIcon(Glass.Rocket, 64.dp, float = true) else GlassIcon(Glass.Chain, 52.dp)
                Column(Modifier.padding(start = 10.dp)) {
                    Display(when { confirmed -> "\$$symbol is live."; review -> "Held for review"; queued -> "Sealed & queued"; launch.hash != null -> "Confirming on-chain…"; else -> "Sending launch…" }, 26)
                    Body(when { confirmed -> "Your object is now a coin on Robinhood Chain."; review -> "The receipt didn’t match the sealed record exactly, so it’s held for a person to check."; queued -> s.failureCode?.let { describeError(it) } ?: "Waiting for the treasury."; else -> "The treasury is sending your launch." }, Modifier.padding(top = 2.dp), size = 13)
                }
            }
            Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("Sealed", "Sent", "Confirmed").forEachIndexed { i, l ->
                    Row(Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if (i < stage) Pad.Ink else Pad.Ink.copy(alpha = 0.06f)).padding(vertical = 11.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        if (i < stage) Icon(Icons.Default.Check, null, tint = Pad.White, modifier = Modifier.size(12.dp))
                        Text(" $l", style = Type.strong.copy(fontSize = 12.sp, color = if (i < stage) Pad.White else Pad.Ink.copy(alpha = 0.6f)))
                    }
                }
            }
            if (launch.hash == null && !review) {
                IconPicker(vm, s, Modifier.padding(top = 12.dp))
                if (queued && s.model != null) PadButton("Launch now", vm::retryLaunch, Modifier.fillMaxWidth().padding(top = 10.dp), loading = ui.busy == "launch", glass = Glass.Rocket)
            }
            if (confirmed) {
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PadButton("Open coin", { s.objectId?.let(onCoin) }, Modifier.weight(1f), height = 50.dp)
                    PadButton("Share", { context.shareText("I just tokenized a real ${s.suggestion?.`object` ?: "object"}: \$$symbol on @ObjectPad. Scanned in 3D, named on-chain, one of one. ${s.coinUrl ?: ""}") }, Modifier.weight(1f), style = BtnStyle.Glass, height = 50.dp, icon = Icons.Default.Share)
                }
            }
            launch.hash?.let { h -> Row(Modifier.padding(top = 12.dp).press { context.openUrl(Chain.txUrl(h)) }, verticalAlignment = Alignment.CenterVertically) { MonoText("TX ${Fmt.short(h, 10, 8)}", color = Pad.Ink); Icon(Icons.AutoMirrored.Filled.OpenInNew, null, Modifier.padding(start = 4.dp).size(13.dp)) } }
        }
        Raised(radius = 24.dp) {
            Lab("On-chain object record")
            Strong(launch.objectName ?: s.onchain?.objectName ?: "—", Modifier.padding(top = 6.dp))
            MonoText(launch.objectTag ?: s.onchain?.objectTag ?: "", color = Pad.Ink)
            MonoText("Fees → ${if (launch.feeRecipientKind == "launch_pool") "free-launch pool" else Fmt.short(launch.feeWallet)}", Modifier.padding(top = 6.dp), size = 11)
        }
        val local = ObjectPadApp.instance.account.localWallet()
        if (confirmed && local != null && launch.feeWallet?.equals(local.address, true) == true) Raised(radius = 24.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) { GlassIcon(Glass.Wallet, 44.dp); Column(Modifier.padding(start = 10.dp)) { Strong("Your ObjectPad wallet"); MonoText(Fmt.short(local.address, 10, 6)) } }
            Body("Creator rewards from this coin go here. It was made on this phone and only you hold the key. Back it up from Me → Wallet.", Modifier.padding(top = 8.dp), size = 13)
        }
    }
}

@Suppress("unused") private val unusedWeight = FontWeight.Bold
