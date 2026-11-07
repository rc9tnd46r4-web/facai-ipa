import Foundation
import Network

/// 取数服务：代取源站历史开奖，带 3 次指数退避重试、磁盘缓存与缓存兜底。
final class HistoryService {

    static let shared = HistoryService()

    /// 数据源 → 源站地址（与页面 SRC_INFO / SRC_URLS 的 key 一一对应）
    private let sourceMap: [String: String] = [
        "xinao": "https://www.wuweicb1.com/kj/CBAM1DHK1.txt",
        "laogang": "https://www.wuweicb1.com/kj/CBAMHK1.txt",
        "xianggang": "https://www.wuweicb1.com/kj/CBHK1.txt"
    ]

    private let queue = DispatchQueue(label: "com.facai.history", qos: .userInitiated, attributes: .concurrent)
    private let ioQueue = DispatchQueue(label: "com.facai.history.io")
    private let cacheDir: URL
    private lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 15
        cfg.timeoutIntervalForResource = 25
        cfg.httpAdditionalHeaders = ["Accept-Encoding": "gzip, deflate"]
        return URLSession(configuration: cfg)
    }()

    private let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        cacheDir = base.appendingPathComponent("Facai/history", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    func isKnownSource(_ key: String) -> Bool { sourceMap[key] != nil }

    /// 结果：(正文, 是否来自本地缓存)
    typealias FetchResult = Result<(text: String, fromCache: Bool), Error>

    func fetch(src key: String, completion: @escaping (FetchResult) -> Void) {
        guard let urlString = sourceMap[key], let url = URL(string: urlString) else {
            completion(.failure(NSError(domain: "facai.history", code: 404,
                                        userInfo: [NSLocalizedDescriptionKey: "未知数据源 \(key)"])))
            return
        }
        attempt(key: key, url: url, index: 0, completion: completion)
    }

    /// App 启动预热三个源（失败静默，等真正点击时还有重试）
    func prewarm() {
        for key in sourceMap.keys {
            queue.async { [weak self] in
                guard let self = self else { return }
                self.fetch(src: key) { result in
                    if case .success(let payload) = result {
                        NSLog("[facai] prewarm \(key) ok cached=\(payload.fromCache) bytes=\(payload.text.count)")
                    }
                }
            }
        }
    }

    private func attempt(key: String, url: URL, index: Int, completion: @escaping (FetchResult) -> Void) {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = "GET"
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("https://www.wuweicb1.com/", forHTTPHeaderField: "Referer")
        request.setValue("text/plain,text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                         forHTTPHeaderField: "Accept")
        request.setValue("zh-CN,zh;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
        request.setValue("keep-alive", forHTTPHeaderField: "Connection")
        // 源站对移动端 UA 会先下发一段 JS 挑战页（200 + HTML），带这个 cookie 才直接给数据
        request.setValue("mobile_js_seen=1", forHTTPHeaderField: "Cookie")

        session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if let data = data, status == 200, let text = self.decode(data), self.looksLikeHistory(text) {
                self.writeCache(key: key, text: text)
                completion(.success((text: text, fromCache: false)))
                return
            }
            let reason = error?.localizedDescription ?? "HTTP \(status)"
            if index < 2 {
                // 指数退避：0.6s → 1.2s → 2.4s
                let delay = 0.6 * pow(2.0, Double(index))
                self.queue.asyncAfter(deadline: .now() + delay) {
                    self.attempt(key: key, url: url, index: index + 1, completion: completion)
                }
                return
            }
            // 三次失败：回吐上次成功的磁盘缓存
            if let cached = self.readCache(key: key), !cached.isEmpty {
                NSLog("[facai] history \(key) failed (\(reason)), serve cache")
                completion(.success((text: cached, fromCache: true)))
            } else {
                completion(.failure(NSError(domain: "facai.history", code: 502,
                                            userInfo: [NSLocalizedDescriptionKey: "取数失败：\(reason)"])))
            }
        }.resume()
    }

    // MARK: - 磁盘缓存

    private func cacheURL(key: String) -> URL {
        cacheDir.appendingPathComponent("\(key).txt")
    }

    private func writeCache(key: String, text: String) {
        let url = cacheURL(key: key)
        ioQueue.async {
            try? text.data(using: .utf8)?.write(to: url, options: .atomic)
        }
    }

    private func readCache(key: String) -> String? {
        let url = cacheURL(key: key)
        return ioQueue.sync { () -> String? in
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

    /// 真正的开奖数据是「日期,期号,...」的纯文本；HTML（反爬挑战页）一律判失败，避免把挑战页写进缓存
    private func looksLikeHistory(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }
        if trimmed.hasPrefix("<") { return false }
        return true
    }
}
