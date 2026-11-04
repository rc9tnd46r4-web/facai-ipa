// 验证 853 生肖页点「新澳/老澳/香港」能否经本机服务 /api/history 加载
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8902';

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));

  const t0 = Date.now();
  await p.goto(`${BASE}/Web/shengxiao.html`, { waitUntil: 'networkidle2' });

  const flag = await p.evaluate(() => ({
    srv: window.LAGFIT_SRV_ON === undefined ? '未定义❌' : String(window.LAGFIT_SRV_ON),
    status0: document.getElementById('fileStatus').textContent.slice(0, 40),
  }));
  console.log('本机服务开关:', flag.srv, '| 初始状态:', flag.status0);

  const clicked = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('.src-btn')].find((x) => x.getAttribute('onclick')?.includes('xinao'));
    if (!btn) return null;
    btn.click();
    return btn.textContent.trim();
  });
  console.log('已点击按钮:', clicked);

  try {
    await p.waitForFunction(
      () => /已加载|加载失败|仅解析到/.test(document.getElementById('fileStatus').textContent),
      { timeout: 60000 },
    );
    const r = await p.evaluate(() => ({
      status: document.getElementById('fileStatus').textContent.trim(),
      meta: (document.getElementById('dataMeta') || {}).textContent?.trim().slice(0, 80),
      btn: [...document.querySelectorAll('.src-btn')].map((x) => x.textContent.trim()),
      predCards: document.querySelectorAll('#predGrid .win-card').length,
    }));
    const ok = /已加载/.test(r.status);
    console.log(`${ok ? '✅' : '❌'} 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log('状态:', r.status.slice(0, 260));
    console.log('元信息:', r.meta);
    console.log('按钮:', r.btn.join(' | '), '| 预测卡片:', r.predCards);
  } catch (e) {
    const s = await p.evaluate(() => document.getElementById('fileStatus').textContent.trim());
    console.log('❌ 超时/失败:', s.slice(0, 400));
  }
  await p.screenshot({ path: 'preview/shots/853-remote-test.png' });
  await b.close();
})();
