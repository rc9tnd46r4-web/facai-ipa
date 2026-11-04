# 本地接口联调：复刻 App 里 /api/history 的行为（静态文件 + 代取源站），用于验证页面侧逻辑
import http.server, socketserver, urllib.request, urllib.parse, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = {
    'xinao': 'https://www.wuweicb1.com/kj/CBAM1DHK1.txt',
    'laogang': 'https://www.wuweicb1.com/kj/CBAMHK1.txt',
    'xianggang': 'https://www.wuweicb1.com/kj/CBHK1.txt',
}
CACHE = {}

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        self.send_response(204); self.end_headers()

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        if p.path == '/api/history':
            key = urllib.parse.parse_qs(p.query).get('src', [''])[0]
            url = SRC.get(key)
            if not url:
                return self._send(404, b'unknown src')
            try:
                if key not in CACHE:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (iPhone)'})
                    with urllib.request.urlopen(req, timeout=25) as r:
                        CACHE[key] = r.read()
                return self._send(200, CACHE[key], 'text/plain; charset=utf-8')
            except Exception as e:
                return self._send(502, ('upstream error: %s' % e).encode())
        return super().do_GET()

    def _send(self, code, body, ctype='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', 8902), H) as httpd:
    print('mock api on 8902')
    sys.stdout.flush()
    httpd.serve_forever()
