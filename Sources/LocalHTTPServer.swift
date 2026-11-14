import Foundation
import Network

/// 每个 Tab 一个独立的 127.0.0.1 本机 HTTP 服务（47831~47835）。
///
/// 为什么一页一个端口：页面用 localStorage 存榜单与设置，而 localStorage 按 origin 隔离，
/// 端口就是 origin 的一部分。五个页面共用一个端口会互相串味，所以必须一页一端口。
final class LocalHTTPServer {

    let port: UInt16
    let pageFile: String

    private let webRoot: URL
    private let history: HistoryService
    private let queue: DispatchQueue

    private var listener: NWListener?
    private var completion: ((Bool) -> Void)?
    private var settled = false
    private(set) var isListening = false

    init(port: UInt16, pageFile: String, webRoot: URL, history: HistoryService) {
        self.port = port
        self.pageFile = pageFile
        self.webRoot = webRoot
        self.history = history
        self.queue = DispatchQueue(label: "com.facai.http.\(port)")
    }

    var origin: String { "http://127.0.0.1:\(port)" }

    // MARK: - 生命周期

    func start(completion: @escaping (Bool) -> Void) {
        self.completion = completion
        self.settled = false
        self.isListening = false
        startAttempt(loopbackOnly: true)
    }

    func stop() {
        queue.async {
            self.listener?.stateUpdateHandler = nil
            self.listener?.cancel()
            self.listener = nil
            self.isListening = false
        }
    }

    /// 先绑 127.0.0.1 回环；失败则降级为普通绑定重试一次。
    private func startAttempt(loopbackOnly: Bool) {
        listener?.stateUpdateHandler = nil
        listener?.cancel()
        listener = nil

        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            settle(false)
            return
        }

        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        if loopbackOnly {
            // 显式绑 127.0.0.1：只允许本机访问，外部网络不可达
            params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
            params.requiredInterfaceType = .loopback
        }

        do {
            // 注意参数标签是 on:，不是 port:
            let newListener = try NWListener(using: params, on: nwPort)
            listener = newListener

            newListener.stateUpdateHandler = { [weak self] state in
                guard let self = self, self.listener === newListener else { return }
                switch state {
                case .ready:
                    self.isListening = true
                    self.settle(true)
                case .failed(let error):
                    NSLog("[facai] port \(self.port) listen failed: \(error)")
                    self.isListening = false
                    if loopbackOnly {
                        // 回环绑定失败 → 降级普通绑定，重试一次
                        self.startAttempt(loopbackOnly: false)
                    } else {
                        self.settle(false)
                    }
                default:
                    break
                }
            }
            newListener.newConnectionHandler = { [weak self] connection in
                self?.accept(connection)
            }
            newListener.start(queue: queue)

            // 1.5s 还没 ready 就不再等，避免页面一直白屏
            queue.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self = self, !self.settled else { return }
                if self.isListening {
                    self.settle(true)
                } else if loopbackOnly {
                    self.startAttempt(loopbackOnly: false)
                } else {
                    self.settle(false)
                }
            }
        } catch {
            NSLog("[facai] port \(port) create listener error: \(error)")
            if loopbackOnly {
                startAttempt(loopbackOnly: false)
            } else {
                settle(false)
            }
        }
    }

    private func settle(_ ok: Bool) {
        guard !settled else { return }
        settled = true
        let callback = completion
        completion = nil
        DispatchQueue.main.async { callback?(ok) }
    }

    // MARK: - 连接处理

    private func accept(_ connection: NWConnection) {
        connection.stateUpdateHandler = { state in
            switch state {
            case .failed, .cancelled: connection.cancel()
            default: break
            }
        }
        connection.start(queue: queue)
        receive(connection, buffer: Data())
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 128 * 1024) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            var accumulated = buffer
            if let data = data { accumulated.append(data) }

            if let headRange = accumulated.range(of: Data("\r\n\r\n".utf8)) {
                let headData = accumulated.subdata(in: 0..<headRange.lowerBound)
                let head = String(decoding: headData, as: UTF8.self)
                let bodyData = accumulated.subdata(in: headRange.upperBound..<accumulated.count)
                let needed = Self.contentLength(of: head)
                if bodyData.count < needed {
                    self.receive(connection, buffer: accumulated)
                    return
                }
                self.handle(head: head, body: bodyData, connection: connection)
                return
            }

            if error != nil || isComplete {
                connection.cancel()
                return
            }
            if accumulated.count > 8 * 1024 * 1024 {
                connection.cancel()
                return
            }
            self.receive(connection, buffer: accumulated)
        }
    }

    private static func contentLength(of head: String) -> Int {
        for line in head.components(separatedBy: "\r\n") {
            let parts = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            if parts.count == 2, parts[0].lowercased().trimmingCharacters(in: .whitespaces) == "content-length" {
                return Int(parts[1].trimmingCharacters(in: .whitespaces)) ?? 0
            }
        }
        return 0
    }

    // MARK: - 路由

    private func handle(head: String, body: Data, connection: NWConnection) {
        let lines = head.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            return respond(connection, status: 400, type: "text/plain; charset=utf-8", body: Data("bad request".utf8))
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else {
            return respond(connection, status: 400, type: "text/plain; charset=utf-8", body: Data("bad request".utf8))
        }
        let method = String(parts[0]).uppercased()
        let target = String(parts[1])
        let path = target.components(separatedBy: "?").first ?? "/"
        let query = Self.parseQuery(target)

        if method == "OPTIONS" {
            return respond(connection, status: 204, type: "text/plain", body: Data(),
                           extra: ["Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                                   "Access-Control-Allow-Headers": "*"])
        }

        switch path {
        case "/api/history":
            handleHistory(query: query, connection: connection)
        case "/lagfit":
            handleLagFit(method: method, body: body, connection: connection)
        case "/ping":
            respond(connection, status: 200, type: "text/plain; charset=utf-8", body: Data("pong".utf8))
        case "/", "/index.html":
            guard let data = pageHTML() else {
                return respond(connection, status: 404, type: "text/plain; charset=utf-8", body: Data("page missing".utf8))
            }
            respond(connection, status: 200, type: "text/html; charset=utf-8", body: data)
        case "/__wf_health":
            respond(connection, status: 200, type: "application/json; charset=utf-8",
                    body: Data("{\"ok\":true,\"port\":\(port),\"page\":\"\(pageFile)\"}".utf8))
        default:
            serveStatic(path: path, connection: connection)
        }
    }

    /// GET /api/history?src=xinao|laogang|xianggang —— 由 App 代取源站，绕开跨域
    private func handleHistory(query: [String: String], connection: NWConnection) {
        guard let src = query["src"], !src.isEmpty else {
            return respond(connection, status: 400, type: "application/json; charset=utf-8",
                           body: Data("{\"ok\":false,\"error\":\"missing src\"}".utf8))
        }
        guard history.isKnownSource(src) else {
            return respond(connection, status: 404, type: "application/json; charset=utf-8",
                           body: Data("{\"ok\":false,\"error\":\"unknown src\"}".utf8))
        }
        history.fetch(src: src) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let payload):
                self.respond(connection, status: 200, type: "text/plain; charset=utf-8",
                             body: Data(payload.text.utf8),
                             extra: ["X-Facai-Cache": payload.fromCache ? "1" : "0"])
            case .failure(let error):
                let message = (error as NSError).localizedDescription.replacingOccurrences(of: "\"", with: "'")
                self.respond(connection, status: 502, type: "application/json; charset=utf-8",
                             body: Data("{\"ok\":false,\"error\":\"\(message)\"}".utf8))
            }
        }
    }

    /// 页面建榜后把 LAG 拟合结果同步到本机（跨会话沿用；file:// 时页面自动退回 localStorage）
    private func handleLagFit(method: String, body: Data, connection: NWConnection) {
        let url = lagFitURL()
        if method == "POST" {
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                        withIntermediateDirectories: true)
                try body.write(to: url, options: .atomic)
                respond(connection, status: 200, type: "text/plain; charset=utf-8", body: Data("ok".utf8))
            } catch {
                respond(connection, status: 500, type: "text/plain; charset=utf-8", body: Data("save failed".utf8))
            }
            return
        }
        if let data = try? Data(contentsOf: url) {
            respond(connection, status: 200, type: "application/json; charset=utf-8", body: data)
        } else {
            respond(connection, status: 200, type: "application/json; charset=utf-8", body: Data("{}".utf8))
        }
    }

    private func lagFitURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let name = (pageFile as NSString).deletingPathExtension
        return base.appendingPathComponent("Facai/lagfit/\(name).json")
    }

    // MARK: - 静态资源

    private func serveStatic(path: String, connection: NWConnection) {
        let name = (path as NSString).lastPathComponent
        guard !name.isEmpty, name != "/" else {
            return respond(connection, status: 404, type: "text/plain; charset=utf-8", body: Data("not found".utf8))
        }
        let fileURL = webRoot.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL) else {
            return respond(connection, status: 404, type: "text/plain; charset=utf-8", body: Data("not found".utf8))
        }
        respond(connection, status: 200, type: Self.mimeType(for: name), body: data)
    }

    /// 首页 HTML 在服务端挂上外部适配 CSS / JS —— 页面源文件一个字都不改。
    private func pageHTML() -> Data? {
        let fileURL = webRoot.appendingPathComponent(pageFile)
        guard var text = try? String(contentsOf: fileURL, encoding: .utf8) else { return nil }
        let cssTag = "<link rel=\"stylesheet\" href=\"wf-adapt.css\" data-wf-adapt=\"1\">"
        let jsTag = "<script src=\"wf-adapt.js\" data-wf-adapt=\"1\"></script>"
        if let range = text.range(of: "</head>") {
            text.insert(contentsOf: cssTag, at: range.lowerBound)
        }
        if let range = text.range(of: "</body>") {
            text.insert(contentsOf: jsTag, at: range.lowerBound)
        }
        return text.data(using: .utf8)
    }

    private static func parseQuery(_ target: String) -> [String: String] {
        var result: [String: String] = [:]
        guard let mark = target.firstIndex(of: "?") else { return result }
        for pair in target[target.index(after: mark)...].components(separatedBy: "&") where !pair.isEmpty {
            let kv = pair.components(separatedBy: "=")
            let key = kv[0].removingPercentEncoding ?? kv[0]
            let value = kv.count > 1 ? (kv[1].removingPercentEncoding ?? kv[1]) : ""
            result[key] = value
        }
        return result
    }

    private static func mimeType(for name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js": return "application/javascript; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "txt": return "text/plain; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }

    // MARK: - 响应

    private func respond(_ connection: NWConnection,
                         status: Int,
                         type: String,
                         body: Data,
                         extra: [String: String] = [:]) {
        var head = "HTTP/1.1 \(status) \(Self.statusText(status))\r\n"
        head += "Content-Type: \(type)\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += "Connection: close\r\n"
        head += "Cache-Control: no-store\r\n"
        head += "Access-Control-Allow-Origin: *\r\n"
        for (key, value) in extra { head += "\(key): \(value)\r\n" }
        head += "\r\n"

        var payload = Data(head.utf8)
        payload.append(body)
        connection.send(content: payload, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private static func statusText(_ code: Int) -> String {
        switch code {
        case 200: return "OK"
        case 204: return "No Content"
        case 400: return "Bad Request"
        case 404: return "Not Found"
        case 500: return "Internal Server Error"
        case 502: return "Bad Gateway"
        default: return "OK"
        }
    }
}
