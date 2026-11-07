/* 用本地 Chrome 把 icon/icon.html 截成 1024×1024 无 alpha PNG（App 图标源图） */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(ROOT, 'icon/icon.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));
  const out = path.join(ROOT, 'Assets.xcassets/AppIcon.appiconset/icon-1024.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1024, height: 1024 }, omitBackground: false });
  const size = fs.statSync(out).size;
  console.log('[icon] written', out, size, 'bytes');
  await browser.close();
})();
