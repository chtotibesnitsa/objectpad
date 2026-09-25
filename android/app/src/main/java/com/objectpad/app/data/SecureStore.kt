package com.objectpad.app.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small encrypted key-value store. Values are sealed with an AES-256-GCM key that lives in the Android Keystore
 * and never leaves the device's secure hardware, so wallet keys and identity tokens are unreadable at rest.
 */
class SecureStore(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("objectpad.secure", Context.MODE_PRIVATE)
    private val alias = "objectpad.master.v1"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return gen.generateKey()
    }

    fun put(name: String, value: String?) {
        if (value == null) { prefs.edit().remove(name).apply(); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.iv + cipher.doFinal(value.toByteArray())
        prefs.edit().putString(name, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply()
    }

    fun get(name: String): String? {
        val raw = prefs.getString(name, null) ?: return null
        return runCatching {
            val bytes = Base64.decode(raw, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))) }
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)))
        }.getOrNull()
    }

    fun keys(prefix: String): List<String> = prefs.all.keys.filter { it.startsWith(prefix) }
}

/** Plain (non-secret) preferences: sound, haptics, watchlist, recent scans. */
class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("objectpad.prefs", Context.MODE_PRIVATE)
    var sound: Boolean get() = prefs.getBoolean("sound", true); set(v) { prefs.edit().putBoolean("sound", v).apply() }
    var haptics: Boolean get() = prefs.getBoolean("haptics", true); set(v) { prefs.edit().putBoolean("haptics", v).apply() }
    var watchlist: Set<String> get() = prefs.getStringSet("watchlist", emptySet()) ?: emptySet(); set(v) { prefs.edit().putStringSet("watchlist", v).apply() }
    var lastScan: String? get() = prefs.getString("lastScan", null); set(v) { prefs.edit().putString("lastScan", v).apply() }
    var onboarded: Boolean get() = prefs.getBoolean("onboarded", false); set(v) { prefs.edit().putBoolean("onboarded", v).apply() }
}
