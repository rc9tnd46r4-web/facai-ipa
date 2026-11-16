const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function show(s) {
  // 把不可见组合符显示成可读标记
  return s.replace(/\u20E3/g, '{KC}').replace(/\uFE0F/g, '{VS16}');
}

(async () => {
  const servers = TABS.map(t => start(t, { silent: true }));
  await new Promise(r => setTimeout(r, 400));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });

  for (const tab of [TABS[0], TABS[4]]) {
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
    if (tab.id === 4) {
      await page.click('button.src-btn[onclick*="xinao"]');
      await page.waitForFunction(() => (document.querySelector('#dataMeta')||{}).textContent?.trim().length > 2, { timeout: 120000, polling: 400 });
    } else {
      await page.click('.src-btn[data-src="xinao"]');
      await page.waitForFunction(() => document.querySelectorAll('.matrix .mc').length > 20, { timeout: 120000, polling: 400 });
    }
    await new Promise(r => setTimeout(r, 2500));

    if (tab.id === 4) {
      const t = await page.evaluate(() => {
        const btn = document.querySelector('#cmpTable .copy-btn');
        if (!btn) return null;
        btn.click();
        return window.__CLIP;
      });
      console.log(`--- tab${tab.id} 853 复制文本 ---`);
      console.log(t ? t.slice(0, 180) : '（未取到）');
      console.log('可见标记:', t ? show(t.slice(0, 120)) : '-');
      console.log('含键帽(U+20E3):', t ? /\u20E3/.test(t) : false, ' 含全角数字:', t ? /[０-９]/.test(t) : false);
    } else {
      const t = await page.evaluate(() => {
        const btn = document.querySelector('.wf-btnrow > .btn-file') ? null : document.querySelector('button.copy-btn');
        if (btn) { btn.click(); return window.__CLIP; }
        // 退回到内部存文本表
        const keys = Object.keys(window._copyStore || {});
        const k = keys.find(x => x.startsWith('dim_')) || keys[0];
        return k ? window._copyStore[k] : null;
      });
      console.log(`--- tab${tab.id} 十维 复制文本 ---`);
      console.log(t ? t.slice(0, 180) : '（未取到）');
      console.log('可见标记:', t ? show(t.slice(0, 120)) : '-');
      console.log('含键帽(U+20E3):', t ? /\u20E3/.test(t) : false, ' 含全角数字:', t ? /[０-９]/.test(t) : false);
    }
    await page.close();
  }
  await b.close(); servers.forEach(s => s.close());
})();
