import SwiftUI
import WebKit

/// 单个版本的网页容器：优先走本机 HTTP（保证 localStorage 可用、各版本 origin 隔离），
/// 服务未就绪或加载失败时回退到包内 file:// 直读。
struct WebTabView: UIViewRepresentable {

    let tab: AppTab

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = true
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = false
        webView.backgroundColor = Palette.uiBackground
        webView.scrollView.backgroundColor = Palette.uiBackground
        webView.underPageBackgroundColor = Palette.uiBackground

        WebViewRegistry.shared.register(webView, for: tab.id)
        context.coordinator.attach(webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(tab: tab)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {

        private let tab: AppTab
        private weak var webView: WKWebView?
        private var retries = 0
        private var usedFileFallback = false

        init(tab: AppTab) {
            self.tab = tab
        }

        func attach(_ webView: WKWebView) {
            self.webView = webView
            loadBestAvailable()
        }

        private func loadBestAvailable() {
            guard let webView = webView else { return }

            if ServerHub.shared.isReady(tab: tab), let url = ServerHub.shared.url(for: tab) {
                usedFileFallback = false
                webView.load(URLRequest(url: url))
                return
            }

            if retries < 25 {
                retries += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
                    self?.loadBestAvailable()
                }
            } else {
                loadFromBundle()
            }
        }

        private func loadFromBundle() {
            guard let webView = webView, !usedFileFallback else { return }
            usedFileFallback = true
            let root = ServerHub.shared.webRoot
            let fileURL = root.appendingPathComponent(tab.fileName)
            webView.loadFileURL(fileURL, allowingReadAccessTo: root)
        }

        // MARK: - WKNavigationDelegate

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            retries = 0
        }

        func webView(_ webView: WKWebView,
                     didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            let nsError = error as NSError
            // 主动取消（例如连续 load）不算失败
            if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled { return }
            if usedFileFallback { return }

            if retries < 6 {
                retries += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                    self?.loadBestAvailable()
                }
            } else {
                loadFromBundle()
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            usedFileFallback = false
            retries = 0
            loadBestAvailable()
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url,
               let scheme = url.scheme?.lowercased(),
               scheme == "http" || scheme == "https",
               url.host != "127.0.0.1" {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
