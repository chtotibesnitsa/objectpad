import SwiftUI
import WebKit

/// Serves the downloaded GLB to the page over a private scheme, so private (unlaunched) models never need a public URL.
final class ModelSchemeHandler: NSObject, WKURLSchemeHandler {
    var data: Data = Data()
    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let isModel = task.request.url?.path.hasSuffix(".glb") ?? false
        let body = isModel ? data : Data()
        let response = HTTPURLResponse(url: task.request.url!, statusCode: isModel ? 200 : 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "model/gltf-binary", "Access-Control-Allow-Origin": "*", "Content-Length": "\(body.count)"])!
        task.didReceive(response); task.didReceive(body); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

/// Interactive 3D model (drag to orbit, auto-rotate) rendered with <model-viewer>. Reports when loaded and can snapshot.
struct ModelViewer: UIViewRepresentable {
    let data: Data
    var onLoaded: ((WKWebView) -> Void)? = nil

    final class Coordinator: NSObject, WKScriptMessageHandler {
        var onLoaded: ((WKWebView) -> Void)?
        weak var web: WKWebView?
        let handler = ModelSchemeHandler()
        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) { if let web { onLoaded?(web) } }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        context.coordinator.handler.data = data
        config.setURLSchemeHandler(context.coordinator.handler, forURLScheme: "opmodel")
        config.userContentController.add(context.coordinator, name: "loaded")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false; web.backgroundColor = .clear; web.scrollView.isScrollEnabled = false
        context.coordinator.web = web; context.coordinator.onLoaded = onLoaded
        let html = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
        <script type="module" src="https://unpkg.com/@google/model-viewer@4.0.0/dist/model-viewer.min.js"></script>
        <style>html,body{margin:0;height:100%;background:transparent}model-viewer{width:100%;height:100%;--poster-color:transparent}</style></head>
        <body><model-viewer id="m" src="opmodel://local/model.glb" camera-controls auto-rotate rotation-per-second="24deg" shadow-intensity="1" exposure="1.05" environment-image="neutral" interaction-prompt="none"></model-viewer>
        <script>document.getElementById('m').addEventListener('load',()=>window.webkit.messageHandlers.loaded.postMessage('ok'))</script></body></html>
        """
        web.loadHTMLString(html, baseURL: URL(string: "opmodel://local/"))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}

    /// PNG snapshot of the current view (used as the coin icon).
    static func snapshot(_ web: WKWebView) async -> Data? {
        guard let s = try? await web.evaluateJavaScript("document.getElementById('m').toDataURL('image/png')") as? String, let comma = s.firstIndex(of: ",") else { return nil }
        return Data(base64Encoded: String(s[s.index(after: comma)...]))
    }
}

/// Full-screen viewer for a public model URL.
struct ModelViewerSheet: View {
    let url: String
    let title: String
    @Environment(\.dismiss) private var dismiss
    @State private var data: Data?
    @State private var failed: Bool = false
    var body: some View {
        ZStack {
            Pad.skyGradient.ignoresSafeArea()
            CloudDrift().ignoresSafeArea()
            if let data { ModelViewer(data: data).ignoresSafeArea() }
            else if failed { Text("The 3D model couldn’t load.").font(Typeface.sans(15, 700)).foregroundStyle(.white) }
            else { ProgressView().tint(.white).controlSize(.large) }
            VStack {
                HStack { Text(title).font(Typeface.display(22)).foregroundStyle(.white); Spacer(); CircleIconButton(icon: "xmark", dark: true) { dismiss() } }.padding(16)
                Spacer()
                Text("Drag to orbit · pinch to zoom").font(Typeface.mono(11, 800)).foregroundStyle(.white.opacity(0.8)).padding(.bottom, 30)
            }
        }
        .task {
            guard let u = URL(string: url) else { failed = true; return }
            if let (d, _) = try? await URLSession.shared.data(from: u) { data = d } else { failed = true }
        }
    }
}
