// 多尺寸横向溢出检查：320 / 360 / 375 / 390 / 414 / 430 宽度下逐页体检
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8901';
const DATA = 'C:/Users/Administrator/Desktop/3新澳彩.txt';
const PAGES = [
  ['liancuo.html', '十维连错'],
  ['liancuov2.html', '十维连错V2'],
  ['liandui.html', '十维连对'],
  ['lianduiv2.html', '十维连对V2'],
  ['shengxiao.html', '853生肖'],
];
const WIDTHS = [320, 360, 375, 390, 414, 430];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    for (const [file, name] of PAGES) {
      await page.goto(`${BASE}/Web/${file}`, { waitUntil: 'networkidle2' });
      const input = await page.$('#fileInput');
      if (input) {
        await input.uploadFile(DATA);
        try {
          await page.waitForFunction(
            () => {
              const c = document.getElementById('content');
              const m = document.getElementById('dataMeta');
              return (c && !c.classList.contains('hidden')) || (m && m.textContent.trim().length > 0);
            },
            { timeout: 20000 }
          );
        } catch (e) { /* 忽略：某些页面无需数据也能检查布局 */ }
      }
      await new Promise((r) => setTimeout(r, 600));

      const res = await page.evaluate(() => {
        const vw = window.innerWidth;
        const docW = document.documentElement.scrollWidth;
        const bad = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.right <= vw + 1) return;
          const p = el.parentElement;
          const pr = p ? p.getBoundingClientRect() : null;
          if (pr && pr.right > vw + 1) return;           // 只报最外层
          if (getComputedStyle(el).overflowX !== 'visible') return;
          const cls = (el.className || '').toString().slice(0, 30);
          bad.push(`${el.tagName}.${cls}`);
        });
        return { vw, docW, bad: [...new Set(bad)].slice(0, 4) };
      });

      const flag = res.docW > res.vw + 1 ? '❌ 页面横向溢出' : (res.bad.length ? '⚠️ 局部越界' : '✅');
      console.log(`${width}px ${name.padEnd(10)} doc=${res.docW} vw=${res.vw} ${flag} ${res.bad.join(', ')}`);
    }
  }
  await browser.close();
})();
