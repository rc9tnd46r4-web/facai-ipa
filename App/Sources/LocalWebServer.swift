import Foundation
import Network

/// 极简本机 HTTP 服务：把 App 包内的 Web 目录通过 127.0.0.1 提供出去。
///
/// 为什么不用 loadFileURL：
///  - 页面里的 localStorage 在 file:// 下不可靠，加载源的健康记忆、LAG 榜单都依赖它；
///  - 每个版本用独立端口 → 独立 origin，localStorage 互不污染（与桌面版每个 exe 一个端口的行为一致）。
final class LocalWebServer {

    private let root: URL
    private let defaultFile: String
    private let port: UInt16
    private let queue: DispatchQueue
    private var listener: NWListener?

    private(set) var isReady = false

    init(root: URL, defaultFile: String, port: UInt16) {
        self.root = root
        self.defaultFile = defaultFile
        self.port = port
        self.queue = DispatchQueue(label: "facai.http.\(port)", qos: .userInitiated)
    }

    var baseURL: URL? { URL(string: "http://127.0.0.1:\(port)/") }

    func start() {
        guard listener == nil, let nwPort = NWEndpoint.Port(rawValue: port) else { return }
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        do {
            let listener = try NWListener(using: params, on: nwPort)
            listener.stateUpdateHandler = { [weak self] state in
                guard let self = self else { return }
                switch state {
                case .ready:
                    self.isReady = true
                case .failed, .cancelled:
                    self.isReady = false
                default:
                    break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                self?.accept(connection)
            }
            listener.start(queue: queue)
            self.listener = listener
        } catch {
            isReady = false
        }
    }

    // MARK: - 连接处理

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, buffer: Data())
    }

    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 32 * 1024) { [weak self] data, _, isComplete, error in
            guard let self = self else { connection.cancel(); return }
            var accumulated = buffer
            if let data = data { accumulated.append(data) }

            if let headerEnd = accumulated.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: accumulated[..<headerEnd.lowerBound], as: UTF8.self)
                self.handle(connection, head: head)
            } else if isComplete || error != nil || accumulated.count > 256 * 1024 {
                connection.cancel()
            } else {
                self.read(connection, buffer: accumulated)
            }
        }
    }

    private func handle(_ connection: NWConnection, head: String) {
        guard let firstLine = head.components(separatedBy: "\r\n").first, !firstLine.isEmpty else {
            respond(connection, status: "400 Bad Request", type: "text/plain; charset=utf-8", body: Data())
            return
        }
        let parts = firstLine.components(separatedBy: " ")
        guard parts.count >= 2 else {
            respond(connection, status: "400 Bad Request", type: "text/plain; charset=utf-8", body: Data())
            return
        }

        let method = parts[0]
        var target = parts[1]
        var query: [String: String] = [:]
        if let mark = target.firstIndex(of: "?") {
            let raw = String(target[target.index(after: mark)...])
            target = String(target[..<mark])
            query = LocalWebServer.parseQuery(raw)
        }
        let decoded = target.removingPercentEncoding ?? target

        // 页面内的本机接口（/ping、/lagfit 等）在 App 内没有服务端：立即返回，避免阻塞页面脚本
        guard method == "GET" else {
            respond(connection, status: "204 No Content", type: "text/plain; charset=utf-8", body: Data())
            return
        }

        // 开奖数据中转：源站不发 CORS 头，浏览器直连必被拦，公共代理也常挂。
        // 这里由 App 用 URLSession 代取，页面按同源 /api/history 拿到纯文本即可渲染。
        if decoded == "/api/history" {
            proxyHistory(connection, src: query["src"] ?? "")
            return
        }

        var relative = decoded
        if relative.isEmpty || relative == "/" { relative = "/" + defaultFile }

        let components = relative.split(separator: "/").map(String.init)
        guard !components.contains("..") else {
            respondNotFound(connection)
            return
        }

        let fileURL = components.reduce(root) { $0.appendingPathComponent($1) }
        guard let data = try? Data(contentsOf: fileURL) else {
            respondNotFound(connection)
            return
        }
        respond(connection, status: "200 OK", type: mimeType(for: fileURL.pathExtension), body: data)
    }

    // MARK: - 开奖数据中转

    /// 与页面里 SRC_INFO 保持一致；源站不提供 CORS，只能由原生层代取
    private static let sourceURLs: [String: String] = [
        "xinao": "https://www.wuweicb1.com/kj/CBAM1DHK1.txt",
        "laogang": "https://www.wuweicb1.com/kj/CBAMHK1.txt",
        "xianggang": "https://www.wuweicb1.com/kj/CBHK1.txt",
    ]

    /// 90 秒内同源复用（5 个 Tab 端口共享同一份缓存，切 Tab 后点按钮无需重抓）
    private static let cacheLock = NSLock()
    private static var historyCache: [String: (time: Date, body: Data)] = [:]

    private static func parseQuery(_ raw: String) -> [String: String] {
        var out: [String: String] = [:]
        for pair in raw.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let first = kv.first else { continue }
            let key = String(first).removingPercentEncoding ?? String(first)
            let value: String
            if kv.count > 1 {
                value = String(kv[1]).removingPercentEncoding ?? String(kv[1])
            } else {
                value = ""
            }
            out[key] = value
        }
        return out
    }

    private func proxyHistory(_ connection: NWConnection, src: String) {
        guard let urlString = LocalWebServer.sourceURLs[src], let url = URL(string: urlString) else {
            respondNotFound(connection)
            return
        }

        LocalWebServer.cacheLock.lock()
        let cached = LocalWebServer.historyCache[src]
        LocalWebServer.cacheLock.unlock()
        if let cached = cached, Date().timeIntervalSince(cached.time) < 90 {
            respond(connection, status: "200 OK", type: "text/plain; charset=utf-8", body: cached.body)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 25
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        request.setValue("text/plain,*/*;q=0.8", forHTTPHeaderField: "Accept")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            self.queue.async {
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                // 源站异常时会返回 HTML 错误页：判为失败，避免把脏数据缓存下来
                let looksLikeHTML = (data?.first.map { $0 == 0x3C } ?? false)
                if let data = data, !data.isEmpty, !looksLikeHTML, (200..<300).contains(status) {
                    LocalWebServer.cacheLock.lock()
                    LocalWebServer.historyCache[src] = (Date(), data)
                    LocalWebServer.cacheLock.unlock()
                    self.respond(connection, status: "200 OK", type: "text/plain; charset=utf-8", body: data)
                } else {
                    let reason = error?.localizedDescription ?? (looksLikeHTML ? "上游返回 HTML 错误页" : "HTTP \(status)")
                    let body = Data(("upstream error: " + reason).utf8)
                    self.respond(connection, status: "502 Bad Gateway", type: "text/plain; charset=utf-8", body: body)
                }
            }
        }.resume()
    }

    private func respondNotFound(_ connection: NWConnection) {
        respond(connection, status: "404 Not Found", type: "text/plain; charset=utf-8", body: Data("not found".utf8))
    }

    private func respond(_ connection: NWConnection, status: String, type: String, body: Data) {
        var header = "HTTP/1.1 \(status)\r\n"
        header += "Content-Type: \(type)\r\n"
        header += "Content-Length: \(body.count)\r\n"
        header += "Access-Control-Allow-Origin: *\r\n"
        header += "Access-Control-Allow-Headers: *\r\n"
        header += "Cache-Control: no-store\r\n"
        header += "Connection: close\r\n\r\n"

        var payload = Data(header.utf8)
        payload.append(body)
        connection.send(content: payload, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js": return "application/javascript; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "woff", "woff2": return "font/woff2"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - 5 个页面的服务管理

final class ServerHub {

    static let shared = ServerHub()

    private var servers: [Int: LocalWebServer] = [:]
    private var started = false

    var webRoot: URL {
        Bundle.main.bundleURL.appendingPathComponent("Web", isDirectory: true)
    }

    func startAll() {
        guard !started else { return }
        started = true
        for tab in AppTab.all {
            let server = LocalWebServer(root: webRoot, defaultFile: tab.fileName, port: tab.port)
            servers[tab.id] = server
            server.start()
        }
    }

    func isReady(tab: AppTab) -> Bool {
        servers[tab.id]?.isReady ?? false
    }

    func url(for tab: AppTab) -> URL? {
        servers[tab.id]?.baseURL
    }
}
