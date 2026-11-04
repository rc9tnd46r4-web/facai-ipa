const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:8902/Web/liancuo.html', { waitUntil: 'networkidle2' });
  // 点「新澳」
  await p.evaluate(() => {
    const btn = document.querySelector('.src-btn[data-src="xinao"]');
    if (btn) btn.click();
  });
  try {
    await p.waitForFunction(() => {
      const c = document.getElementById('content');
      return c && !c.classList.contains('hidden');
    }, { timeout: 45000 });
    const info = await p.evaluate(() => ({
      status: document.getElementById('status').textContent.trim(),
      btn: document.querySelector('.src-btn[data-src="xinao"]').textContent.trim(),
      periods: (document.getElementById('totalPeriods') || {}).textContent,
    }));
    console.log('✅ 加载成功 用时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    console.log(JSON.stringify(info, null, 1));
  } catch (e) {
    const info = await p.evaluate(() => ({ status: document.getElementById('status').textContent.trim() }));
    console.log('❌ 超时:', info.status.slice(0, 300));
  }
  await p.screenshot({ path: 'preview/shots/remote-btn-test.png' });
  await b.close();
})();
