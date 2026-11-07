/* 真机尺寸验收：puppeteer + 本地 Chrome 真渲染，逐项断言 + 出图
   覆盖 320/360/375/390/414/430 竖屏 + 横屏，逐 Tab 灌真实开奖数据后测。 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'out');
const PROXY_HOSTS = ['cors.eu.org', 'api.allorigins.win', 'allorigins.win', 'api.codetabs.com',
  'api.cors.lol', 'cors.lol', 'whateverorigin.org', 'corsproxy.io', 'proxy.corsfix.com',
  'corsproxy.org', 'cors-anywhere.herokuapp.com'];

const WIDTHS = [320, 360, 375, 390, 414, 430];
const LANDSCAPE = [[844, 390], [926, 428]];

const results = [];
function record(tab, vp, name, ok, detail) {
  results.push({ tab: tab.id, vp, name, ok, detail: detail || '' });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] t${tab.id} ${vp} ${name}${detail ? ' :: ' + detail : ''}`);
}

function isProxyHost(h) { return PROXY_HOSTS.some((d) => h === d || h.endsWith('.' + d)); }

async function loadData(page, tab) {
  if (tab.id === 4) {
    const btn = await page.$('button.src-btn[onclick*="xinao"]');
    if (!btn) throw new Error('source button missing');
    await btn.click();
    await page.waitForFunction(() => {
      const m = document.querySelector('#dataMeta');
      return m && m.textContent.trim().length > 2;
    }, { timeout: 120000, polling: 400 });
  } else {
    const btn = await page.$('.src-btn[data-src="xinao"]');
    if (!btn) throw new Error('source button missing');
    await btn.click();
    await page.waitForFunction(() => {
      const c = document.querySelector('#content');
      return c && !c.classList.contains('hidden') && document.querySelectorAll('.matrix .mc').length > 20;
    }, { timeout: 120000, polling: 400 });
  }
  await new Promise((r) => setTimeout(r, 1200));
}

async function measure(page) {
  return page.evaluate(() => {
    const out = {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      hasTopline: !!document.querySelector('.wf-topline'),
      btnCount: 0,
      btnEqual: true,
      btnWidths: [],
      btnTruncated: [],
      topbarTop: null,
      updateBtnVisible: false,
      matrixCount: 0,
      matrixCells: 0,
      matrixIssues: [],
      cntVisibleAt12: 0,
      barsIssues: [],
      barsCount: 0,
      wideElements: [],
      tableIssues: [],
      blockedProxies: (window.__WF_ADAPT__ && window.__WF_ADAPT__.blockedProxies) || 0,
      adaptReady: !!window.__WF_ADAPT_READY__,
      srcStagesOk: false,
      emojiGuard: null,
      dataLoaded: false
    };

    // 按钮：等分 + 不截断
    const btns = Array.prototype.slice.call(document.querySelectorAll('.wf-btnrow > *'))
      .filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 1);
    out.btnCount = btns.length;
    if (btns.length) {
      out.btnWidths = btns.map((b) => Math.round(b.getBoundingClientRect().width));
      out.btnEqual = Math.max.apply(null, out.btnWidths) - Math.min.apply(null, out.btnWidths) <= 1.5;
      btns.forEach((b) => {
        if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) {
          out.btnTruncated.push(b.textContent.trim().slice(0, 8) +
            ' ' + b.scrollWidth + '/' + b.clientWidth);
        }
      });
    }

    const bar = document.querySelector('.upload-bar') || document.querySelector('.wf-topbar');
    out.topbarTop = bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null;

    const ub = document.getElementById('updateBtn');
    if (ub) {
      const r = ub.getBoundingClientRect();
      const cs = getComputedStyle(ub);
      out.updateBtnVisible = cs.display !== 'none' && cs.visibility !== 'hidden' &&
        r.width > 0 && r.height > 0;
    }

    // 矩阵：格子数量、尺寸、12 列次数隐藏、容器能否滚到
    document.querySelectorAll('.matrix').forEach((m, i) => {
      out.matrixCount++;
      const cols = m.dataset.wfCols || '0';
      const wrap = m.closest('.matrix-wrap') || m.parentElement;
      const cells = m.querySelectorAll('.mc');
      out.matrixCells += cells.length;
      if (cells.length) {
        const c0 = cells[0].getBoundingClientRect();
        if (c0.width < 16 || c0.height < 20) {
          out.matrixIssues.push({ i, tiny: Math.round(c0.width) + 'x' + Math.round(c0.height) });
        }
        // 最后一格必须落在容器可滚动范围内，不能被裁掉
        const last = cells[cells.length - 1].getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        if (last.right > wr.right + wrap.scrollLeft + 1.5 && wrap.scrollWidth <= wr.width + 2) {
          out.matrixIssues.push({ i, clipped: Math.round(last.right) + '>' + Math.round(wr.right) });
        }
      }
      if (cols === '12') {
        out.cntVisibleAt12 += Array.prototype.filter.call(m.querySelectorAll('.mc .cnt'), (c) => {
          return getComputedStyle(c).display !== 'none';
        }).length;
      }
    });

    // 柱状图：容器在视口内、可横滑、高度够
    document.querySelectorAll('.wf-bars').forEach((b, i) => {
      out.barsCount++;
      const r = b.getBoundingClientRect();
      const ox = getComputedStyle(b).overflowX;
      if (r.right > window.innerWidth + 1.5 || (ox !== 'auto' && ox !== 'scroll')) {
        out.barsIssues.push({ i, right: Math.round(r.right), ox });
      }
      const chart = b.querySelector('.bar-chart');
      if (chart) {
        const cr = chart.getBoundingClientRect();
        if (cr.height < 40) out.barsIssues.push({ i, short: Math.round(cr.height) });
      }
    });

    // 表格：要么自己滚，要么在横向滚动容器里
    document.querySelectorAll('table').forEach((t, i) => {
      const tr = t.getBoundingClientRect();
      if (tr.right <= window.innerWidth + 1.5) return;
      let anc = t.parentElement, scrollable = false;
      while (anc && anc !== document.body) {
        const ox = getComputedStyle(anc).overflowX;
        if (ox === 'auto' || ox === 'scroll') { scrollable = true; break; }
        anc = anc.parentElement;
      }
      if (!scrollable) out.tableIssues.push({ i, right: Math.round(tr.right) });
    });

    // 卡片/容器自身横向溢出（sticky 失效或整页撑破的根因）
    document.querySelectorAll('.card, .win-card, .wrap, .container').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') {
        out.wideElements.push((el.className || '').slice(0, 26) + ' ' +
          el.scrollWidth + '/' + el.clientWidth);
      }
    });

    // 数据是否真的灌进去了
    const meta = document.getElementById('dataMeta');
    const content = document.getElementById('content');
    out.dataLoaded = (meta && meta.textContent.trim().length > 2) ||
      !!(content && !content.classList.contains('hidden') &&
         document.querySelectorAll('.matrix .mc').length > 20);

    // srcBuildStages 必须是「本地服务 → 直连」两级且带 __wfNoproxy
    try {
      const st = window.srcBuildStages && window.srcBuildStages('xinao', { url: 'https://x.test/a.txt' });
      out.srcStagesOk = Array.isArray(st) && st.length === 2 &&
        st[0].name === '本地服务' && st[1].name === '直连' &&
        !!window.srcBuildStages.__wfNoproxy;
    } catch (e) { out.srcStagesOk = false; }

    // emoji 精确判定：「选」(U+9009) 不能被当成图标，💎(U+1F48E) 必须能
    try {
      out.emojiGuard = window.__wfIsEmoji('选') === false && window.__wfIsEmoji('💎') === true;
    } catch (e) { out.emojiGuard = false; }

    return out;
  });
}

async function shellMeasure(page) {
  return page.evaluate(() => {
    const tabs = Array.prototype.slice.call(document.querySelectorAll('#tabbar .tab'));
    const widths = tabs.map((t) => Math.round(t.getBoundingClientRect().width));
    const truncated = [];
    tabs.forEach((t, i) => {
      const bar = t.getBoundingClientRect();
      ['.ico', '.l1', '.l2'].forEach((sel) => {
        const el = t.querySelector(sel);
        if (!el) { truncated.push(`t${i}${sel} missing`); return; }
        const r = el.getBoundingClientRect();
        if (r.right > bar.right + 0.5 || r.left < bar.left - 0.5) {
          truncated.push(`t${i}${sel} out`);
        }
        if (el.scrollWidth > el.clientWidth + 1) truncated.push(`t${i}${sel} clip`);
      });
      if (!t.querySelector('svg')) truncated.push(`t${i} icon missing`);
      if (!t.querySelector('.l1') || !t.querySelector('.l2')) truncated.push(`t${i} lines missing`);
    });
    const activeColor = tabs[0] ? getComputedStyle(tabs[0].querySelector('.l1')).color : '';
    return {
      count: tabs.length,
      widths,
      equal: widths.length === 5 && Math.max.apply(null, widths) - Math.min.apply(null, widths) <= 1.5,
      truncated,
      activeColor
    };
  });
}

(async () => {
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
      page.on('request', (r) => {
        try { if (isProxyHost(new URL(r.url()).hostname)) proxyReqs.push(r.url()); } catch (e) {}
      });
      await page.goto(`http://127.0.0.1:${tab.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__WF_ADAPT_READY__, { timeout: 20000 });
      let loadErr = '';
      try { await loadData(page, tab); } catch (e) { loadErr = e.message; }
      const m = await measure(page);

      record(tab, vp, 'adapt ready', m.adaptReady);
      record(tab, vp, 'data loaded', !loadErr && m.dataLoaded, loadErr);
      record(tab, vp, 'doc width == viewport', m.scrollWidth <= m.innerWidth + 1,
        `doc=${m.scrollWidth} vp=${m.innerWidth} body=${m.bodyScrollWidth}`);
      record(tab, vp, 'topbar two rows', m.hasTopline && m.btnCount >= 4, `btn=${m.btnCount}`);
      record(tab, vp, 'buttons equal width', m.btnEqual, JSON.stringify(m.btnWidths));
      record(tab, vp, 'buttons not truncated', m.btnTruncated.length === 0, m.btnTruncated.join(' | '));
      record(tab, vp, 'updateBtn hidden', m.updateBtnVisible === false);
      record(tab, vp, 'matrix ok', m.matrixIssues.length === 0,
        `cells=${m.matrixCells} issues=${JSON.stringify(m.matrixIssues).slice(0, 160)}`);
      record(tab, vp, 'matrix 12col cnt hidden', m.cntVisibleAt12 === 0, `cnt=${m.cntVisibleAt12}`);
      record(tab, vp, 'bar chart inside container', m.barsIssues.length === 0,
        JSON.stringify(m.barsIssues).slice(0, 160));
      record(tab, vp, 'tables scrollable', m.tableIssues.length === 0,
        JSON.stringify(m.tableIssues).slice(0, 160));
      record(tab, vp, 'no wide block overflow', m.wideElements.length === 0,
        m.wideElements.slice(0, 2).join(' | '));
      record(tab, vp, 'srcBuildStages 2 levels', m.srcStagesOk);
      record(tab, vp, 'emoji guard precise', m.emojiGuard === true);
      record(tab, vp, 'zero proxy request',
        proxyReqs.length === 0 && m.blockedProxies === 0,
        proxyReqs.slice(0, 2).join(',') + ` blocked=${m.blockedProxies}`);

      // sticky 顶栏：往下滚 600px 仍贴顶
      await page.evaluate(() => window.scrollTo(0, 600));
      await new Promise((r) => setTimeout(r, 350));
      const top = await page.evaluate(() => {
        const bar = document.querySelector('.upload-bar') || document.querySelector('.wf-topbar');
        return bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null;
      });
      record(tab, vp, 'sticky topbar top==0', top === 0, `top=${top}`);

      await page.evaluate(() => window.scrollTo(0, 0));
      if ([375, 390, 430].indexOf(w) >= 0) {
        await page.screenshot({ path: path.join(OUT, 'layout', `t${tab.id}-${vp}.png`) });
      }
      await page.close();
    }

    for (const vpArr of LANDSCAPE) {
      const vp = `${vpArr[0]}x${vpArr[1]}-land`;
      const page = await browser.newPage();
      await page.setViewport({ width: vpArr[0], height: vpArr[1], deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await page.goto(`http://127.0.0.1:${tab.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__WF_ADAPT_READY__, { timeout: 20000 });
      try { await loadData(page, tab); } catch (e) { record(tab, vp, 'data loaded', false, e.message); }
      const m = await measure(page);
      record(tab, vp, 'doc width == viewport', m.scrollWidth <= m.innerWidth + 1,
        `doc=${m.scrollWidth} vp=${m.innerWidth}`);
      record(tab, vp, 'buttons not truncated', m.btnTruncated.length === 0, m.btnTruncated.join(' | '));
      record(tab, vp, 'matrix ok', m.matrixIssues.length === 0, JSON.stringify(m.matrixIssues).slice(0, 120));
      record(tab, vp, 'bar chart inside container', m.barsIssues.length === 0, JSON.stringify(m.barsIssues).slice(0, 120));
      record(tab, vp, 'no wide block overflow', m.wideElements.length === 0, m.wideElements.slice(0, 2).join(' | '));
      await page.screenshot({ path: path.join(OUT, 'layout', `t${tab.id}-${vp}.png`) });
      await page.close();
    }
  }

  /* 整机截图 + 底部栏验收（390×844） */
  for (const tab of TABS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const proxyReqs = [];
    page.on('request', (r) => {
      try { if (isProxyHost(new URL(r.url()).hostname)) proxyReqs.push(r.url()); } catch (e) {}
    });
    await page.goto(`http://127.0.0.1:${tab.port}/__shell`, { waitUntil: 'domcontentloaded' });
    const frame = page.frames().filter((f) => f !== page.mainFrame())[0];
    if (frame) {
      try {
        await frame.waitForFunction(() => !!window.__WF_ADAPT_READY__, { timeout: 20000 });
        if (tab.id === 4) {
          await frame.click('button.src-btn[onclick*="xinao"]');
          await frame.waitForFunction(() => {
            const m = document.querySelector('#dataMeta');
            return m && m.textContent.trim().length > 2;
          }, { timeout: 120000, polling: 400 });
        } else {
          await frame.click('.src-btn[data-src="xinao"]');
          await frame.waitForFunction(() => document.querySelectorAll('.matrix .mc').length > 20,
            { timeout: 120000, polling: 400 });
        }
        await new Promise((r) => setTimeout(r, 1600));
        await frame.evaluate(() => window.scrollTo(0, 0));
      } catch (e) {
        record(tab, '390x844', 'shell data load', false, e.message);
      }
    }
    const bar = await shellMeasure(page);
    record(tab, '390x844', 'tabbar 5 items equal', bar.count === 5 && bar.equal, JSON.stringify(bar.widths));
    record(tab, '390x844', 'tabbar icon+2 lines intact', bar.truncated.length === 0, bar.truncated.join(' | '));
    record(tab, '390x844', 'shell zero proxy', proxyReqs.length === 0, proxyReqs.slice(0, 2).join(','));
    await page.screenshot({ path: path.join(OUT, `shot-tab${tab.id}.png`) });
    await page.close();
  }

  await browser.close();
  servers.forEach((s) => s.close());

  const fail = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  console.log(`\n==== ${results.length - fail.length}/${results.length} passed ====`);
  if (fail.length) {
    console.log('FAILED:');
    fail.slice(0, 60).forEach((f) => console.log(` - t${f.tab} ${f.vp} ${f.name} ${f.detail}`));
    process.exit(1);
  }
})();
