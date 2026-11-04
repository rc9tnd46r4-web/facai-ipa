const puppeteer = require('puppeteer-core');
const fs = require('fs');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } });
  const p = await b.newPage();
  const pages = [['liancuo.html','深色-连错'], ['shengxiao.html','浅色-853']];
  for (const [file, tag] of pages) {
    await p.setCacheEnabled(false);
    await p.goto('http://127.0.0.1:8901/Web/' + file, { waitUntil: 'networkidle2' });
    if (file === 'liancuo.html') {
      const inp = await p.$('#fileInput');
      await inp.uploadFile('C:/Users/Administrator/Desktop/3新澳彩.txt');
      await new Promise(r => setTimeout(r, 4000));
    } else {
      const inp = await p.$('#fileInput');
      await inp.uploadFile('C:/Users/Administrator/Desktop/3新澳彩.txt');
      await new Promise(r => setTimeout(r, 4000));
    }
    await p.screenshot({ path: 'preview/shots/top-' + tag + '.png', clip: { x: 0, y: 0, width: 390, height: 190 } });
    console.log('shot', tag);
  }
  await b.close();
})();
