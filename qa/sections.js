/* 分区截图：把矩阵 / 柱状图 / 表格 / 底部栏滚到视口内逐块拍，人工核对 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'out', 'sections');

async function load(page, tab) {
  if (tab.id === 4) {
    await page.click('button.src-btn[onclick*="xinao"]');
    await page.waitForFunction(() => {
      const m = document.querySelector('#dataMeta');
      return m && m.textContent.trim().length > 2;
    }, { timeout: 120000, polling: 400 });
  } else {
    await page.click('.src-btn[data-src="xinao"]');
    await page.waitForFunction(() => document.querySelectorAll('.matrix .mc').length > 20,
      { timeout: 120000, polling: 400 });
  }
  await new Promise(r => setTimeout(r, 2000));
}

async function shoot(page, tab, w, label, selector, idx = 0) {
  const ok = await page.evaluate((sel, i) => {
    const els = document.querySelectorAll(sel);
    const el = els[i];
    if (!el) return false;
    const y = el.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo(0, Math.max(0, y));
    return true;
  }, selector, idx);
  if (!ok) { console.log('[skip]', tab.id, w, label, selector); return; }
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, `t${tab.id}-${w}-${label}.png`) });
  console.log('[shot]', `t${tab.id}-${w}-${label}.png`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const servers = TABS.map(t => start(t, { silent: true }));
  await new Promise(r => setTimeout(r, 300));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });

  for (const tab of TABS) {
    for (const w of [320, 390]) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.goto(`http://127.0.0.1:${tab.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__WF_ADAPT_READY__);
      try { await load(page, tab); } catch (e) { console.log('[load fail]', tab.id, e.message); }
      if (tab.id === 4) {
        await shoot(page, tab, w, '01-top', '.wf-topbar');
        await shoot(page, tab, w, '02-dist', '#distAll');
        await shoot(page, tab, w, '03-table', '#predGrid');
        await shoot(page, tab, w, '04-strat', '#stratTableWrap, #stratTable', 0);
      } else {
        await shoot(page, tab, w, '01-top', '.upload-bar');
        await shoot(page, tab, w, '02-matrix', '#matrixArea');
        await shoot(page, tab, w, '03-dist', '.dist-grid');
        await shoot(page, tab, w, '04-top-grid', '.top-grid');
        await shoot(page, tab, w, '05-table', '#detailTable, table', 0);
      }
      await page.close();
    }
  }
  await browser.close();
  servers.forEach(s => s.close());
})();
