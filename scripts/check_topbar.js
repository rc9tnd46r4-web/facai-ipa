// 顶栏专项：多宽度 + 横屏下检查两行布局是否成立、按钮文字是否被截断
const puppeteer = require('puppeteer-core');
const BASE = 'http://127.0.0.1:8901';
const DATA = 'C:/Users/Administrator/Desktop/3新澳彩.txt';
const PAGES = [
  ['liancuo.html', '十维连错'],
  ['shengxiao.html', '853生肖'],
];
const SIZES = [
  { w: 320, h: 780, tag: '320' },
  { w: 360, h: 780, tag: '360' },
  { w: 390, h: 844, tag: '390' },
  { w: 430, h: 932, tag: '430' },
  { w: 844, h: 390, tag: '横屏' },
];

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  for (const s of SIZES) {
    await p.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    for (const [file, name] of PAGES) {
      await p.goto(`${BASE}/Web/${file}`, { waitUntil: 'networkidle2' });
      const inp = await p.$('#fileInput');
      if (inp) { await inp.uploadFile(DATA); await new Promise(r => setTimeout(r, 3500)); }
      const r = await p.evaluate(() => {
        const bar = document.querySelector('.upload-bar') || document.querySelector('.header');
        const btns = [...document.querySelectorAll('.fc-actions .upload-btn, .fc-toolbar .btn-file')];
        const clipped = btns.filter(el => el.scrollWidth > el.clientWidth + 1)
          .map(el => `${el.textContent.trim()}(${el.clientWidth}<${el.scrollWidth})`);
        const rows = new Set(btns.map(el => Math.round(el.getBoundingClientRect().top)));
        const vw = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('.fc-actions, .fc-toolbar, .fc-head, .fc-status, .fc-brand')]
          .filter(el => el.getBoundingClientRect().right > vw + 2)
          .map(el => el.className);
        return {
          barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
          btnW: btns.map(el => Math.round(el.getBoundingClientRect().width)),
          rows: rows.size, clipped, bad,
          docW: document.documentElement.scrollWidth, vw,
        };
      });
      console.log(`${s.tag}px ${name}: 顶栏高=${r.barH} 按钮=${r.btnW.join('/')} 行数=${r.rows} 截断=${r.clipped.length ? r.clipped.join(',') : '无'} 越界=${r.bad.length ? r.bad.join(',') : '无'} 文档宽=${r.docW}/${r.vw}`);
      if (s.tag === '320' || s.tag === '横屏') {
        await p.screenshot({ path: `preview/shots/top-${s.tag}-${name}.png`, clip: { x: 0, y: 0, width: s.w, height: Math.min(s.h, 200) } });
      }
    }
  }
  await b.close();
})();
