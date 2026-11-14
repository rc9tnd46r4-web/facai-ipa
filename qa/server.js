/* QA 用本机服务：行为对齐 App 内 Swift LocalHTTPServer
   （一页一端口、/api/history 代取源站、静态资源、/lagfit 落盘、/ping） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'Web');
const CACHE = path.join(__dirname, '.cache');

const SRC = {
  xinao: 'https://www.wuweicb1.com/kj/CBAM1DHK1.txt',
  laogang: 'https://www.wuweicb1.com/kj/CBAMHK1.txt',
  xianggang: 'https://www.wuweicb1.com/kj/CBHK1.txt'
};

/* 必须与 Swift 端一致：桌面 Chrome UA。移动端 UA 源站会回 JS 挑战页。 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TABS = [
  { id: 0, port: 47831, file: '10d-lk.html', line1: '十维', line2: '连错', icon: 'xmark.circle' },
  { id: 1, port: 47832, file: '10d-lk2.html', line1: '十维', line2: '连错V2', icon: 'xmark.circle.fill' },
  { id: 2, port: 47833, file: '10d-ld.html', line1: '十维', line2: '连对', icon: 'checkmark.circle' },
  { id: 3, port: 47834, file: '10d-ld2.html', line1: '十维', line2: '连对V2', icon: 'checkmark.circle.fill' },
  { id: 4, port: 47835, file: '853-zs.html', line1: '853', line2: '生肖', icon: 'hare.fill' },
  { id: 5, port: 47836, file: '743-ws.html', line1: '743', line2: '尾数', icon: 'number.circle.fill' }
];

fs.mkdirSync(CACHE, { recursive: true });
const MEM = new Map();

async function fetchSource(key, attempt = 0) {
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < 120000) return { text: hit.text, cache: false };
  try {
    const url = SRC[key];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.wuweicb1.com/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text || text.trim().charAt(0) === '<' || text.length < 80) throw new Error('not history text');
    fs.writeFileSync(path.join(CACHE, key + '.txt'), text);
    MEM.set(key, { text, at: Date.now() });
    return { text, cache: false };
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
      return fetchSource(key, attempt + 1);
    }
    const cached = path.join(CACHE, key + '.txt');
    if (fs.existsSync(cached)) return { text: fs.readFileSync(cached, 'utf8'), cache: true };
    throw err;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

/* 与 Swift LocalHTTPServer.pageHTML() 完全一致的注入方式 */
function pageHtml(file) {
  let text = fs.readFileSync(path.join(WEB, file), 'utf8');
  text = text.replace('</head>', '<link rel="stylesheet" href="wf-adapt.css" data-wf-adapt="1"></head>');
  text = text.replace('</body>', '<script src="wf-adapt.js" data-wf-adapt="1"></script></body>');
  return text;
}

/* SF Symbol 的近似矢量：只在截图外壳里用，真机是系统 Image(systemName:) */
function iconSvg(name, color) {
  if (name.indexOf('xmark') === 0) {
    const filled = name.indexOf('.fill') > 0;
    return `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.6"/><path d="M8.9 8.9l6.2 6.2M15.1 8.9l-6.2 6.2" stroke="${filled ? '#0b0b10' : color}" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  }
  if (name.indexOf('checkmark') === 0) {
    const filled = name.indexOf('.fill') > 0;
    return `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.6"/><path d="M7.9 12.3l2.8 2.8 5.6-6.1" stroke="${filled ? '#0b0b10' : color}" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (name.indexOf('number.circle') === 0) {
    const filled = name.indexOf('.fill') > 0;
    return `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.6"/><text x="12" y="16.3" text-anchor="middle" font-size="11.5" font-weight="600" fill="${filled ? '#0b0b10' : color}" font-family="-apple-system,sans-serif">4</text></svg>`;
  }
  /* hare.fill 近似 */
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}"><path d="M16.2 2.6c1.3 0 2.1 1 1.8 2.1-.3 1.1-1.5 1.9-2.7 1.9-.4 0-.8-.1-1.1-.3-.3-.2-.4-.5-.3-.9.2-1.6 1-2.8 2.3-2.8z"/><path d="M12.7 8.2c2.7 0 5 1.4 6 3.5.5 1.2.4 2.4-.5 2.9-.6.3-1.4.2-2-.2-.5 1.1-1.2 2-2 2.7l1.3 1.4c.3.3.3.7 0 1-.3.3-.7.3-1 0l-1.7-1.8c-.7.3-1.5.5-2.3.5-.7 0-1.4-.1-2-.4l-1.5 1.7c-.3.3-.7.3-1 .1-.3-.3-.3-.7 0-1l1.2-1.4c-1.2-1-2.1-2.4-2.6-3.8-.6.3-1.2.1-1.7-.3-.8-.9-.4-2.4.8-3.7 1.4-1.5 3.5-2.5 5.6-2.5z"/></svg>`;
}

/* 整机外壳：状态栏 + 页面 iframe + 自绘底栏（结构与 SwiftUI RootView/WFTabBar 对齐） */
function shellHtml(tab) {
  const bar = TABS.map((t, i) => {
    const active = i === tab.id;
    const color = active ? '#9287f6' : '#7878a0';
    return `<div class="tab" data-idx="${i}"><div class="ico">${iconSvg(t.icon, color)}</div>` +
      `<div class="l1" style="color:${color}">${t.line1}</div>` +
      `<div class="l2" style="color:${color}">${t.line2}</div></div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#0b0b10;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    -webkit-font-smoothing:antialiased}
  .screen{position:fixed;inset:0;display:flex;flex-direction:column;background:#0b0b10}
  .status{height:47px;flex:0 0 47px;display:flex;align-items:center;justify-content:space-between;
    padding:0 26px 0 30px;color:#fff;font-size:14px;font-weight:600;background:#0b0b10}
  .status .r{display:flex;align-items:center;gap:4px;font-size:11px;letter-spacing:1px}
  .body{flex:1 1 auto;min-height:0;position:relative;background:#080810}
  iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#080810;display:block}
  .bar{flex:0 0 65px;height:65px;display:flex;align-items:flex-start;padding-top:7px;
    background:#09090e;border-top:1px solid rgba(255,255,255,.08)}
  .tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px}
  .tab .ico{height:21px;display:flex;align-items:center}
  .tab .l1{font-size:10.5px;font-weight:600;line-height:1.2;white-space:nowrap}
  .tab .l2{font-size:9px;line-height:1.2;white-space:nowrap}
  .home{flex:0 0 34px;background:#09090e;display:flex;align-items:center;justify-content:center}
  .home i{display:block;width:134px;height:5px;border-radius:3px;background:rgba(255,255,255,.85)}
</style></head><body>
  <div class="screen">
    <div class="status"><span>9:41</span><span class="r">●●● ▮▮</span></div>
    <div class="body"><iframe id="frame" src="http://127.0.0.1:${tab.port}/"></iframe></div>
    <div class="bar" id="tabbar">${bar}</div>
    <div class="home"><i></i></div>
  </div>
</body></html>`;
}

function start(tab, opts = {}) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = u.pathname;

    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(pageHtml(tab.file));
      return;
    }
    if (p === '/__shell') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(shellHtml(tab));
      return;
    }
    if (p === '/api/history') {
      const src = u.searchParams.get('src');
      if (!src || !SRC[src]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false,"error":"unknown src"}');
        return;
      }
      fetchSource(src).then((r) => {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Facai-Cache': r.cache ? '1' : '0'
        });
        res.end(r.text);
      }).catch((e) => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      });
      return;
    }
    if (p === '/lagfit') {
      const f = path.join(CACHE, 'lagfit-' + tab.id + '.json');
      if (req.method === 'POST') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          fs.writeFileSync(f, Buffer.concat(chunks));
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.existsSync(f) ? fs.readFileSync(f) : '{}');
      return;
    }
    if (p === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('pong');
      return;
    }
    const name = path.basename(p);
    const file = path.join(WEB, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(name)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  server.listen(tab.port, '127.0.0.1', () => {
    if (!opts.silent) console.log(`[qa] tab ${tab.id} ${tab.file} → http://127.0.0.1:${tab.port}/`);
  });
  return server;
}

module.exports = { TABS, start, fetchSource, CACHE, ROOT, WEB };

if (require.main === module) TABS.forEach((t) => start(t));
