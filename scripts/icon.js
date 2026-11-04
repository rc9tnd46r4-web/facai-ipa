const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    defaultViewport: { width: 1024, height: 1024, deviceScaleFactor: 1 },
  });
  const p = await b.newPage();
  await p.goto('file:///C:/Users/Administrator/WorkBuddy/2026-11-04-09-41-07/facai-ios/preview/icon.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: 'App/Assets.xcassets/AppIcon.appiconset/icon-1024.png', omitBackground: false });
  await b.close();
  console.log('icon ok');
})();
