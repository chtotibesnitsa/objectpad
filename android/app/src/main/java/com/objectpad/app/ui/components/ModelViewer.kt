package com.objectpad.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Color as AColor
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import com.objectpad.app.data.ObjectPadApi
import com.objectpad.app.ui.theme.Pad
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/** Where a GLB comes from: a public URL, or a private scan artifact that needs capture-session headers. */
data class ModelSource(val url: String, val headers: suspend () -> List<Map<String, String>> = { listOf(emptyMap()) }, val key: String = url)

private fun sha(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.take(24)

/**
 * Real-time PBR 3D viewer. GLBs are downloaded natively (with auth headers when private), cached on disk, and rendered
 * by the bundled model-viewer engine from a local origin, so there is no CDN or CORS dependency.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ModelViewer(
    source: ModelSource?, modifier: Modifier = Modifier, autoRotate: Boolean = true, interactive: Boolean = true,
    background: String = "transparent", snapshot: Boolean = false, onSnapshot: ((ByteArray) -> Unit)? = null,
) {
    val context = LocalContext.current
    var file by remember(source?.key) { mutableStateOf<File?>(null) }
    var failed by remember(source?.key) { mutableStateOf<String?>(null) }
    var loaded by remember(source?.key) { mutableStateOf(false) }
    val snapCallback by rememberUpdatedState(onSnapshot)

    LaunchedEffect(source?.key) {
        if (source == null) return@LaunchedEffect
        val cached = File(context.cacheDir, "models/${sha(source.key)}.glb")
        if (cached.exists() && cached.length() > 0) { file = cached; return@LaunchedEffect }
        val bytes = withContext(Dispatchers.IO) {
            var last: Exception? = null
            for (h in source.headers()) {
                try { return@withContext ObjectPadApi.download(source.url, h) } catch (e: Exception) { last = e }
            }
            failed = last?.message ?: "The 3D model could not be loaded."; null
        } ?: return@LaunchedEffect
        withContext(Dispatchers.IO) { cached.parentFile?.mkdirs(); cached.writeBytes(bytes) }
        file = cached
    }

    Box(modifier, contentAlignment = Alignment.Center) {
        val f = file
        if (f != null) {
            val loader = remember {
                WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                    .addPathHandler("/cache/") { path ->
                        val target = File(context.cacheDir, path)
                        if (!target.canonicalPath.startsWith(context.cacheDir.canonicalPath) || !target.exists()) null
                        else WebResourceResponse("model/gltf-binary", null, FileInputStream(target))
                    }.build()
            }
            val html = remember(f.name, autoRotate, interactive, background, snapshot) { page("https://appassets.androidplatform.net/cache/models/${f.name}", autoRotate, interactive, background, snapshot) }
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                        setBackgroundColor(AColor.TRANSPARENT)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = false
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        isVerticalScrollBarEnabled = false; isHorizontalScrollBarEnabled = false
                        overScrollMode = WebView.OVER_SCROLL_NEVER
                        webViewClient = object : WebViewClient() {
                            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
                        }
                        addJavascriptInterface(object {
                            @JavascriptInterface fun loaded() { post { loaded = true } }
                            @JavascriptInterface fun failed() { post { failed = "The 3D model couldn’t be displayed." } }
                            @JavascriptInterface fun snapshot(data: String) {
                                val bytes = runCatching { Base64.decode(data.substringAfter(","), Base64.DEFAULT) }.getOrNull() ?: return
                                post { snapCallback?.invoke(bytes) }
                            }
                        }, "Pad")
                        loadDataWithBaseURL("https://appassets.androidplatform.net/", html, "text/html", "utf-8", null)
                        tag = html
                    }
                },
                update = { view -> if (view.tag != html) { view.tag = html; loaded = false; view.loadDataWithBaseURL("https://appassets.androidplatform.net/", html, "text/html", "utf-8", null) } },
                onRelease = { it.destroy() },
                modifier = Modifier.fillMaxSize(),
            )
        }
        AnimatedVisibility(!loaded && failed == null, enter = fadeIn(), exit = fadeOut()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = Pad.Ink, strokeWidth = 2.dp)
                MonoText("LOADING 3D", Modifier.padding(top = 10.dp), size = 10)
            }
        }
        failed?.let { Body(it, Modifier.padding(20.dp), size = 13) }
    }
}

private fun page(src: String, autoRotate: Boolean, interactive: Boolean, bg: String, snapshot: Boolean) = """
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script type="module" src="/assets/model-viewer.min.js"></script>
<style>html,body{margin:0;height:100%;background:$bg;overflow:hidden;-webkit-tap-highlight-color:transparent}
model-viewer{width:100%;height:100%;background:transparent;--poster-color:transparent;--progress-bar-color:transparent}</style></head>
<body><model-viewer id="m" src="$src" ${if (autoRotate) "auto-rotate auto-rotate-delay=\"0\" rotation-per-second=\"24deg\"" else ""} ${if (interactive) "camera-controls touch-action=\"pan-y\"" else "disable-zoom"}
 interaction-prompt="none" shadow-intensity="0.9" shadow-softness="0.9" exposure="1.05" environment-image="neutral" camera-orbit="0deg 78deg auto" field-of-view="30deg" loading="eager"></model-viewer>
<script>const m=document.getElementById('m');
m.addEventListener('load',()=>{Pad.loaded();${if (snapshot) "setTimeout(async()=>{try{m.autoRotate=false;m.cameraOrbit='0deg 80deg auto';m.jumpCameraToGoal();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=await m.toBlob({mimeType:'image/png',idealAspect:false});const fr=new FileReader();fr.onload=()=>Pad.snapshot(fr.result);fr.readAsDataURL(b);m.autoRotate=${autoRotate};}catch(e){}},700);" else ""}});
m.addEventListener('error',()=>Pad.failed());</script></body></html>
""".trimIndent()
