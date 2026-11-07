import Foundation

/// 取数服务：App 代页面请求源站历史开奖，绕开浏览器的跨域限制。
///
/// · 只用「浏览器身份」直连源站：带桌面版 Chrome 的 User-Agent / Referer / Accept，
///   不带任何第三方公共代理（页面里的代理通道也已被注入脚本拦死）。
/// · 3 次尝试，指数退避 0.6s → 1.2s → 2.4s，单次 8s 超时（最坏 27.6s，页面给的本地通道预算是 40s）。
/// · 成功即落盘；三次都失败就回吐上一次成功的磁盘缓存，保证离线也能看历史。
final class HistoryService {

    static let shared = HistoryService()

    /// key 与页面 SRC_INFO / SRC_URLS 完全一致
    private let sourceMap: [String: String] = [
        "xinao": "https://www.wuweicb1.com/kj/CBAM1DHK1.txt",
        "laogang": "https://www.wuweicb1.com/kj/CBAMHK1.txt",
        "xianggang": "https://www.wuweicb1.com/kj/CBHK1.txt"
    ]

    typealias Payload = (text: String, fromCache: Bool)
    typealias FetchResult = Result<Payload, Error>

    private let queue = DispatchQueue(label: "com.facai.history", qos: .userInitiated)
    private let ioQueue = DispatchQueue(label: "com.facai.history.io")
    private let cacheDir: URL
    private var inflight: [String: [FetchResult] -> Void] = [:]

    /// 桌面 Chrome UA：源站对移动端 UA 会下发一段 JS 挑战页（200 + HTML），
    /// 桌面 UA 直接给纯文本数据，所以这里固定用桌面身份，不用手机 UA。
    private let userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 8
        cfg.timeoutIntervalForResource = 12
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.httpAdditionalHeaders = ["Accept-Encoding": "gzip, deflate"]
        return URLSession(configuration: cfg)
    }()

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        cacheDir = base.appendingPathComponent("Facai/history", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    func isKnownSource(_ key: String) -> Bool { sourceMap[key] != nil }

    // MARK: - 对外

    func fetch(src key: String, completion: @escaping (FetchResult) -> Void) {
        guard let urlString = sourceMap[key], let url = URL(string: urlString) else {
            completion(.failure(NSError(domain: "facai.history", code: 404, userInfo: [
                NSLocalizedDescriptionKey: "未知数据源 \(key)"
            ])))
            return
        }
        // 同一源并发请求（启动预热 + 用户点击）合并成一次网络往返
        var merged = false
        queue.sync {
            if inflight[key] != nil {
                inflight[key]?.append(completion)
                merged = true
            } else {
                inflight[key] = [completion]
            }
        }
        if merged { return }
        attempt(key: key, url: url, index: 0)
    }

    /// App 启动预热三个源（失败静默，用户点击时还有重试与缓存）
    func prewarm() {
        for key in sourceMap.keys {
            fetch(src: key) { result in
                if case .success(let payload) = result {
                    NSLog("[facai] prewarm \(key) ok cache=\(payload.fromCache) bytes=\(payload.text.count)")
                }
            }
        }
    }

    // MARK: - 重试链路

    private func attempt(key: String, url: URL, index: Int) {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.httpMethod = "GET"
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("https://www.wuweicb1.com/", forHTTPHeaderField: "Referer")
        request.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.9,*/*;q=0.8",
                         forHTTPHeaderField: "Accept")
        request.setValue("zh-CN,zh;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
        request.setValue("keep-alive", forHTTPHeaderField: "Connection")

        session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0

            if let data = data, status == 200,
               let text = self.decode(data), self.looksLikeHistory(text) {
                self.writeCache(key: key, text: text)
                self.finish(key: key, with: .success((text: text, fromCache: false)))
                return
            }

            let reason = error?.localizedDescription ?? "HTTP \(status)"
            if index < 2 {
                let delay = 0.6 * pow(2.0, Double(index))     // 0.6 → 1.2 → 2.4
                self.queue.asyncAfter(deadline: .now() + delay) {
                    self.attempt(key: key, url: url, index: index + 1)
                }
                return
            }

            // 三次都失败：回吐上次成功的磁盘缓存
            if let cached = self.readCache(key: key), !cached.isEmpty {
                NSLog("[facai] history \(key) failed (\(reason)) → serve disk cache")
                self.finish(key: key, with: .success((text: cached, fromCache: true)))
            } else {
                self.finish(key: key, with: .failure(NSError(domain: "facai.history", code: 502, userInfo: [
                    NSLocalizedDescriptionKey: "取数失败：\(reason)"
                ])))
            }
        }.resume()
    }

    private func finish(key: String, with result: FetchResult) {
        var waiters: [(FetchResult) -> Void] = []
        queue.sync {
            waiters = inflight[key] ?? []
            inflight[key] = nil
        }
        for waiter in waiters { waiter(result) }
    }

    // MARK: - 磁盘缓存

    private func cacheURL(key: String) -> URL { cacheDir.appendingPathComponent("\(key).txt") }

    private func writeCache(key: String, text: String) {
        let url = cacheURL(key: key)
        let data = Data(text.utf8)
        ioQueue.async { try? data.write(to: url, options: .atomic) }
    }

    private func readCache(key: String) -> String? {
        let url = cacheURL(key: key)
        return ioQueue.sync {
            guard let data = try? Data(contentsOf: url) else { return nil }
            return self.decode(data)
        }
    }

    private func decode(_ data: Data) -> String? {
        if let text = String(data: data, encoding: .utf8), !text.isEmpty { return text }
        let gb = CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.GB_18030_2000.rawValue))
        if let text = String(data: data, encoding: String.Encoding(rawValue: gb)), !text.isEmpty { return text }
        return nil
    }

    /// 真正的开奖数据是「日期,期号,7 个号码」的纯文本；反爬挑战页是 HTML，一律判失败，
    /// 免得把挑战页写进缓存、下次离线打开还是垃圾。
    private func looksLikeHistory(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.hasPrefix("<"), trimmed.count > 80 else { return false }
        let head = trimmed.split(separator: "\n").prefix(20)
        guard let firstLine = head.first else { return false }
        let parts = firstLine.split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count >= 9 else { return false }
        return parts[0].count >= 8 && parts[0].contains("-")
    }
}
