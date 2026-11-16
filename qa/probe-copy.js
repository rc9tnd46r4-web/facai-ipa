/* 实测复制到剪贴板的文本（拦截 navigator.clipboard.writeText） */
const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const servers = TABS.map(t => start(t, { silent: true }));
  await new Promise(r => setTimeout(r, 400));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });

  for (const tab of [TABS[0], TABS[4], TABS[5]]) {
    const page = await b.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => {
      window.__CLIP = null;
      const hook = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText = t => { window.__CLIP = t; return Promise.resolve(); };
        }
      };
      hook();
    });
    await page.goto(`http://127.0.0.1:${tab.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__WF_ADAPT_READY__);
    if (tab.id >= 4) {
      await page.click('button.src-btn[onclick*="xinao"]');
      await page.waitForFunction(() => (document.querySelector('#dataMeta')||{}).textContent?.trim().length > 2, { timeout: 120000, polling: 400 });
    } else {
      await page.click('.src-btn[data-src="xinao"]');
      await page.waitForFunction(() => document.querySelectorAll('.matrix .mc').length > 20, { timeout: 120000, polling: 400 });
    }
    await new Promise(r => setTimeout(r, 2500));

    const t = await page.evaluate((isTab4) => {
      if (isTab4) {
        const btn = document.querySelector('#cmpTable .copy-btn');
        if (!btn) return null;
        btn.click();
        return window.__CLIP;
      }
      const btn = document.querySelector('button.copy-btn');
      if (btn) { btn.click(); return window.__CLIP; }
      const keys = Object.keys(window._copyStore || {});
      const k = keys.find(x => x.startsWith('dim_')) || keys[0];
      return k ? window._copyStore[k] : null;
    }, tab.id >= 4);

    console.log(`===== tab${tab.id} 复制文本 =====`);
    console.log(t ? t.slice(0, 220) : '（未取到）');
    if (t) {
      console.log('含全角括号（）:', /（/.test(t) && /）/.test(t));
      console.log('数字是否全角   :', /（[０-９]+）/.test(t) ? '是' : '否');
      console.log('共N码数字全角  :', /（共[０-９]+码）/.test(t) ? '是' : '否');
      console.log('含键帽 U+20E3  :', /\u20E3/.test(t));
      console.log('号码段是否被包住:', /（0\d/.test(t) ? '是（异常）' : '否（正确，01 03 06 仍是半角裸号）');
    }
    await page.close();
  }
  await b.close(); servers.forEach(s => s.close());
})();
