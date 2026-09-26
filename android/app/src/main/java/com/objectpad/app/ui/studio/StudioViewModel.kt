package com.objectpad.app.ui.studio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.data.ApiException
import com.objectpad.app.data.CaptureSession
import com.objectpad.app.data.Chain
import com.objectpad.app.data.LaunchDraft
import com.objectpad.app.data.Scans
import com.objectpad.app.data.SessionCaller
import com.objectpad.app.data.isBuilding
import com.objectpad.app.data.isModelReady
import com.objectpad.app.data.isTerminal
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class CoinForm(val publicName: String = "", val symbol: String = "", val story: String = "", val xUrl: String = "", val telegram: String = "", val feeWallet: String = "", val pairToken: String = "") {
    fun errors(): Map<String, String> = buildMap {
        val n = publicName.trim(); if (n.length < 2) put("name", "At least 2 characters.") else if (n.length > 32) put("name", "Up to 32 characters.")
        if (!Regex("^[A-Z0-9]{2,10}$").matches(symbol.trim().uppercase())) put("symbol", "2–10 letters or digits.")
        val s = story.trim(); if (s.length < 10) put("story", "At least 10 characters.") else if (s.length > 280) put("story", "Up to 280 characters.")
        if (xUrl.isNotBlank() && !Regex("^https://(www\\.)?(x|twitter)\\.com/[A-Za-z0-9_]{1,15}/?$").matches(xUrl.trim())) put("x", "Use https://x.com/handle or leave empty.")
        if (telegram.isNotBlank() && !Regex("^https://(t|telegram)\\.me/[A-Za-z0-9_]{4,32}/?$").matches(telegram.trim())) put("telegram", "Use https://t.me/group or leave empty.")
        if (feeWallet.isNotBlank() && !Chain.isAddress(feeWallet)) put("fee", "Paste a full 0x… wallet address or leave empty.")
    }
}

data class StudioUi(
    val session: CaptureSession? = null, val error: String? = null, val loading: Boolean = true, val form: CoinForm = CoinForm(), val dirty: Boolean = false,
    val busy: String? = null, val actionError: String? = null, val iconBusy: Boolean = false, val showErrors: Boolean = false,
)

/** The live studio for one scan: AI check, real 3D progress, model review, coin details and the sponsored launch. */
class StudioViewModel : ViewModel() {
    private val app = ObjectPadApp.instance
    private val account = app.account
    private val _ui = MutableStateFlow(StudioUi())
    val ui: StateFlow<StudioUi> = _ui.asStateFlow()
    lateinit var caller: SessionCaller; private set
    private var job: Job? = null
    private var autoScreened = false
    private var autoRebuilds = 0
    private var announced = ""
    private var snapKey = ""

    fun open(id: String) {
        if (::caller.isInitialized && caller.id == id) return
        caller = SessionCaller(id, account); job?.cancel(); autoScreened = false; autoRebuilds = 0
        _ui.value = StudioUi()
        job = viewModelScope.launch {
            while (isActive) {
                try { apply(caller.session()) } catch (e: ApiException) {
                    if (_ui.value.session == null) _ui.update { it.copy(loading = false, error = if (e.status == 404) "This scan belongs to another device or account. Open it where you started, or sign in with the account that owns it." else e.message) }
                } catch (e: Exception) { if (_ui.value.session == null) _ui.update { it.copy(loading = false, error = e.message) } }
                val s = _ui.value.session
                val wait = when {
                    s == null -> 4000L
                    s.launch?.recordState == "confirmed" || s.isTerminal -> break
                    s.state in setOf("screening", "reconstructing", "validating") -> 2000L
                    s.launch != null -> 2500L
                    else -> 3500L
                }
                delay(wait)
            }
        }
    }

    private fun apply(s: CaptureSession) {
        s.successor?.let { next -> Scans.follow(account, s.id, next); open(next); return }
        val prev = _ui.value
        val form = if (!prev.dirty) CoinForm(
            publicName = s.launchDraft?.publicName ?: s.suggestion?.name ?: "", symbol = s.launchDraft?.symbol ?: s.suggestion?.ticker ?: "",
            story = s.launchDraft?.story ?: s.suggestion?.story ?: "", xUrl = s.launchDraft?.xUrl ?: "", telegram = s.launchDraft?.telegram ?: "",
            feeWallet = s.launchDraft?.feeWallet ?: account.state.value.activeWallet ?: "",
            pairToken = s.launchDraft?.pairToken ?: "",
        ) else prev.form
        _ui.update { it.copy(session = s, loading = false, error = null, form = form) }
        if (announced != s.state) { if (s.state == "model_review") app.sounds.play("model"); if (s.state in setOf("blocked", "failed")) app.sounds.play("rejected"); announced = s.state }
        if (s.launch?.recordState == "confirmed" && announced != "confirmed") { announced = "confirmed"; app.sounds.play("launch"); app.prefs.lastScan = null }
        // Start the AI check and 3D rebuild as soon as all six angles are in; an AI hiccup retries itself once.
        if (s.state == "review" && s.views.size >= 6 && prev.busy == null) {
            if (s.failureCode == null) reconstruct() else if (s.failureCode == "MEDIA_VALIDATION_UNAVAILABLE" && !autoScreened) { autoScreened = true; reconstruct() }
        }
        val soft = s.failureCode in setOf("PROVIDER_PAYLOAD_TOO_LARGE", "PROVIDER_UNAVAILABLE", "PROVIDER_REQUEST_TIMEOUT", "PROVIDER_RATE_LIMIT", "PROVIDER_FAILED", "PROVIDER_TIMEOUT")
        if (s.state == "failed" && prev.busy == null && autoRebuilds < 3 && (soft || (s.failureRetries ?: 0) == 0)) { autoRebuilds++; viewModelScope.launch { delay(1500); regenerate() } }
        // A guest who signed in keeps this scan: it moves into their inventory.
        if (account.state.value.signedIn && s.guest == true && s.launch == null) viewModelScope.launch { if (account.adopt(s.id) > 0) runCatching { apply(caller.session()) } }
    }

    fun edit(f: (CoinForm) -> CoinForm) = _ui.update { it.copy(form = f(it.form), dirty = true) }

    private fun run(label: String, block: suspend () -> Unit) {
        if (_ui.value.busy != null) return
        _ui.update { it.copy(busy = label, actionError = null) }
        viewModelScope.launch {
            try { block() } catch (e: Exception) { _ui.update { it.copy(actionError = e.message ?: "That didn’t work. Retry safely.") } }
            finally { _ui.update { it.copy(busy = null) } }
        }
    }

    fun reconstruct() = run("reconstruct") { apply(caller.reconstruct()) }
    fun regenerate() = run("regenerate") { apply(caller.regenerate()) }
    fun rescan(onNew: (String) -> Unit) = run("rescan") { val s = caller.rescan(); app.prefs.lastScan = s.id; onNew(s.id) }
    fun startOver(onNew: (String) -> Unit) = run("reset") { caller.cancel(); app.sounds.play("retry"); val s = Scans.start(account); onNew(s.id) }

    private fun draft(launching: Boolean): LaunchDraft {
        val f = _ui.value.form
        // Guests with no wallet get this phone's ObjectPad wallet at launch, so creator rewards always have a home.
        val fee = f.feeWallet.trim().ifBlank { account.state.value.activeWallet ?: if (launching) account.ensureLocalWallet().address else "" }
        return LaunchDraft(f.publicName.trim(), f.symbol.trim().uppercase(), f.story.trim(), f.xUrl.trim(), f.telegram.trim().ifBlank { null }, fee.ifBlank { null }, f.pairToken.ifBlank { null })
    }

    fun save() {
        if (_ui.value.form.errors().isNotEmpty()) { _ui.update { it.copy(showErrors = true) }; return }
        run("save") { val s = caller.draft(draft(false)); _ui.update { it.copy(dirty = false) }; apply(s) }
    }

    fun launch() {
        if (_ui.value.form.errors().isNotEmpty()) { _ui.update { it.copy(showErrors = true) }; return }
        run("launch") {
            val r = caller.launch(draft(true))
            if (r.state != "queued" || r.hash != null) app.sounds.play("seal")
            _ui.update { it.copy(dirty = false) }; apply(r.session)
        }
    }

    fun retryLaunch() = run("launch") { val r = caller.launch(null); if (r.hash != null) app.sounds.play("seal"); apply(r.session) }

    /** Front snapshot of the finished model, uploaded as the coin icon (once per model). */
    fun uploadSnapshot(png: ByteArray) {
        val s = _ui.value.session ?: return; val model = s.model ?: return
        val key = model.optimizedHash + (s.icon?.hash ?: "")
        if (snapKey == key || !needsSnapshot(s)) return
        snapKey = key
        viewModelScope.launch { runCatching { caller.setIcon(png, "snapshot", model.optimizedHash) }.onSuccess { apply(it) } }
    }

    fun customIcon(jpeg: ByteArray) {
        _ui.update { it.copy(iconBusy = true) }
        viewModelScope.launch { runCatching { caller.setIcon(jpeg, "custom", null) }.onSuccess { apply(it) }.onFailure { e -> _ui.update { it.copy(actionError = e.message) } }; _ui.update { it.copy(iconBusy = false) } }
    }

    fun resetIcon() {
        _ui.update { it.copy(iconBusy = true) }
        viewModelScope.launch { snapKey = ""; runCatching { caller.clearIcon() }.onSuccess { apply(it) }; _ui.update { it.copy(iconBusy = false) } }
    }

    fun needsSnapshot(s: CaptureSession): Boolean {
        val model = s.model ?: return false
        if (!s.isModelReady || s.launch?.hash != null) return false
        val icon = s.icon
        return icon == null || (icon.source == "snapshot" && icon.modelHash != model.optimizedHash)
    }

    val canSubmit: Boolean get() = _ui.value.session?.let { it.isModelReady || it.isBuilding } == true
}
