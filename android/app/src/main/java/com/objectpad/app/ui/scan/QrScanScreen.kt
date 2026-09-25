package com.objectpad.app.ui.scan

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.objectpad.app.data.Scans
import com.objectpad.app.ui.components.Body
import com.objectpad.app.ui.components.BtnStyle
import com.objectpad.app.ui.components.Display
import com.objectpad.app.ui.components.IconCircle
import com.objectpad.app.ui.components.PadButton
import com.objectpad.app.ui.theme.Pad

private val reader = MultiFormatReader().apply { setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE), DecodeHintType.TRY_HARDER to true)) }

private fun decode(image: ImageProxy): String? {
    val plane = image.planes[0]; val buf = plane.buffer; val rs = plane.rowStride
    val w = image.width; val h = image.height
    val data = ByteArray(w * h)
    for (y in 0 until h) { buf.position(y * rs); buf.get(data, y * w, w) }
    return runCatching { reader.decodeWithState(BinaryBitmap(HybridBinarizer(PlanarYUVLuminanceSource(data, w, h, 0, 0, w, h, false)))).text }.getOrNull().also { reader.reset() }
}

/** Scans the private QR shown on objectpad.fun on a computer and moves that exact scan to this phone. */
@Composable
fun QrScanScreen(onBack: () -> Unit, onPaired: (String, String?) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    var wrong by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }
    val rig = remember { CameraRig(context) }
    DisposableEffect(Unit) { onDispose { rig.release() } }

    Box(Modifier.fillMaxSize().background(Pad.Obsidian)) {
        if (granted) AndroidView(factory = { ctx -> PreviewView(ctx).apply {
            rig.bind(owner, this, { img ->
                if (done) return@bind
                val text = decode(img) ?: return@bind
                val parsed = Scans.parseHandoff(text)
                if (parsed == null) { post { wrong = true } } else { done = true; post { onPaired(parsed.first, parsed.second) } }
            }, {}, withCapture = false)
        } }, modifier = Modifier.fillMaxSize())
        Canvas(Modifier.fillMaxSize().padding(horizontal = 48.dp, vertical = 220.dp)) {
            val l = 44.dp.toPx(); val w = 5.dp.toPx(); val c = if (wrong) Pad.Down else Color.White
            listOf(Offset(0f, 0f) to Offset(1f, 1f), Offset(size.width, 0f) to Offset(-1f, 1f), Offset(0f, size.height) to Offset(1f, -1f), Offset(size.width, size.height) to Offset(-1f, -1f)).forEach { (o, d) ->
                drawLine(c, o, Offset(o.x + d.x * l, o.y), w, StrokeCap.Round); drawLine(c, o, Offset(o.x, o.y + d.y * l), w, StrokeCap.Round)
            }
        }
        Row(Modifier.statusBarsPadding().padding(16.dp)) { IconCircle(Icons.AutoMirrored.Filled.ArrowBack, "Back", onBack, dark = true) }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(20.dp).clip(RoundedCornerShape(28.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(20.dp)) {
            Display("Scan the code on your computer", 26, color = Color.White)
            Body(if (wrong) "That isn’t an ObjectPad scan code. Open objectpad.fun on your computer and scan the QR there." else "Open objectpad.fun on a computer and point your camera at the private QR code. Your phone takes over that scan.", Modifier.padding(top = 8.dp), color = Color.White.copy(alpha = 0.75f), size = 14)
            if (!granted) { Spacer(Modifier.size(12.dp)); PadButton("Allow camera", { launcher.launch(Manifest.permission.CAMERA) }, Modifier.fillMaxWidth(), style = BtnStyle.Glass) }
            Spacer(Modifier.width(0.dp))
        }
    }
}
