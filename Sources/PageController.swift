import UIKit
import WebKit

/// 每个 Tab 一个 WKWebView + 一个本机 HTTP 服务。
/// 服务起不来先回退 file:// 保证页面能看，1.5s 后重试服务，一旦就绪自动切回 http。
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
        if let url = Bundle.main.url(forResource: "Web", withExtension: nil) { return url }
        return Bundle.main.bundleURL.appendingPathComponent("Web", isDirectory: true)
    }

    init(spec: PageSpec) {
        self.spec = spec

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        // 持久化 localStorage：页面把榜单/设置都存在这里，按端口(origin)分开
        configuration.websiteDataStore = .default()
        configuration.suppressesIncrementalRendering = false

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
        webView.scrollView.backgroundColor = PageController.background(for: spec)
        webView.isOpaque = false
        webView.backgroundColor = PageController.background(for: spec)
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        if #available(iOS 16.4, *) { webView.isInspectable = false }
    }

    deinit {
        retryTimer?.invalidate()
        server?.stop()
        webView.stopLoading()
        webView.configuration.userContentController.removeAllUserScripts()
    }

    private static func background(for spec: PageSpec) -> UIColor {
        spec.dark
            ? UIColor(red: 0.043, green: 0.043, blue: 0.063, alpha: 1)
            : UIColor(red: 0.953, green: 0.961, blue: 0.976, alpha: 1)
    }

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
        webView.load(request)      // load 必须传 URLRequest，不能传 URL
        NSLog("[facai] tab \(spec.id) → \(url.absoluteString)")
    }

    private func loadFileFallback() {
        usingFileFallback = true
        let fileURL = PageController.webRoot.appendingPathComponent(spec.file)
        if FileManager.default.fileExists(atPath: fileURL.path) {
            webView.loadFileURL(fileURL, allowingReadAccessTo: PageController.webRoot)
            NSLog("[facai] tab \(spec.id) fallback file://\(fileURL.lastPathComponent)")
        } else {
            NSLog("[facai] tab \(spec.id) page missing: \(fileURL.path)")
        }
        scheduleRetry()
    }

    /// 服务没起来时每 1.5s 重试一次；成功即切回 http
    private func scheduleRetry() {
        guard retryTimer == nil, retryCount < 40 else { return }
        retryCount += 1
        let timer = Timer(timeInterval: 1.5, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.retryTimer = nil
            if self.usingFileFallback { self.startServer() }
        }
        retryTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func stopRetry() {
        retryTimer?.invalidate()
        retryTimer = nil
        retryCount = 0
    }

    // MARK: - 注入脚本

    /// documentStart：补 LAGFIT_SRV_ON 兜底。
    /// 页面用 const 定义它，但有些页面副本可能漏了这一行；漏了 srcBuildStages 就只剩「直连」一级，
    /// 手机端直连必被跨域拦死。这里用 window 属性兜底（不冲突：页面 const 会在词法环境里遮蔽同名属性）。
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

    /// documentEnd：http 下服务端已注入外部 CSS/JS，这里只做两件事——
    /// ① 缺了就补挂；② 补一次 LAGFIT_SRV_ON（file:// 兜底场景）。
    private static let assetInjectScript = """
    (function(){
      try {
        if (typeof window.LAGFIT_SRV_ON === 'undefined' && location.protocol !== 'file:') {
          window.LAGFIT_SRV_ON = true;
        }
      } catch (e) {}
      function addScript(){
        if (document.querySelector('script[data-wf-adapt]')) return;
        var s = document.createElement('script');
        s.src = 'wf-adapt.js';
        s.setAttribute('data-wf-adapt','1');
        (document.body || document.documentElement).appendChild(s);
      }
      function inject(){
        try {
          if (!document.querySelector('link[data-wf-adapt]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'wf-adapt.css';
            link.setAttribute('data-wf-adapt','1');
            (document.head || document.documentElement).appendChild(link);
          }
        } catch (e) {}
        addScript();
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
        if nsError.code == NSURLErrorCancelled { return }   // 正常切换，不是故障
        guard !usingFileFallback else { return }
        NSLog("[facai] tab \(spec.id) load error: \(nsError.localizedDescription)")
        lastErrorText = nsError.localizedDescription
        loadFileFallback()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        lastErrorText = nil
    }

    func diagnostics() -> [String: Any] {
        [
            "tab": spec.id,
            "port": Int(spec.port),
            "file": spec.file,
            "fallback": usingFileFallback,
            "url": webView.url?.absoluteString ?? "",
            "error": lastErrorText ?? ""
        ]
    }
}
