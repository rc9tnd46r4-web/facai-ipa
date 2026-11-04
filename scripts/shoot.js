// 渲染检查：用 Chrome 以 iPhone 视口渲染「原生外壳 + 5 个页面」，截图并检测横向溢出
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8901';
const DATA = 'C:/Users/Administrator/Desktop/3新澳彩.txt';
const OUT = path.join(__dirname, '..', 'preview', 'shots');

const TABS = [
  { i: 0, name: '1-十维连错', file: 'liancuo.html' },
  { i: 1, name: '2-十维连错V2', file: 'liancuov2.html' },
  { i: 2, name: '3-十维连对', file: 'liandui.html' },
  { i: 3, name: '4-十维连对V2', file: 'lianduiv2.html' },
  { i: 4, name: '5-853生肖', file: 'shengxiao.html' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--allow-file-access-from-files'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const report = [];

  for (const tab of TABS) {
    await page.goto(BASE + '/preview/shell.html', { waitUntil: 'networkidle2' });
    await page.evaluate((i) => window.selectTab(i), tab.i);
    await new Promise((r) => setTimeout(r, 800));

    const frame = page.frames().find((f) => f.url().includes(tab.file));
    if (!frame) { report.push(`[${tab.name}] 找不到 iframe`); continue; }

    // 上传开奖记录，触发真实解析渲染
    try {
      const input = await frame.$('#fileInput');
      if (input) {
        await input.uploadFile(DATA);
        await frame.waitForFunction(
          () => {
            const c = document.getElementById('content');
            const meta = document.getElementById('dataMeta');
            return (c && !c.classList.contains('hidden')) || (meta && meta.textContent.trim().length > 0);
          },
          { timeout: 25000 }
        );
      }
    } catch (e) {
      report.push(`[${tab.name}] 数据加载超时：${e.message.split('\n')[0]}`);
    }
    await new Promise((r) => setTimeout(r, 1200));

    // 检测横向溢出（找出「最外层」越界元素，便于定位）
    const overflow = await frame.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.right <= vw + 2) return;
        const p = el.parentElement;
        const pr = p ? p.getBoundingClientRect() : null;
        const parentInside = pr && pr.right <= vw + 2;
        const scrollable = getComputedStyle(el).overflowX !== 'visible';
        if (parentInside && !scrollable) {
          const cls = (el.className || '').toString().slice(0, 36);
          out.push(`${el.tagName}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
        }
      });
      return { vw, docW: document.documentElement.scrollWidth, items: out.slice(0, 10) };
    });
    report.push(`[${tab.name}] 视口=${overflow.vw} 文档宽=${overflow.docW}` + (overflow.items.length ? '\n   溢出: ' + overflow.items.join(' | ') : ' 无溢出'));

    await page.screenshot({ path: path.join(OUT, `${tab.name}-top.png`) });

    // 滚动一屏看中部内容
    await frame.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.9)));
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT, `${tab.name}-mid.png`) });

    // 矩阵表格区域
    const hasMatrix = await frame.evaluate(() => {
      const m = document.querySelector('.matrix-wrap');
      if (!m) return false;
      const y = m.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(0, y) });
      return true;
    });
    if (hasMatrix) {
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: path.join(OUT, `${tab.name}-matrix.png`) });
    }
  }

  // 底部栏细节（放大截图）
  await page.goto(BASE + '/preview/shell.html', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, '0-底部栏.png'), clip: { x: 0, y: 744, width: 390, height: 100 } });

  await browser.close();
  console.log(report.join('\n'));
})();
