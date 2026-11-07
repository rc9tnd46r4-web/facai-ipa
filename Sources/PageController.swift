import UIKit
import WebKit

/// 每个 Tab 一个 WKWebView + 一个本机 HTTP 服务。
/// 服务起不来先回退 file://，并在 1.5s 后重试服务，就绪即自动切回 http。
final class PageController: NSObject, ObservableObject, WKNavigationDelegate {

    let spec: PageSpec
    let webView: WKWebView

    private var server: LocalHTTPServer?
    private var started = false
    private var usingFileFallback = false
    private var retryTimer: Timer?
    private var retryCount = 0
    private var lastErrorText: String?

    static var webRoot: URL {
        if let url = Bundle.main.url(forResource: "Web", withExtension: nil) {
            return url
        }
        return Bundle.main.bundleURL.appendingPathComponent("Web", isDirectory: true)
    }

    init(spec: PageSpec) {
        self.spec = spec

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: PageController.bootstrapScript(port: spec.port),
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(source: PageController.assetInjectScript,
                                              injectionTime: .atDocumentEnd,
                                              forMainFrameOnly: true))
        configuration.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: configuration)

        super.init()

        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.backgroundColor = PageController.background
        webView.isOpaque = false
        webView.backgroundColor = PageController.background
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = false
        }
    }

    deinit {
        retryTimer?.invalidate()
        server?.stop()
        webView.stopLoading()
        webView.configuration.userContentController.removeAllUserScripts()
    }

    private static let background = UIColor(red: 0.043, green: 0.043, blue: 0.063, alpha: 1)

    // MARK: - 启动

    func start() {
        guard !started else { return }
        started = true
        startServer()
    }

    private func startServer() {
        if server == nil {
            server = LocalHTTPServer(port: spec.port,
                                     pageFile: spec.file,
                                     webRoot: PageController.webRoot,
                                     history: .shared)
        }
        server?.start { [weak self] ok in
            guard let self = self else { return }
            if ok {
                self.stopRetry()
                self.loadHTTP()
            } else if !self.usingFileFallback {
                self.loadFileFallback()
            } else {
                self.scheduleRetry()
            }
        }
    }

    private func loadHTTP() {
        guard let url = URL(string: "\(server?.origin ?? "http://127.0.0.1:\(spec.port)")/") else { return }
        usingFileFallback = false
        retryCount = 0
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        webView.load(request)
        NSLog("[facai] tab \(spec.id) load \(url.absoluteString)")
    }

    private func loadFileFallback() {
        usingFileFallback = true
        let fileURL = PageController.webRoot.appendingPathComponent(spec.file)
        if FileManager.default.fileExists(atPath: fileURL.path) {
            webView.loadFileURL(fileURL, allowingReadAccessTo: PageController.webRoot)
            NSLog("[facai] tab \(spec.id) fallback file://\(fileURL.lastPathComponent)")
        } else {
            NSLog("[facai] tab \(spec.id) missing page \(fileURL.path)")
        }
        scheduleRetry()
    }

    /// 服务就绪前每 1.5s 重试一次；成功即切回 http
    private func scheduleRetry() {
        guard retryTimer == nil, retryCount < 40 else { return }
        retryCount += 1
        retryTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.retryTimer = nil
            if self.usingFileFallback {
                self.startServer()
            }
        }
        if let timer = retryTimer {
            RunLoop.main.add(timer, forMode: .common)
        }
    }

    private func stopRetry() {
        retryTimer?.invalidate()
        retryTimer = nil
        retryCount = 0
    }

    // MARK: - 注入脚本

    /// documentStart：先补 LAGFIT_SRV_ON 兜底（用 window 属性，避免和页面的 const 重名冲突），
    /// 再标记原生环境。页面 srcBuildStages 里 typeof LAGFIT_SRV_ON 就能拿到值。
    private static func bootstrapScript(port: UInt16) -> String {
        return """
        (function(){
          window.__WF_NATIVE__ = 1;
          window.__WF_TAB_PORT__ = \(port);
          try {
            if (typeof window.LAGFIT_SRV_ON === 'undefined') {
              window.LAGFIT_SRV_ON = (window.location.protocol !== 'file:');
            }
          } catch (e) {}
        })();
        """
    }

    /// documentEnd：file:// 兜底时手工挂载外部 CSS/JS（http 下服务端已注入，这里会自动跳过）
    private static let assetInjectScript = """
    (function(){
      function inject(){
        try {
          if (document.querySelector('link[data-wf-adapt]')) {
            if (!document.querySelector('script[data-wf-adapt]')) { addScript(); }
            return;
          }
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'wf-adapt.css';
          link.setAttribute('data-wf-adapt','1');
          (document.head || document.documentElement).appendChild(link);
          addScript();
        } catch (e) {}
      }
      function addScript(){
        var s = document.createElement('script');
        s.src = 'wf-adapt.js';
        s.setAttribute('data-wf-adapt','1');
        (document.body || document.documentElement).appendChild(s);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
      } else {
        inject();
      }
    })();
    """

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    private func handleLoadError(_ error: Error) {
        let nsError = error as NSError
        // 取消/中断属于正常切换，不触发兜底
        if nsError.code == NSURLErrorCancelled { return }
        guard !usingFileFallback else { return }
        NSLog("[facai] tab \(spec.id) load error: \(nsError.localizedDescription)")
        lastErrorText = nsError.localizedDescription
        loadFileFallback()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        lastErrorText = nil
    }

    // MARK: - 调试信息

    func diagnostics() -> [String: Any] {
        return [
            "tab": spec.id,
            "port": Int(spec.port),
            "file": spec.file,
            "fallback": usingFileFallback,
            "url": webView.url?.absoluteString ?? "",
            "error": lastErrorText ?? ""
        ]
    }
}
