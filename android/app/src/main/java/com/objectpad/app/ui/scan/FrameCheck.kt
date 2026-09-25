package com.objectpad.app.ui.scan

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.camera.core.ImageProxy
import com.objectpad.app.data.ScanView
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min

/** Live readout of one camera frame, measured on a downscaled luma grid. Every flag comes from real pixels. */
data class FrameCheck(val brightness: Double, val focus: Double, val objectScore: Double, val light: String, val sharp: Boolean, val hasObject: Boolean, val thumb: FloatArray)

object FrameAnalyzer {
    private const val W = 96; private const val H = 72
    private const val DARK = 48; private const val BRIGHT = 222; private const val FOCUS_MIN = 18.0

    /** Mirrors `web-handlesend/src/lib/frameCheck.ts` on the Y (luma) plane of a CameraX frame. */
    fun check(image: ImageProxy): FrameCheck {
        val plane = image.planes[0]; val buf = plane.buffer; val rs = plane.rowStride; val ps = plane.pixelStride
        val iw = image.width; val ih = image.height
        val g = FloatArray(W * H)
        for (y in 0 until H) { val sy = y * ih / H; for (x in 0 until W) { val sx = x * iw / W; g[y * W + x] = (buf.get(sy * rs + sx * ps).toInt() and 0xff).toFloat() } }
        val cx0 = (W * 0.22).toInt(); val cx1 = (W * 0.78).toInt(); val cy0 = (H * 0.2).toInt(); val cy1 = (H * 0.8).toInt()
        val bw = max(2, (W * 0.1).toInt()); val bh = max(2, (H * 0.1).toInt())
        var cSum = 0.0; var cCount = 0; var lapMean = 0.0; var lapSq = 0.0; var cEdge = 0.0; var bEdge = 0.0; var bCount = 0; var bSum = 0.0
        for (y in 1 until H - 1) for (x in 1 until W - 1) {
            val i = y * W + x
            val lap = (g[i - 1] + g[i + 1] + g[i - W] + g[i + W] - 4 * g[i]).toDouble(); val edge = abs(lap)
            if (x in cx0 until cx1 && y in cy0 until cy1) { cSum += g[i]; cCount++; lapMean += lap; lapSq += lap * lap; cEdge += edge }
            else if (x < bw || x >= W - bw || y < bh || y >= H - bh) { bEdge += edge; bCount++; bSum += g[i] }
        }
        val brightness = cSum / max(1, cCount)
        val focus = lapSq / max(1, cCount) - (lapMean / max(1, cCount)).let { it * it }
        val centre = cEdge / max(1, cCount); val border = bEdge / max(1, bCount)
        val gap = abs(brightness - bSum / max(1, bCount))
        val objectScore = centre / (border + 1.5) + gap / 40
        return FrameCheck(brightness, focus, objectScore, if (brightness < DARK) "dark" else if (brightness > BRIGHT) "bright" else "ok", focus > FOCUS_MIN, centre > 2.6 && objectScore > 1.2, thumbnail(g))
    }

    /** 16×12 grid of mean brightness, to tell "phone is still" and "you moved to a new side" apart from sensor noise. */
    private fun thumbnail(g: FloatArray): FloatArray {
        val out = FloatArray(192); val count = IntArray(192)
        for (y in 0 until H) for (x in 0 until W) { val c = min(11, y * 12 / H) * 16 + min(15, x * 16 / W); out[c] += g[y * W + x]; count[c]++ }
        for (i in 0 until 192) out[i] /= max(1, count[i]).toFloat()
        return out
    }

    fun diff(a: FloatArray?, b: FloatArray?): Double { if (a == null || b == null) return 99.0; var s = 0.0; for (i in 0 until 192) s += abs(a[i] - b[i]); return s / 192 }
}

data class Pose(val heading: Double, val pitch: Double, val at: Long)

/** Direction the rear camera looks (compass-like heading and pitch) from the rotation-vector sensor. */
class PoseTracker(context: Context) : SensorEventListener {
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor: Sensor? = manager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    val available: Boolean get() = sensor != null
    @Volatile var pose: Pose? = null; private set
    private val log = ArrayDeque<Pose>()
    private val m = FloatArray(9)

    fun start() { sensor?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) } }
    fun stop() { manager.unregisterListener(this) }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(m, event.values)
        val fx = -m[2].toDouble(); val fy = -m[5].toDouble(); val fz = -m[8].toDouble()
        val p = Pose((Math.toDegrees(atan2(fx, fy)) + 360) % 360, Math.toDegrees(asin(fz.coerceIn(-1.0, 1.0))), System.currentTimeMillis())
        pose = p
        synchronized(log) { log.addLast(p); while (log.isNotEmpty() && p.at - log.first().at > 450) log.removeFirst() }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    /** How far the pointing direction wandered in the last 450 ms. */
    fun wander(): Double = synchronized(log) {
        if (log.size < 2) return 0.0
        val a = log.first(); log.maxOf { max(abs(wrap(it.heading - a.heading)), abs(it.pitch - a.pitch)) }
    }

    companion object {
        fun wrap(d: Double): Double = ((d + 540) % 360) - 180
        private const val TOL = 26.0

        /** Does the pose match the wanted angle? `d` is heading relative to the front shot. */
        fun matches(view: ScanView, d: Double, pitch: Double, sign: Int): Boolean {
            val level = pitch > -22 && pitch < 34; val high = pitch <= -22 && pitch > -78
            fun near(a: Double, b: Double, tol: Double) = abs(wrap(a - b)) < tol
            return when (view) {
                ScanView.Front -> level && near(d, 0.0, TOL)
                ScanView.Back -> level && near(abs(d), 180.0, TOL)
                ScanView.Right -> level && near(abs(d), 90.0, TOL)
                ScanView.Left -> level && (if (sign != 0) near(d, -sign * 90.0, TOL) else near(abs(d), 90.0, TOL))
                ScanView.HighFront -> high && near(d, 0.0, TOL + 12)
                ScanView.HighBack -> high && near(abs(d), 180.0, TOL + 12)
            }
        }

        fun degreesToGo(view: ScanView, d: Double, sign: Int): Int {
            val targets = when (view) {
                ScanView.Front, ScanView.HighFront -> listOf(0.0)
                ScanView.Back, ScanView.HighBack -> listOf(180.0, -180.0)
                ScanView.Left -> if (sign != 0) listOf(-sign * 90.0) else listOf(90.0, -90.0)
                ScanView.Right -> listOf(90.0, -90.0)
            }
            return targets.minOf { abs(wrap(it - d)) }.toInt()
        }
    }
}
