package com.objectpad.app.ui.scan

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.objectpad.app.data.ScanView
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.GlassIcon
import com.objectpad.app.ui.components.Glass
import com.objectpad.app.ui.components.IconCircle
import com.objectpad.app.ui.components.MonoText
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.components.PulseDot
import com.objectpad.app.ui.components.Strong
import com.objectpad.app.ui.components.press
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Type
import kotlinx.coroutines.delay

/**
 * Full-screen phone scanner. `sessionId`/`token` come from a QR handoff; with neither, a fresh private scan opens.
 * When all six photos are accepted and reviewed, [onDone] opens the live studio for the 3D build and launch.
 */
@Composable
fun ScanScreen(sessionId: String?, token: String?, onClose: () -> Unit, onDone: (String) -> Unit) {
    val vm: ScanViewModel = viewModel()
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.open(sessionId, token) }
    LaunchedEffect(ui.phase, ui.id) { if (ui.phase == ScanPhase.Done) ui.id?.let(onDone) }

    Box(Modifier.fillMaxSize().background(Pad.Obsidian)) {
        when {
            ui.error != null && ui.phase != ScanPhase.Camera -> PairError(ui.error!!, onClose)
            ui.phase == ScanPhase.Pairing -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
                MonoText("OPENING YOUR PRIVATE SCAN…", Modifier.padding(top = 14.dp), color = Color.White.copy(alpha = 0.6f), size = 11)
            }
            ui.phase == ScanPhase.Intro -> Intro(onStart = { vm.setPhase(ScanPhase.Camera) }, onBack = onClose)
            ui.phase == ScanPhase.Camera -> CameraPhase(vm, ui, onClose)
            ui.phase == ScanPhase.Review -> Review(ui, vm.headers(), onRetake = { vm.retake(it) }, onBuild = { ui.id?.let(onDone) })
            else -> Unit
        }
    }
}

@Composable
private fun PairError(message: String, onClose: () -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
        GlassIcon(Glass.Qr, 88.dp)
        Display("One more try.", 38, Modifier.padding(top = 18.dp), color = Color.White)
        Body(message, Modifier.padding(top = 10.dp), color = Color.White.copy(alpha = 0.72f), size = 16)
        PadButton("Back", onClose, Modifier.fillMaxWidth().padding(top = 24.dp), style = BtnStyle.Glass)
    }
}

private data class Tip(val title: String, val text: String)
private val TIPS = listOf(
    Tip("Set it up", "One object on a plain table, in even light."),
    Tip("Keep it still", "The object stays put. You move around it."),
    Tip("Walk one lap", "Four sides at object height, then two from above. The camera shoots by itself."),
)

@Composable
private fun Intro(onStart: () -> Unit, onBack: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) { delay(3200); step = (step + 1) % TIPS.size } }
    val scan = rememberInfiniteTransition(label = "scan")
    val y by scan.animateFloat(0.12f, 0.88f, infiniteRepeatable(tween(2200), RepeatMode.Reverse), label = "y")
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            IconCircle(Icons.AutoMirrored.Filled.ArrowBack, "Back", onBack)
            Spacer(Modifier.weight(1f))
            Row(Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.1f)).padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                PulseDot(Pad.UpGlow); Spacer(Modifier.width(8.dp)); Text("Connected to your scan", style = Type.strong.copy(color = Color.White, fontSize = 13.sp))
            }
        }
        Box(Modifier.padding(horizontal = 16.dp).weight(1f).fillMaxWidth().clip(RoundedCornerShape(32.dp)).background(Color.White.copy(alpha = 0.05f)).border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(32.dp)), contentAlignment = Alignment.Center) {
            GlassIcon(Glass.Mesh, 170.dp, float = true)
            Canvas(Modifier.fillMaxSize().padding(40.dp)) {
                val c = Color.White.copy(alpha = 0.7f); val l = 34.dp.toPx(); val s = Stroke(3.dp.toPx(), cap = StrokeCap.Round)
                listOf(Offset(0f, 0f) to Offset(1f, 1f), Offset(size.width, 0f) to Offset(-1f, 1f), Offset(0f, size.height) to Offset(1f, -1f), Offset(size.width, size.height) to Offset(-1f, -1f)).forEach { (o, d) ->
                    drawLine(c, o, Offset(o.x + d.x * l, o.y), s.width, StrokeCap.Round); drawLine(c, o, Offset(o.x, o.y + d.y * l), s.width, StrokeCap.Round)
                }
                drawLine(Color.White.copy(alpha = 0.85f), Offset(0f, size.height * y), Offset(size.width, size.height * y), 2.dp.toPx())
            }
        }
        Column(Modifier.padding(20.dp)) {
            MonoText("STEP ${step + 1} OF 3", color = Color.White.copy(alpha = 0.55f), size = 11)
            AnimatedContent(step, transitionSpec = { (slideInHorizontally { it / 3 } + fadeIn()) togetherWith fadeOut() }, label = "tip") { s ->
                Column(Modifier.padding(top = 8.dp)) {
                    Display(TIPS[s].title, 30, color = Color.White)
                    Body(TIPS[s].text, Modifier.padding(top = 6.dp), color = Color.White.copy(alpha = 0.75f), size = 16)
                }
            }
            Row(Modifier.padding(vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TIPS.indices.forEach { i ->
                    val w by animateFloatAsState(if (i <= step) 1f else 0f, tween(500), label = "w")
                    Box(Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.2f))) { Box(Modifier.fillMaxWidth(w).height(4.dp).background(Color.White)) }
                }
            }
            PadButton("Open camera", onStart, Modifier.fillMaxWidth(), style = BtnStyle.Glass, icon = Icons.Default.CameraAlt, height = 62.dp)
            Body("Photos stay private. Location data is removed.", Modifier.fillMaxWidth().padding(top = 10.dp), color = Color.White.copy(alpha = 0.5f), size = 12, align = TextAlign.Center)
        }
    }
}

@Composable
private fun CameraPhase(vm: ScanViewModel, ui: ScanUi, onClose: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    var cameraError by remember { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> granted = ok; denied = !ok }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    if (!granted) {
        Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
            Display(if (denied) "Camera is off." else "Allow the camera", 34, color = Color.White)
            Body(if (denied) "ObjectPad needs the camera to scan your object. Turn it on in Settings, then come back." else "Needed to photograph your object from six angles.", Modifier.padding(top = 10.dp), color = Color.White.copy(alpha = 0.7f))
            PadButton(if (denied) "Open Settings" else "Allow camera", {
                if (denied) runCatching { context.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:${context.packageName}")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
                else launcher.launch(Manifest.permission.CAMERA)
            }, Modifier.fillMaxWidth().padding(top = 20.dp), style = BtnStyle.Glass)
            PadButton("Back", onClose, Modifier.fillMaxWidth().padding(top = 10.dp), style = BtnStyle.Ghost)
        }
        return
    }

    val rig = remember { CameraRig(context) }
    val pose = remember { PoseTracker(context) }
    DisposableEffect(Unit) {
        vm.pose = pose; vm.shoot = { rig.takeJpeg() }; vm.setSensor(pose.available); pose.start()
        onDispose { pose.stop(); rig.release(); vm.shoot = null }
    }

    Box(Modifier.fillMaxSize()) {
        AndroidView(factory = { ctx -> PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER; rig.bind(owner, this, { img -> vm.onFrame(FrameAnalyzer.check(img)) }, { cameraError = it }) } }, modifier = Modifier.fillMaxSize())
        val target = ui.target
        val ready = ui.hud.light == "ok" && ui.hud.sharp && ui.hud.hasObject && ui.hud.steady && ui.hud.angle
        val frameColor by animateFloatAsState(if (ready) 1f else 0f, tween(250), label = "frame")
        Canvas(Modifier.fillMaxSize().padding(horizontal = 36.dp, vertical = 180.dp)) {
            val c = androidx.compose.ui.graphics.lerp(Color.White.copy(alpha = 0.8f), Pad.UpGlow, frameColor)
            val l = 42.dp.toPx(); val w = 4.dp.toPx()
            listOf(Offset(0f, 0f) to Offset(1f, 1f), Offset(size.width, 0f) to Offset(-1f, 1f), Offset(0f, size.height) to Offset(1f, -1f), Offset(size.width, size.height) to Offset(-1f, -1f)).forEach { (o, d) ->
                drawLine(c, o, Offset(o.x + d.x * l, o.y), w, StrokeCap.Round); drawLine(c, o, Offset(o.x, o.y + d.y * l), w, StrokeCap.Round)
            }
            if (ui.hud.hold > 0f) drawArc(Pad.UpGlow, -90f, 360f * ui.hud.hold, false, topLeft = Offset(size.width / 2 - 34.dp.toPx(), size.height / 2 - 34.dp.toPx()), size = androidx.compose.ui.geometry.Size(68.dp.toPx(), 68.dp.toPx()), style = Stroke(5.dp.toPx(), cap = StrokeCap.Round))
        }
        val flashAlpha by animateFloatAsState(if (System.currentTimeMillis() - ui.flash < 180) 0.8f else 0f, tween(260), label = "flash")
        Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = flashAlpha)))

        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconCircle(Icons.AutoMirrored.Filled.ArrowBack, "Close scanner", onClose, dark = true)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(Color.Black.copy(alpha = 0.5f)).padding(horizontal = 14.dp, vertical = 9.dp)) {
                    MonoText("${ui.accepted.size + ui.shots.count { it.status == ShotStatus.Uploading || it.status == ShotStatus.Queued }} OF 6 · ${target?.title?.uppercase() ?: "ALL ANGLES IN"}", color = Color.White.copy(alpha = 0.7f), size = 10)
                    Text(target?.hint ?: "Checking your photos…", style = Type.strong.copy(color = Color.White, fontSize = 15.sp))
                }
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Status(ui.hud.light == "ok", if (ui.hud.light == "dark") "Too dark" else if (ui.hud.light == "bright") "Too bright" else "Light")
                Status(ui.hud.sharp, "Focus"); Status(ui.hud.hasObject, "Object"); Status(ui.hud.steady, "Still")
                if (ui.sensor) Status(ui.hud.angle, ui.hud.toGo?.takeIf { !ui.hud.angle && it > 8 }?.let { "$it° to go" } ?: "Angle")
            }
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(14.dp)) {
            val rejected = ui.rejected
            if (rejected != null) Row(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(18.dp)).background(Pad.Down.copy(alpha = 0.92f)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Body("${rejected.view.title}: ${rejected.error ?: "Retake this angle."}", Modifier.weight(1f), color = Color.White, size = 13, weight = 700)
                Text("Retake", style = Type.strong.copy(color = Color.White, fontSize = 14.sp), modifier = Modifier.press { vm.dismissRejected() }.padding(8.dp))
            }
            cameraError?.let { Body(it, Modifier.padding(bottom = 8.dp), color = Color.White, size = 13) }
            if (!ui.sensor) Body("No motion sensor: tap the shutter at each angle.", Modifier.padding(bottom = 8.dp), color = Color.White.copy(alpha = 0.7f), size = 12)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                ScanView.entries.forEach { v ->
                    val shot = ui.shots.lastOrNull { it.view == v }
                    val done = v.id in ui.accepted || shot?.status == ShotStatus.Accepted
                    Box(Modifier.weight(1f).aspectRatio(0.8f).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.1f)).border(2.dp, if (v == target) Color.White else Color.Transparent, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        if (shot != null) Image(shot.preview, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        when {
                            done -> Box(Modifier.size(20.dp).clip(CircleShape).background(Pad.UpGlow), contentAlignment = Alignment.Center) { Icon(Icons.Default.Check, null, tint = Pad.Ink, modifier = Modifier.size(13.dp)) }
                            shot?.status == ShotStatus.Uploading || shot?.status == ShotStatus.Queued -> CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                            shot == null -> MonoText(v.short.uppercase(), color = Color.White.copy(alpha = 0.6f), size = 9)
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.Center) {
                Box(Modifier.size(78.dp).clip(CircleShape).border(4.dp, Color.White, CircleShape).padding(7.dp).clip(CircleShape).background(if (ready) Pad.UpGlow else Color.White).press(target != null) { vm.manualShot() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.CameraAlt, "Take photo", tint = Pad.Ink, modifier = Modifier.size(26.dp))
                }
            }
            if ((ui.session?.views?.size ?: 0) >= 6) PadButton("Check my 6 photos", { vm.setPhase(ScanPhase.Review) }, Modifier.fillMaxWidth().padding(top = 12.dp), style = BtnStyle.Glass, icon = Icons.AutoMirrored.Filled.ArrowForward)
        }
    }
}

@Composable
private fun Status(ok: Boolean, label: String) {
    Row(Modifier.clip(RoundedCornerShape(50)).background(if (ok) Pad.UpGlow.copy(alpha = 0.22f) else Color.Black.copy(alpha = 0.5f)).padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(if (ok) Pad.UpGlow else Color(0xFFFF5A4E)))
        Spacer(Modifier.width(5.dp))
        Text(label, style = Type.strong.copy(fontSize = 11.5.sp, color = if (ok) Color(0xFF7CF0AE) else Color.White.copy(alpha = 0.85f), fontWeight = FontWeight(800)))
    }
}

@Composable
private fun Review(ui: ScanUi, headers: suspend () -> List<Map<String, String>>, onRetake: (ScanView) -> Unit, onBuild: () -> Unit) {
    var index by remember { mutableIntStateOf(0) }
    var building by remember { mutableStateOf(false) }
    val view = ScanView.entries[index]
    val shot = ui.shots.lastOrNull { it.view == view }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { MonoText("CHECK YOUR PHOTOS", color = Color.White.copy(alpha = 0.55f), size = 11); Display("${index + 1} of 6 · ${view.title}", 26, Modifier.padding(top = 4.dp), color = Color.White) }
            Row(Modifier.clip(RoundedCornerShape(50)).background(Pad.UpGlow.copy(alpha = 0.2f)).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Check, null, tint = Color(0xFF7CF0AE), modifier = Modifier.size(14.dp)); Text(" ${ui.accepted.size}/6", style = Type.strong.copy(color = Color(0xFF7CF0AE), fontSize = 13.sp))
            }
        }
        Box(Modifier.padding(vertical = 16.dp).weight(1f).fillMaxWidth().clip(RoundedCornerShape(30.dp)).background(Color.White.copy(alpha = 0.05f)), contentAlignment = Alignment.Center) {
            AnimatedContent(shot, transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) }, label = "photo") { s ->
                if (s != null) Image(s.preview, "${view.title} photo", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                else Column(horizontalAlignment = Alignment.CenterHorizontally) { GlassIcon(Glass.Shield, 72.dp); Body("Accepted on the server. Photos from another device stay private and aren’t downloaded.", Modifier.padding(20.dp), color = Color.White.copy(alpha = 0.7f), align = TextAlign.Center, size = 13) }
            }
            Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(18.dp)).background(Color.Black.copy(alpha = 0.55f)).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(24.dp).clip(CircleShape).background(Pad.UpGlow), contentAlignment = Alignment.Center) { Icon(Icons.Default.Check, null, tint = Pad.Ink, modifier = Modifier.size(14.dp)) }
                Text("  Sharp · lit · accepted", style = Type.strong.copy(color = Color.White, fontSize = 14.sp), modifier = Modifier.weight(1f))
                Row(Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.15f)).press { onRetake(view) }.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Refresh, null, tint = Color.White, modifier = Modifier.size(14.dp)); Text(" Retake", style = Type.strong.copy(color = Color.White, fontSize = 13.sp))
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ScanView.entries.forEachIndexed { i, v ->
                val s = ui.shots.lastOrNull { it.view == v }
                Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.1f)).border(2.dp, if (i == index) Color.White else Color.Transparent, RoundedCornerShape(12.dp)).press { index = i }, contentAlignment = Alignment.Center) {
                    if (s != null) Image(s.preview, v.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else MonoText(v.short.uppercase(), color = Color.White.copy(alpha = 0.6f), size = 9)
                }
            }
        }
        Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconCircle(Icons.AutoMirrored.Filled.ArrowBack, "Previous photo", { if (index > 0) index-- }, size = 60.dp)
            Spacer(Modifier.width(10.dp))
            if (index == 5) PadButton(if (building) "Starting 3D build…" else "Build my 3D model", { building = true; onBuild() }, Modifier.weight(1f), style = BtnStyle.Glass, loading = building, icon = Icons.Default.ViewInAr, height = 60.dp)
            else PadButton("Next photo", { index++ }, Modifier.weight(1f), style = BtnStyle.Glass, icon = Icons.AutoMirrored.Filled.ArrowForward, height = 60.dp)
        }
    }
}
