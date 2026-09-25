package com.objectpad.app.data

import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

/**
 * API caller for one capture session. Tries this phone's device secret, the current identity and the older guest
 * token in order (the website's `useSessionCaller`). Whichever holds the session answers; nothing is shared.
 */
class SessionCaller(val id: String, private val account: AccountManager) {
    suspend fun raw(path: String, method: HttpMethod = HttpMethod.Get, body: JsonElement? = null, bytes: ByteArray? = null, type: ContentType = ContentType.Image.JPEG, headers: Map<String, String> = emptyMap(), timeoutMs: Long = 25_000): String {
        var last: Exception = ApiException("NOT_FOUND", 404, describeError("NOT_FOUND"))
        for (attempt in account.sessionHeaders(id)) {
            try { return ObjectPadApi.raw(path, method, null, body, bytes, type, attempt + headers, timeoutMs) }
            catch (e: ApiException) { last = e; if (e.status !in setOf(401, 403, 404)) throw e }
        }
        throw last
    }
    suspend fun session(): CaptureSession = ObjectPadApi.decode(raw("/sessions/$id"))
    suspend fun post(action: String, body: JsonElement? = null, timeoutMs: Long = 25_000): String = raw("/sessions/$id/$action", HttpMethod.Post, body ?: buildJsonObject { }, timeoutMs = timeoutMs)
    suspend fun reconstruct(): CaptureSession = ObjectPadApi.decode(post("reconstruct", timeoutMs = 150_000))
    suspend fun regenerate(): CaptureSession = ObjectPadApi.decode(post("regenerate", timeoutMs = 90_000))
    suspend fun rescan(): CaptureSession = ObjectPadApi.decode<SessionWrap>(post("rescan")).session
    suspend fun cancel() { runCatching { post("cancel") }.onFailure { if (it is ApiException && it.status in setOf(404, 409)) Unit else throw it } }
    suspend fun draft(d: LaunchDraft): CaptureSession = ObjectPadApi.decode(raw("/sessions/$id/draft", HttpMethod.Post, ObjectPadApi.json.encodeToJsonElement(LaunchDraft.serializer(), d)))
    suspend fun launch(d: LaunchDraft?): LaunchResult = ObjectPadApi.decode(raw("/sessions/$id/launch", HttpMethod.Post, d?.let { ObjectPadApi.json.encodeToJsonElement(LaunchDraft.serializer(), it) } ?: buildJsonObject { }, timeoutMs = 90_000))
    suspend fun ticket(view: String): UploadTicket = ObjectPadApi.decode(raw("/sessions/$id/tickets", HttpMethod.Post, buildJsonObject { put("view", view) }))
    suspend fun upload(ticket: UploadTicket, jpeg: ByteArray): CaptureSession = ObjectPadApi.decode(raw(ticket.url, HttpMethod.Put, bytes = jpeg, headers = mapOf("X-Upload-Token" to ticket.token), timeoutMs = 60_000))
    suspend fun removeView(view: String): CaptureSession = ObjectPadApi.decode(raw("/sessions/$id/views/$view", HttpMethod.Delete))
    suspend fun setIcon(bytes: ByteArray, source: String, modelHash: String?): CaptureSession = ObjectPadApi.decode(raw(
        "/sessions/$id/icon", HttpMethod.Put, bytes = bytes, type = if (source == "snapshot") ContentType.Image.PNG else ContentType.Image.JPEG,
        headers = buildMap { put("X-Icon-Source", source); if (modelHash != null) put("X-Icon-Model", modelHash) }, timeoutMs = 40_000,
    ))
    suspend fun clearIcon(): CaptureSession = ObjectPadApi.decode(raw("/sessions/$id/icon", HttpMethod.Delete))
    suspend fun headersForDownload(): List<Map<String, String>> = account.sessionHeaders(id)
}

/** Opening, claiming and listing scans for the current identity. */
object Scans {
    /** Starts a private scan for this identity and pairs this phone to it (the website's phone flow). */
    suspend fun start(account: AccountManager): CaptureSession {
        val created: SessionCreated = ObjectPadApi.send("/sessions", body = buildJsonObject { put("draftId", UUID.randomUUID().toString()); put("rights", true) }, token = account.token())
        val url = created.handoffUrl
        if (url != null) {
            val token = url.substringAfter("token=", "").substringBefore("&")
            if (token.isNotEmpty()) claim(account, created.session.id, token)
        }
        return created.session
    }

    /** Claims a QR handoff: this phone becomes the capture device for that session. */
    suspend fun claim(account: AccountManager, id: String, token: String): CaptureSession {
        val data: SessionClaimed = ObjectPadApi.send("/sessions/$id/claim", body = buildJsonObject { put("token", token) })
        account.saveDeviceSecret(id, data.claimSecret)
        return data.session
    }

    suspend fun mine(account: AccountManager): List<CaptureSession> = ObjectPadApi.get<SessionList>("/sessions", token = account.token()).items

    /** Parses an ObjectPad handoff link: `…/capture/claim#session=<id>&token=<t>`. */
    fun parseHandoff(url: String): Pair<String, String?>? {
        val frag = url.substringAfter('#', "")
        val params = frag.split('&').mapNotNull { p -> p.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }.toMap()
        val id = params["session"] ?: return null
        if (!Regex("^[a-f0-9-]{36}$").matches(id)) return null
        return id to params["token"]?.takeIf { it.isNotBlank() }
    }

    /** Moves this phone's pairing to the follow-up scan after a rescan. */
    fun follow(account: AccountManager, from: String, to: String) {
        account.deviceSecret(from)?.let { account.saveDeviceSecret(to, it) }
        account.forgetDeviceSecret(from)
    }
}

/** The six guided angles, in shooting order. */
enum class ScanView(val id: String, val title: String, val hint: String, val short: String) {
    Front("front", "Front", "Face the object, phone at its height.", "Front"),
    Right("right", "Right side", "Walk a quarter turn around it.", "Right"),
    Back("back", "Back", "Keep walking to the far side.", "Back"),
    Left("left", "Left side", "One more quarter turn.", "Left"),
    HighFront("high-front", "Top · front", "Raise your phone and look down at it.", "Top 1"),
    HighBack("high-back", "Top · back", "From above, go to the far side.", "Top 2");
    companion object { fun of(id: String) = entries.firstOrNull { it.id == id } }
}
