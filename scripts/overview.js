const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--hide-scrollbars'],
    defaultViewport: { width: 1480, height: 700, deviceScaleFactor: 1.5 },
  });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8901/preview/overview.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: 'preview/shots/0-全部Tab总览.png', fullPage: true });
  await b.close();
  console.log('overview ok');
})();
