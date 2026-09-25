package com.objectpad.app.ui.scan

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** The server's capture limits (`web-handlesend/src/shared/capture.ts`). */
const val CAPTURE_LONG_SIDE = 1600
const val MIN_IMAGE_SIDE = 720

/**
 * Real CameraX pipeline: preview, a luma analyzer for the live checks and full-resolution still capture.
 * Also used by the QR scanner with a custom analyzer.
 */
class CameraRig(private val context: Context) {
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private var provider: ProcessCameraProvider? = null
    private var capture: ImageCapture? = null

    fun bind(owner: LifecycleOwner, view: PreviewView, analyzer: (ImageProxy) -> Unit, onError: (String) -> Unit, withCapture: Boolean = true) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                val p = future.get(); provider = p
                val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analysis.setAnalyzer(analysisExecutor) { image -> try { analyzer(image) } finally { image.close() } }
                val selector = when {
                    p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
                    p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
                    else -> { onError("No camera was found on this device."); return@addListener }
                }
                p.unbindAll()
                if (withCapture) {
                    val cap = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build(); capture = cap
                    p.bindToLifecycle(owner, selector, preview, analysis, cap)
                } else p.bindToLifecycle(owner, selector, preview, analysis)
            } catch (e: Exception) {
                onError("The camera could not be opened. Close other camera apps and retry.")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    /** Takes a still and returns a JPEG scaled to 1600 px on the long side. Re-encoding strips EXIF and GPS. */
    suspend fun takeJpeg(): ByteArray = suspendCoroutine { cont ->
        val cap = capture ?: return@suspendCoroutine cont.resumeWithException(IllegalStateException("The camera isn’t ready yet."))
        cap.takePicture(analysisExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    val rotation = image.imageInfo.rotationDegrees
                    val raw = image.toBitmap(); image.close()
                    cont.resume(encode(raw, rotation))
                } catch (e: Exception) { image.close(); cont.resumeWithException(e) }
            }
            override fun onError(exception: ImageCaptureException) { cont.resumeWithException(IllegalStateException("The photo could not be taken. Retry.")) }
        })
    }

    fun release() { runCatching { provider?.unbindAll() }; analysisExecutor.shutdown() }

    companion object {
        fun encode(raw: Bitmap, rotation: Int): ByteArray {
            val scale = min(1f, CAPTURE_LONG_SIDE.toFloat() / max(raw.width, raw.height))
            val m = Matrix().apply { postScale(scale, scale); postRotate(rotation.toFloat()) }
            var out = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
            if (min(out.width, out.height) < MIN_IMAGE_SIDE) {
                val up = MIN_IMAGE_SIDE.toFloat() / min(out.width, out.height)
                out = Bitmap.createScaledBitmap(out, (out.width * up).roundToInt(), (out.height * up).roundToInt(), true)
            }
            return ByteArrayOutputStream().use { s -> out.compress(Bitmap.CompressFormat.JPEG, 90, s); s.toByteArray() }
        }

        /** Center-crops any picked image to a 640 px square JPEG for a custom coin icon. */
        fun squareIcon(src: Bitmap): ByteArray {
            val side = min(src.width, src.height)
            require(side >= 128) { "Use an image at least 128 × 128 pixels." }
            val crop = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
            val scaled = Bitmap.createScaledBitmap(crop, 640, 640, true)
            return ByteArrayOutputStream().use { s -> scaled.compress(Bitmap.CompressFormat.JPEG, 90, s); s.toByteArray() }
        }
    }
}
