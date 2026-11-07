/* 最终交付截图：整机外壳（状态栏 47 + 内容 697 + 底栏 66 + Home 34 = 844） */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'out', 'final');
const PROXY_HOSTS = ['cors.eu.org', 'api.allorigins.win', 'api.codetabs.com', 'api.cors.lol',
  'whateverorigin.org', 'corsproxy.io', 'proxy.corsfix.com'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const servers = TABS.map((t) => start(t, { silent: true }));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-device-scale-factor=2']
  });

  const report = [];
  for (const tab of TABS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const bad = [];
    page.on('request', (r) => {
      try {
        const h = new URL(r.url()).hostname;
        if (PROXY_HOSTS.some((d) => h === d || h.endsWith('.' + d))) bad.push(r.url());
      } catch (e) {}
    });
    await page.goto(`http://127.0.0.1:${tab.port}/__shell`, { waitUntil: 'domcontentloaded' });
    const frame = page.frames().filter((f) => f !== page.mainFrame())[0];
    if (tab.id === 4) {
      await frame.click('button.src-btn[onclick*="xinao"]');
      await frame.waitForFunction(() => {
        const m = document.querySelector('#dataMeta');
        return m && m.textContent.trim().length > 2;
      }, { timeout: 120000, polling: 500 });
    } else {
      await frame.click('.src-btn[data-src="xinao"]');
      await frame.waitForFunction(() => document.querySelectorAll('.matrix .mc').length > 20,
        { timeout: 120000, polling: 500 });
    }
    await new Promise((r) => setTimeout(r, 1600));

    const bar = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.bar .tab')];
      const widths = tabs.map((t) => Math.round(t.getBoundingClientRect().width));
      const labels = tabs.map((t) => [...t.querySelectorAll('.l1,.l2')].map((l) => ({
        text: l.textContent,
        trunc: l.scrollWidth > l.clientWidth + 1,
        w: Math.round(l.getBoundingClientRect().width),
        sw: l.scrollWidth
      })));
      return { count: tabs.length, widths, labels, barH: Math.round(document.querySelector('.bar').getBoundingClientRect().height) };
    });

    const file = path.join(OUT, `tab${tab.id + 1}-${tab.line1}${tab.line2}.png`);
    await page.screenshot({ path: file });
    report.push({ tab: tab.id + 1, file: path.basename(file), bar, proxyRequests: bad.length });
    console.log(`[shot] ${path.basename(file)} bar=${JSON.stringify(bar.widths)} proxy=${bad.length}`);
    await page.close();
  }

  await browser.close();
  servers.forEach((s) => s.close());
  fs.writeFileSync(path.join(OUT, 'tabbar-report.json'), JSON.stringify(report, null, 2));
  console.log('[done]', OUT);
})();
