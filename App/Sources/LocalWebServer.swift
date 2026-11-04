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
        var path = parts[1]
        if let mark = path.firstIndex(of: "?") { path = String(path[..<mark]) }
        let decoded = path.removingPercentEncoding ?? path

        // 页面内的本机接口（/ping、/lagfit 等）在 App 内没有服务端：立即返回，避免阻塞页面脚本
        guard method == "GET" else {
            respond(connection, status: "204 No Content", type: "text/plain; charset=utf-8", body: Data())
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
