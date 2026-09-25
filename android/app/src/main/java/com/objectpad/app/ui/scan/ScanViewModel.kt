package com.objectpad.app.ui.scan

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.ApiException
import com.objectpad.app.data.CaptureSession
import com.objectpad.app.data.ScanView
import com.objectpad.app.data.Scans
import com.objectpad.app.data.SessionCaller
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.sign

enum class ShotStatus { Queued, Uploading, Accepted, Rejected }
data class Shot(val view: ScanView, val jpeg: ByteArray, val preview: ImageBitmap, val status: ShotStatus, val error: String? = null, val tries: Int = 0, val acceptedAt: Long = 0)

data class Hud(val light: String = "ok", val sharp: Boolean = false, val hasObject: Boolean = false, val steady: Boolean = false, val angle: Boolean = false, val moved: Boolean = true, val hold: Float = 0f, val toGo: Int? = null, val pitch: Double? = null)

enum class ScanPhase { Pairing, Intro, Camera, Review, Done }

data class ScanUi(
    val id: String? = null, val session: CaptureSession? = null, val phase: ScanPhase = ScanPhase.Pairing, val error: String? = null,
    val shots: List<Shot> = emptyList(), val hud: Hud = Hud(), val flash: Long = 0, val lastAccepted: ScanView? = null, val sensor: Boolean = true,
) {
    val accepted: Set<String> get() = (session?.views?.map { it.view } ?: emptyList()).toSet()
    val covered: Set<String> get() = accepted + shots.filter { it.status != ShotStatus.Rejected }.map { it.view.id }
    val target: ScanView? get() = ScanView.entries.firstOrNull { it.id !in covered }
    val rejected: Shot? get() = shots.lastOrNull { it.status == ShotStatus.Rejected }
}

/**
 * The phone scanner: pairs this phone to a scan, runs live light / focus / object / steadiness / angle checks, shoots
 * six guided angles by itself and uploads each through a single-use ticket. Behaviour mirrors the website's scanner.
 */
class ScanViewModel : ViewModel() {
    private val app = ObjectPadApp.instance
    private val account = app.account
    private val _ui = MutableStateFlow(ScanUi())
    val ui: StateFlow<ScanUi> = _ui.asStateFlow()
    private var caller: SessionCaller? = null
    private var uploading = false
    private var pollJob: Job? = null

    // Auto-shutter state
    private var holdSince = 0L
    private var busy = false
    private var lastThumb: FloatArray? = null
    private var shotThumb: FloatArray? = null
    private var steadySince = 0L
    private var origin: Double? = null
    private var orbitSign = 0
    var pose: PoseTracker? = null
    var shoot: (suspend () -> ByteArray)? = null

    /** Opens an existing scan (paired or owned), claims a QR handoff, or starts a brand-new scan. */
    fun open(existing: String?, handoffToken: String?) {
        if (_ui.value.id != null) return
        viewModelScope.launch {
            try {
                val session = when {
                    existing != null && handoffToken != null -> Scans.claim(account, existing, handoffToken).also { app.sounds.play("handoff") }
                    existing != null -> SessionCaller(existing, account).session()
                    else -> Scans.start(account)
                }
                adopt(session)
            } catch (e: ApiException) {
                _ui.update { it.copy(error = if (e.code == "HANDOFF_EXPIRED_OR_USED") "This QR code was already used or expired. Tap “New code” on your computer and scan again." else e.message) }
            } catch (e: Exception) { _ui.update { it.copy(error = e.message ?: "The scan could not be opened.") } }
        }
    }

    private fun adopt(s: CaptureSession) {
        s.successor?.let { next -> Scans.follow(account, s.id, next); caller = SessionCaller(next, account); _ui.update { it.copy(id = next) }; refresh(); return }
        caller = SessionCaller(s.id, account)
        app.prefs.lastScan = s.id
        val phase = when {
            s.state !in setOf("awaiting_mobile", "capturing", "review") -> ScanPhase.Done
            s.views.size >= 6 -> ScanPhase.Review
            else -> ScanPhase.Intro
        }
        _ui.update { it.copy(id = s.id, session = s, phase = if (it.phase == ScanPhase.Pairing) phase else it.phase, error = null) }
        startPolling()
    }

    private fun refresh() = viewModelScope.launch { runCatching { caller?.session() }.getOrNull()?.let { adopt(it) } }

    /** Stays in sync with the computer: rescans, cancellations, another phone taking over, photos removed there. */
    private fun startPolling() {
        if (pollJob != null) return
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(3000)
                val c = caller ?: continue
                try {
                    val s = c.session()
                    if (s.successor != null) { Scans.follow(account, s.id, s.successor); caller = SessionCaller(s.successor, account); _ui.update { it.copy(id = s.successor, shots = emptyList()) }; continue }
                    if (s.state == "cancelled" || s.state == "expired") { _ui.update { it.copy(error = if (s.state == "cancelled") "This scan was cancelled. Start a new one." else "This scan expired. Start a new one.") }; break }
                    if (s.state !in setOf("awaiting_mobile", "capturing", "review")) { _ui.update { it.copy(session = s, phase = ScanPhase.Done) }; break }
                    val removed = s.removed.filter { r -> _ui.value.shots.any { it.view.id == r.view && it.status == ShotStatus.Accepted && it.acceptedAt < r.at } }
                    _ui.update { u ->
                        u.copy(session = s, shots = u.shots.filterNot { sh -> removed.any { r -> r.view == sh.view.id && sh.status == ShotStatus.Accepted && sh.acceptedAt < r.at } },
                            phase = if (removed.isNotEmpty() && u.phase == ScanPhase.Review) ScanPhase.Camera else u.phase)
                    }
                } catch (e: ApiException) {
                    if (e.code == "CAPTURE_DEVICE_NOT_AUTHORIZED") { _ui.update { it.copy(error = "Another phone took over this scan. Scan the QR code on your computer to switch back.") }; break }
                } catch (_: Exception) { }
            }
            pollJob = null
        }
    }

    fun setPhase(p: ScanPhase) = _ui.update { it.copy(phase = p) }
    fun setSensor(on: Boolean) = _ui.update { it.copy(sensor = on) }

    /** Called for every analysed camera frame (background thread). Decides when the auto-shutter fires. */
    fun onFrame(check: FrameCheck) {
        val u = _ui.value; if (u.phase != ScanPhase.Camera) return
        val target = u.target ?: return
        val now = System.currentTimeMillis()
        val diff = FrameAnalyzer.diff(lastThumb, check.thumb); lastThumb = check.thumb
        val p = pose?.pose
        val sensorOn = pose?.available == true && p != null
        val stillBySensor = sensorOn && (pose?.wander() ?: 99.0) < 4.5
        if (diff < 9 || stillBySensor) { if (steadySince == 0L) steadySince = now } else steadySince = 0L
        val steady = steadySince != 0L && now - steadySince > 350
        val moved = shotThumb == null || FrameAnalyzer.diff(shotThumb, check.thumb) > 18
        var angle = true; var toGo: Int? = null
        if (sensorOn && p != null && origin != null) {
            val d = PoseTracker.wrap(p.heading - origin!!)
            angle = PoseTracker.matches(target, d, p.pitch, orbitSign)
            toGo = PoseTracker.degreesToGo(target, d, orbitSign)
        } else if (sensorOn && p != null && target == ScanView.Front) angle = p.pitch > -22 && p.pitch < 34
        else if (!sensorOn) angle = moved
        val ready = check.light == "ok" && check.sharp && check.hasObject && steady && angle && (moved || target == ScanView.Front && shotThumb == null)
        if (ready) { if (holdSince == 0L) holdSince = now } else holdSince = 0L
        val hold = if (holdSince == 0L) 0f else ((now - holdSince) / 700f).coerceAtMost(1f)
        _ui.update { it.copy(hud = Hud(check.light, check.sharp, check.hasObject, steady, angle, moved, hold, toGo, p?.pitch), sensor = sensorOn || it.sensor && p == null) }
        if (hold >= 1f && !busy) { holdSince = 0L; capture(target, check.thumb) }
    }

    /** Manual shutter, always available (and the only trigger when the phone has no motion sensor). */
    fun manualShot() { val t = _ui.value.target ?: return; if (!busy) capture(t, lastThumb) }

    private fun capture(view: ScanView, thumb: FloatArray?) {
        val take = shoot ?: return
        busy = true
        viewModelScope.launch {
            try {
                val jpeg = take()
                val preview = withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inSampleSize = 4 }).asImageBitmap() }
                shotThumb = thumb
                pose?.pose?.let { p ->
                    if (view == ScanView.Front) origin = p.heading
                    if (view == ScanView.Right && origin != null) orbitSign = sign(PoseTracker.wrap(p.heading - origin!!)).toInt()
                }
                app.sounds.play("capture")
                _ui.update { u -> u.copy(shots = u.shots.filterNot { it.view == view } + Shot(view, jpeg, preview, ShotStatus.Queued), flash = System.currentTimeMillis()) }
                pump()
            } catch (e: Exception) { _ui.update { it.copy(error = null) } }
            finally { delay(600); busy = false }
        }
    }

    private fun setShot(view: ScanView, f: (Shot) -> Shot) = _ui.update { u -> u.copy(shots = u.shots.map { if (it.view == view) f(it) else it }) }

    private fun pump() {
        if (uploading) return
        uploading = true
        viewModelScope.launch {
            try {
                while (true) {
                    val next = _ui.value.shots.firstOrNull { it.status == ShotStatus.Queued } ?: break
                    val c = caller ?: break
                    setShot(next.view) { it.copy(status = ShotStatus.Uploading) }
                    try {
                        val ticket = c.ticket(next.view.id)
                        val updated = c.upload(ticket, next.jpeg)
                        setShot(next.view) { it.copy(status = ShotStatus.Accepted, acceptedAt = System.currentTimeMillis()) }
                        _ui.update { it.copy(session = updated, lastAccepted = next.view) }
                        app.sounds.play("orbit")
                    } catch (e: ApiException) {
                        if (e.code == "RETAKE_REQUIRED") {
                            val fresh = runCatching { c.session() }.getOrNull()
                            if (fresh?.views?.any { it.view == next.view.id } == true) { _ui.update { it.copy(session = fresh) }; setShot(next.view) { it.copy(status = ShotStatus.Accepted) }; continue }
                        }
                        val frame = e.code in setOf("IMAGE_QUALITY", "IMAGE_RESOLUTION", "IMAGE_NOT_VALIDATED", "DUPLICATE_VIEW", "DUPLICATE_ARCHIVE_FRAME", "NO_OBJECT", "OBJECT_OR_BACKGROUND_QUALITY", "UNSUPPORTED_IMAGE", "RETAKE_REQUIRED", "PEOPLE_IN_FRAME", "DOCUMENT_IN_FRAME", "SCREEN_IN_FRAME")
                        if (!frame && next.tries < 4) { setShot(next.view) { it.copy(status = ShotStatus.Queued, tries = it.tries + 1) }; delay(1500L * (next.tries + 1)); continue }
                        setShot(next.view) { it.copy(status = ShotStatus.Rejected, error = e.message) }
                        app.sounds.play("rejected")
                    } catch (e: Exception) {
                        if (next.tries < 4) { setShot(next.view) { it.copy(status = ShotStatus.Queued, tries = it.tries + 1) }; delay(2000); continue }
                        setShot(next.view) { it.copy(status = ShotStatus.Rejected, error = "The upload failed. Retake this angle.") }
                    }
                }
            } finally { uploading = false }
            val u = _ui.value
            if ((u.session?.views?.size ?: 0) >= 6 && u.phase == ScanPhase.Camera) _ui.update { it.copy(phase = ScanPhase.Review) }
        }
    }

    fun retake(view: ScanView) {
        _ui.update { u -> u.copy(shots = u.shots.filterNot { it.view == view }, phase = ScanPhase.Camera) }
        if (view.id in _ui.value.accepted) viewModelScope.launch { runCatching { caller?.removeView(view.id) }.getOrNull()?.let { s -> _ui.update { it.copy(session = s) } } }
        if (view == ScanView.Front) { origin = null; orbitSign = 0 }
        shotThumb = null
    }

    fun dismissRejected() { _ui.value.rejected?.let { r -> _ui.update { u -> u.copy(shots = u.shots.filterNot { it.view == r.view }) } } }

    fun headers(): suspend () -> List<Map<String, String>> = { caller?.headersForDownload() ?: emptyList() }
}
