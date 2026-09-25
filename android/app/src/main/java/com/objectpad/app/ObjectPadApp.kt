package com.objectpad.app

import android.app.Application
import android.media.AudioAttributes
import android.media.SoundPool
import com.objectpad.app.data.AccountManager
import com.objectpad.app.data.Prefs
import com.objectpad.app.data.SecureStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers

/** Process-wide singletons: identity, secure storage, preferences and interface sounds. */
class ObjectPadApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    lateinit var secure: SecureStore; private set
    lateinit var prefs: Prefs; private set
    lateinit var account: AccountManager; private set
    lateinit var sounds: Sounds; private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        secure = SecureStore(this)
        prefs = Prefs(this)
        sounds = Sounds(this, prefs)
        account = AccountManager(this, secure, scope)
    }

    companion object { lateinit var instance: ObjectPadApp; private set }
}

/** The website's interface sounds (capture, seal, launch…), played through a low-latency SoundPool. */
class Sounds(app: Application, private val prefs: Prefs) {
    private val pool = SoundPool.Builder().setMaxStreams(4).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build()
    private val ids: Map<String, Int> = mapOf(
        "capture" to R.raw.sfx_capture, "handoff" to R.raw.sfx_handoff, "launch" to R.raw.sfx_launch, "model" to R.raw.sfx_model,
        "orbit" to R.raw.sfx_orbit, "rejected" to R.raw.sfx_rejected, "retry" to R.raw.sfx_retry, "seal" to R.raw.sfx_seal,
    ).mapValues { pool.load(app, it.value, 1) }

    fun play(name: String, volume: Float = 0.6f) { if (!prefs.sound) return; ids[name]?.let { pool.play(it, volume, volume, 1, 0, 1f) } }
}
