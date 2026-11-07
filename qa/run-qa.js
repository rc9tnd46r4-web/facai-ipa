/* 真机尺寸验收：puppeteer + 本地 Chrome 真渲染，逐项断言 + 出图 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'out');
const PROXY_HOSTS = ['cors.eu.org', 'api.allorigins.win', 'api.codetabs.com', 'api.cors.lol',
  'whateverorigin.org', 'corsproxy.io', 'proxy.corsfix.com', 'corsproxy.org'];

const WIDTHS = [320, 360, 375, 390, 414, 430];
const LANDSCAPE = [[844, 390], [926, 428]];

const results = [];
function record(tab, vp, name, ok, detail) {
  results.push({ tab: tab.id, vp, name, ok, detail });
  const flag = ok ? 'PASS' : 'FAIL';
  console.log(`[${flag}] tab${tab.id} ${vp} ${name}${detail ? ' :: ' + detail : ''}`);
}

function isProxyHost(h) {
  return PROXY_HOSTS.some((d) => h === d || h.endsWith('.' + d));
}

async function loadData(page, tab) {
  if (tab.id === 4) {
    const btn = await page.$('button.src-btn[onclick*="xinao"]');
    if (!btn) throw new Error('source button missing');
    await btn.click();
    await page.waitForFunction(() => {
      const m = document.querySelector('#dataMeta');
      return m && m.textContent.trim().length > 2;
    }, { timeout: 120000, polling: 500 });
  } else {
    const btn = await page.$('.src-btn[data-src="xinao"]');
    if (!btn) throw new Error('source button missing');
    await btn.click();
    await page.waitForFunction(() => {
      const c = document.querySelector('#content');
      return c && !c.classList.contains('hidden') && document.querySelectorAll('.matrix .mc').length > 20;
    }, { timeout: 120000, polling: 500 });
  }
  await new Promise((r) => setTimeout(r, 1200));
}

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const out = {
      innerWidth: window.innerWidth,
      scrollWidth: de.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      btnrowCount: 0,
      btnrowEqual: true,
      btnTruncated: [],
      topbarTop: null,
      topbarVisible: false,
      hasTopline: !!document.querySelector('.wf-topline'),
      updateBtnVisible: false,
      matrixCount: document.querySelectorAll('.matrix').length,
      matrixCells: document.querySelectorAll('.matrix .mc').length,
      matrixOverflow: [],
      cntVisibleWhen12: 0,
      barsCount: document.querySelectorAll('.wf-bars').length,
      barsOverflow: [],
      tablesOverflow: [],
      wideElements: [],
      proxyBlocked: (window.__WF_ADAPT__ && window.__WF_ADAPT__.blockedProxies) || 0,
      adaptReady: !!window.__WF_ADAPT_READY__,
      l1Count: 0,
      statusVisible: false
    };

    const btns = Array.prototype.slice.call(document.querySelectorAll('.wf-btnrow > *'))
      .filter((b) => getComputedStyle(b).display !== 'none');
    out.btnrowCount = btns.length;
    if (btns.length) {
      const w = btns.map((b) => Math.round(b.getBoundingClientRect().width));
      out.btnrowEqual = Math.max.apply(null, w) - Math.min.apply(null, w) <= 1.5;
      out.btnrowWidths = w;
      btns.forEach((b) => {
        if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 2) {
          out.btnTruncated.push(b.textContent.trim().slice(0, 10) + ' ' + b.scrollWidth + '/' + b.clientWidth);
        }
      });
    }

    const bar = document.querySelector('.upload-bar') || document.querySelector('.wf-topbar');
    if (bar) {
      const r = bar.getBoundingClientRect();
      out.topbarTop = Math.round(r.top * 10) / 10;
      out.topbarVisible = r.height > 20 && r.bottom > 0;
    }

    const ub = document.getElementById('updateBtn');
    if (ub) {
      const r = ub.getBoundingClientRect();
      const cs = getComputedStyle(ub);
      out.updateBtnVisible = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }

    document.querySelectorAll('.matrix').forEach((m, i) => {
      const cols = (m.dataset.wfCols || '0');
      const wrap = m.closest('.matrix-wrap') || m.parentElement;
      const mw = m.getBoundingClientRect().width;
      const wrapScrollable = wrap && ['auto', 'scroll'].indexOf(getComputedStyle(wrap).overflowX) >= 0;
      if (m.scrollWidth > mw + 2 && !wrapScrollable) {
        out.matrixOverflow.push({ i, cols, mw: Math.round(mw), sw: Math.round(m.scrollWidth) });
      }
      const cells = m.querySelectorAll('.mc');
      if (cells.length) {
        const first = cells[0].getBoundingClientRect();
        if (first.width < 14) out.matrixOverflow.push({ i, cols, tooNarrow: Math.round(first.width) });
      }
      if (cols === '12') {
        out.cntVisibleWhen12 += Array.prototype.filter.call(m.querySelectorAll('.mc .cnt'), (c) => {
          return getComputedStyle(c).display !== 'none';
        }).length;
      }
    });

    document.querySelectorAll('.wf-bars').forEach((b, i) => {
      const chart = b.querySelector('.bar-chart');
      const r = b.getBoundingClientRect();
      const ox = getComputedStyle(b).overflowX;
      if (r.right > window.innerWidth + 1.5 || (ox !== 'auto' && ox !== 'scroll')) {
        out.barsOverflow.push({ i, right: Math.round(r.right), ox });
      }
      if (chart) {
        const cr = chart.getBoundingClientRect();
        if (cr.height < 40) out.barsOverflow.push({ i, shortChart: Math.round(cr.height) });
      }
    });

    document.querySelectorAll('.card, .win-card, .wrap').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') {
        out.wideElements.push(el.className.slice(0, 30) + ' ' + el.scrollWidth + '/' + el.clientWidth);
      }
    });

    const line1 = document.querySelectorAll('.wf-topline');
    out.l1Count = line1.length;
    return out;
  });
}

async function shellShot(browser, tab, vp, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp[0], height: vp[1], deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`http://127.0.0.1:${tab.port}/__shell`, { waitUntil: 'domcontentloaded' });
  const frame = page.frames().filter((f) => f !== page.mainFrame())[0];
  if (frame) {
    try {
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
      await new Promise((r) => setTimeout(r, 1500));
      await frame.evaluate(() => window.scrollTo(0, 0));
    } catch (e) {
      console.log('[shot warn]', tab.id, e.message);
    }
  }
  await page.screenshot({ path: file });
  const bad = requests.filter((u) => isProxyHost(new URL(u).hostname));
  await page.close();
  return bad.length;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'layout'), { recursive: true });
  const servers = TABS.map((t) => start(t, { silent: true }));
  await new Promise((r) => setTimeout(r, 300));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--disable-dev-shm-usage', '--force-device-scale-factor=1']
  });

  for (const tab of TABS) {
    for (const w of WIDTHS) {
      const vp = `${w}x844`;
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const proxyReqs = [];
      page.on('request', (r) => { try { const h = new URL(r.url()).hostname; if (isProxyHost(h)) proxyReqs.push(r.url()); } catch (e) {} });
      await page.goto(`http://127.0.0.1:${tab.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__WF_ADAPT_READY__, { timeout: 20000 });
      try {
        await loadData(page, tab);
      } catch (e) {
        record(tab, vp, 'load data', false, e.message);
      }
      const m = await measure(page);

      record(tab, vp, 'adapt ready', m.adaptReady);
      record(tab, vp, 'no horizontal overflow',
        m.scrollWidth <= m.innerWidth + 1,
        `doc=${m.scrollWidth} vp=${m.innerWidth} body=${m.bodyScrollWidth}`);
      record(tab, vp, 'topbar two rows', m.hasTopline && m.btnrowCount >= 4, `btn=${m.btnrowCount}`);
      record(tab, vp, 'buttons equal width', m.btnrowEqual, JSON.stringify(m.btnrowWidths || []));
      record(tab, vp, 'buttons not truncated', m.btnTruncated.length === 0, m.btnTruncated.join(' | '));
      record(tab, vp, 'updateBtn hidden', m.updateBtnVisible === false);
      record(tab, vp, 'matrix rendered', tab.id === 4 ? true : m.matrixCells > 20, `cells=${m.matrixCells} cols12cnt=${m.cntVisibleWhen12}`);
      record(tab, vp, 'matrix no overlap', m.matrixOverflow.length === 0, JSON.stringify(m.matrixOverflow).slice(0, 200));
      record(tab, vp, 'matrix 12col cnt hidden', m.cntVisibleWhen12 === 0);
      record(tab, vp, 'bar chart inside viewport', m.barsOverflow.length === 0, JSON.stringify(m.barsOverflow));
      record(tab, vp, 'no wide card overflow', m.wideElements.length === 0, m.wideElements.slice(0, 2).join(' | '));
      record(tab, vp, 'zero proxy requests', proxyReqs.length === 0 && m.proxyBlocked === 0, proxyReqs.slice(0, 2).join(','));

      // sticky 顶栏：滚 600px 后仍贴顶
      await page.evaluate(() => window.scrollTo(0, 600));
      await new Promise((r) => setTimeout(r, 350));
      const top = await page.evaluate(() => {
        const bar = document.querySelector('.upload-bar') || document.querySelector('.wf-topbar');
        return bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null;
      });
      record(tab, vp, 'sticky topbar top==0', top === 0, `top=${top}`);

      await page.screenshot({ path: path.join(OUT, 'layout', `t${tab.id}-${vp}.png`) });
      await page.close();
    }

    for (const vpArr of LANDSCAPE) {
      const vp = `${vpArr[0]}x${vpArr[1]}-land`;
      const page = await browser.newPage();
      await page.setViewport({ width: vpArr[0], height: vpArr[1], deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await page.goto(`http://127.0.0.1:${tab.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__WF_ADAPT_READY__, { timeout: 20000 });
      try { await loadData(page, tab); } catch (e) { record(tab, vp, 'load data', false, e.message); }
      const m = await measure(page);
      record(tab, vp, 'no horizontal overflow', m.scrollWidth <= m.innerWidth + 1, `doc=${m.scrollWidth} vp=${m.innerWidth}`);
      record(tab, vp, 'buttons not truncated', m.btnTruncated.length === 0, m.btnTruncated.join(' | '));
      record(tab, vp, 'matrix no overlap', m.matrixOverflow.length === 0, JSON.stringify(m.matrixOverflow).slice(0, 160));
      await page.screenshot({ path: path.join(OUT, 'layout', `t${tab.id}-${vp}.png`) });
      await page.close();
    }
  }

  // 整机截图（390×844）
  let shotProxy = 0;
  for (const tab of TABS) {
    shotProxy += await shellShot(browser, tab, [390, 844], path.join(OUT, `shot-tab${tab.id}.png`));
  }
  record(TABS[0], '390x844', 'shell screenshots zero proxy', shotProxy === 0);

  await browser.close();
  servers.forEach((s) => s.close());

  const fail = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  console.log(`\n==== ${results.length - fail.length}/${results.length} passed ====`);
  if (fail.length) {
    console.log('FAILED:');
    fail.slice(0, 40).forEach((f) => console.log(` - tab${f.tab} ${f.vp} ${f.name} ${f.detail || ''}`));
    process.exit(1);
  }
})();
