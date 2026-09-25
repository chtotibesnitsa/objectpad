package com.objectpad.app.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.timeout
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** Error carrying the server's stable error code and HTTP status, with a plain-language message. */
class ApiException(val code: String, val status: Int, message: String) : Exception(message)

/**
 * Client for the ObjectPad backend: the same base URL, paths, identity headers and error codes as objectpad.fun.
 * Mutations send ObjectPad's own origin, which the backend requires for every write.
 */
object ObjectPadApi {
    const val ORIGIN = "https://objectpad-backend.rork.app"
    const val BASE = "$ORIGIN/api"
    const val SITE = "https://www.objectpad.fun"

    val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true; explicitNulls = false; encodeDefaults = true }

    val http = HttpClient(OkHttp) {
        install(HttpTimeout) { requestTimeoutMillis = 30_000; connectTimeoutMillis = 10_000; socketTimeoutMillis = 30_000 }
        expectSuccess = false
    }

    @Serializable private data class ErrorEnvelope(val error: String? = null, val message: String? = null)

    /** Raw request; returns the response text. Throws [ApiException] with a friendly message on any failure. */
    suspend fun raw(
        path: String, method: HttpMethod = HttpMethod.Get, token: String? = null, body: JsonElement? = null, bytes: ByteArray? = null,
        bytesType: ContentType = ContentType.Image.JPEG, headers: Map<String, String> = emptyMap(), timeoutMs: Long = 25_000,
    ): String {
        val url = if (path.startsWith("http")) path else "$BASE$path"
        val response: HttpResponse = try {
            http.request(url) {
                this.method = method
                timeout { requestTimeoutMillis = timeoutMs; socketTimeoutMillis = timeoutMs }
                header("X-Client", "objectpad-android/1.0")
                if (method != HttpMethod.Get) header("Origin", SITE)
                if (token != null) header("Authorization", "Bearer $token")
                headers.forEach { (k, v) -> header(k, v) }
                when {
                    bytes != null -> { contentType(bytesType); setBody(bytes) }
                    body != null -> { contentType(ContentType.Application.Json); setBody(body.toString()) }
                    method != HttpMethod.Get && method != HttpMethod.Delete -> { contentType(ContentType.Application.Json); setBody("{}") }
                }
            }
        } catch (e: Exception) {
            throw ApiException("NETWORK", 0, "ObjectPad could not be reached. Check your connection and retry.")
        }
        val text = response.bodyAsText()
        val status = response.status.value
        if (status !in 200..299) {
            val env = runCatching { json.decodeFromString<ErrorEnvelope>(text) }.getOrNull()
            val code = env?.error ?: "SERVICE_UNAVAILABLE"
            throw ApiException(code, status, env?.message?.takeIf { it.isNotBlank() } ?: describeError(code))
        }
        return text
    }

    suspend inline fun <reified T> get(path: String, token: String? = null, headers: Map<String, String> = emptyMap(), timeoutMs: Long = 25_000): T =
        decode(raw(path, token = token, headers = headers, timeoutMs = timeoutMs))

    suspend inline fun <reified T> send(path: String, method: HttpMethod = HttpMethod.Post, body: JsonElement? = null, token: String? = null, headers: Map<String, String> = emptyMap(), timeoutMs: Long = 25_000): T =
        decode(raw(path, method, token, body, headers = headers, timeoutMs = timeoutMs))

    inline fun <reified T> decode(text: String): T = try { json.decodeFromString<T>(text) } catch (e: Exception) {
        throw ApiException("PARSE", 200, "ObjectPad sent an unexpected response. Retry in a moment.")
    }

    /** Downloads binary content (3D models), optionally with capture-session headers. */
    suspend fun download(url: String, headers: Map<String, String> = emptyMap()): ByteArray {
        val response = try {
            http.request(url) { method = HttpMethod.Get; timeout { requestTimeoutMillis = 90_000; socketTimeoutMillis = 90_000 }; headers.forEach { (k, v) -> header(k, v) } }
        } catch (e: Exception) { throw ApiException("NETWORK", 0, "The 3D model could not be downloaded. Check your connection.") }
        if (response.status.value !in 200..299) throw ApiException("DOWNLOAD", response.status.value, "The 3D model could not be loaded (${response.status.value}).")
        return response.readRawBytes()
    }

    // Public reads
    suspend fun coins(): CoinsFeed = get("/coins", timeoutMs = 45_000)
    suspend fun market(): MarketSnapshot = get("/market", timeoutMs = 30_000)
    suspend fun status(): Readiness = get("/status")
    suspend fun burns(): BurnFeed = get("/burns")
    suspend fun building(): BuildingFeed = get("/building")
    suspend fun curveTrades(curve: String): CurveTrades = get("/curves/$curve/trades", timeoutMs = 40_000)
    suspend fun holders(curve: String): HoldersFeed = get("/curves/$curve/holders", timeoutMs = 40_000)
    suspend fun record(objectId: String): ObjectRecord = get("/objects/$objectId")
    suspend fun objects(q: String = ""): PublicFeed = get("/objects?q=${java.net.URLEncoder.encode(q, "UTF-8")}&category=")
    suspend fun activity(): PublicFeed = get("/activity")
    suspend fun messages(): MessagesFeed = get("/messages")
    suspend fun creator(publicId: String): CreatorArchive = get("/creators/$publicId")
}

private val MESSAGES: Map<String, String> = mapOf(
    "UNAUTHORIZED" to "Your session expired. Sign in again.",
    "RATE_LIMITED" to "Too many requests. Wait a moment and retry.",
    "PROFILE_REQUIRED" to "Create your public creator profile first.",
    "HANDOFF_EXPIRED_OR_USED" to "This QR code expired or was already used. Make a new one on your computer.",
    "CAPTURE_DEVICE_NOT_AUTHORIZED" to "This phone no longer holds the capture session.",
    "UPLOAD_TICKET_INVALID" to "The upload ticket expired. Retry the upload.",
    "IMAGE_RESOLUTION" to "The photo resolution is too low. Use good light.",
    "IMAGE_QUALITY" to "The photo is too blurry, dark or bright. Retake this angle.",
    "DUPLICATE_VIEW" to "This angle looks the same as another. Move around the object and retake.",
    "DUPLICATE_ARCHIVE_FRAME" to "This exact photo already exists in the archive. Capture your own object.",
    "NEAR_DUPLICATE_CAPTURE" to "This capture closely matches an existing object. Each launch needs its own object.",
    "NO_OBJECT" to "No single object was detected. Center one object and retake.",
    "PEOPLE_IN_FRAME" to "A person or face is visible. Keep people out of the frame and retake.",
    "DOCUMENT_IN_FRAME" to "A document or personal information is visible. Remove it and retake.",
    "SCREEN_IN_FRAME" to "A screen is visible. Capture a physical object instead.",
    "PROHIBITED_OBJECT" to "This object is not permitted on ObjectPad.",
    "OBJECT_OR_BACKGROUND_QUALITY" to "Keep the object centered on a consistent background and retake.",
    "MEDIA_VALIDATION_UNAVAILABLE" to "The AI took too long to answer. Tap Try again: your photos are saved.",
    "CAPTURE_INCOMPLETE" to "All six guided angles are required first.",
    "DUPLICATE_OBJECT" to "This object is already on ObjectPad. Every real object can become exactly one coin.",
    "DUPLICATE_ARTIFACT" to "This model or capture already belongs to another coin.",
    "SPONSOR_EMPTY" to "Free launches are paused until the treasury is topped up. Your coin launches automatically once it is.",
    "LAUNCH_BUDGET_REACHED" to "Today’s free launches are used up. Your coin launches automatically tomorrow.",
    "WALLET_REQUIRED" to "Your account has no wallet yet. Sign out and back in to create one.",
    "LAUNCH_SIMULATION_FAILED" to "The launch did not pass its safety simulation. Nothing was sent; retry in a moment.",
    "LAUNCH_BROADCAST_FAILED" to "The network didn’t take the launch just now. Nothing was spent. Tap Launch to send it again.",
    "ICON_INVALID" to "Use a JPG or PNG at least 128 × 128 pixels for the coin icon.",
    "ICON_LOCKED" to "The launch is already sent, so the coin icon is locked in.",
    "PONS_LAUNCH_PAUSED" to "New launches are paused on the launchpad. Your coin launches automatically when it reopens.",
    "LAUNCH_DRAFT_REQUIRED" to "Add a coin name first.",
    "METADATA_INVALID" to "Check the coin name (2–32 characters), ticker (2–10 letters or digits) and story (10–280 characters).",
    "RECORD_ALREADY_COMMITTED" to "This coin’s details are already sealed and can’t be edited.",
    "CAPTURE_CLOSED" to "This scan is closed. Start a new one.",
    "MARKET_UNAVAILABLE" to "Live market data is temporarily unavailable.",
    "PROVIDER_FAILED" to "The 3D rebuild failed. Retake the photos in even light on a plain surface.",
    "RECONSTRUCTION_BUDGET_REACHED" to "Today’s reconstruction capacity is used up. Try again tomorrow.",
    "PROVIDER_CREDITS" to "Reconstruction credits are exhausted. The operator has been notified.",
    "MODEL_NOT_READY" to "The model is not ready yet.",
    "ORIGIN_REJECTED" to "This app version is not allowed to make changes. Update ObjectPad.",
    "NOT_FOUND" to "Nothing exists at this address.",
    "REGENERATE_LIMIT" to "This scan has used its free 3D rebuilds. Rescan the object for fresh photos.",
    "WALLET_INVALID" to "That wallet address doesn’t look right. Paste a full 0x… address or leave it empty.",
    "LINK_INVALID" to "Use https://x.com/handle and https://t.me/group links, or leave them empty.",
    "SIGN_IN_REQUIRED" to "Sign in to save scans to an inventory.",
    "HANDOFF_UNAVAILABLE" to "This scan can’t be opened on another phone right now.",
    "CAPTURE_STORAGE_MISSING" to "A stored photo is missing. Rescan the object.",
    "PROVIDER_PAYLOAD_TOO_LARGE" to "The photos were too heavy for the 3D engine. Rebuilding with lighter copies.",
    "PROVIDER_UNAVAILABLE" to "The 3D engine didn’t answer. Rebuilding from the same photos.",
    "PROVIDER_REQUEST_TIMEOUT" to "The 3D engine took too long to accept the job. Rebuilding from the same photos.",
    "PROVIDER_RATE_LIMIT" to "The 3D engine is busy. Try again in a few seconds.",
    "PROVIDER_REJECTED_INPUT" to "The 3D engine couldn’t use these photos. Rescan in even light on a plain surface.",
    "PROVIDER_TIMEOUT" to "The 3D build took too long. Rebuild from the same photos.",
    "RETAKE_REQUIRED" to "Retake this angle.",
    "MESSAGE_INVALID" to "That message can’t be posted.",
    "PROFILE_INVALID" to "Use 2–32 letters, digits, spaces, dashes or underscores.",
    "AUTH_NOT_CONFIGURED" to "Sign-in isn’t switched on yet.",
)

/** Maps server error codes to plain language without exposing internals. */
fun describeError(code: String): String = MESSAGES[code]
    ?: "The request could not be completed (${code.replace('_', ' ').lowercase()}). Retry safely."
