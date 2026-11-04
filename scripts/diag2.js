const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', defaultViewport:{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}});
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  const resp = await p.goto('http://127.0.0.1:8901/Web/liancuo.html', {waitUntil:'networkidle2'});
  const r = await p.evaluate(() => {
    const info = [];
    for (const s of document.styleSheets) {
      let n = 0, has = false, err = null;
      try { n = s.cssRules.length; has = [...s.cssRules].some(r => (r.cssText||'').includes('.matrix.sz10')); } catch(e) { err = e.message; }
      info.push({href: s.href, n, has, err});
    }
    const link = document.querySelector('link[rel=stylesheet]');
    return {info, linkOuter: link ? link.outerHTML : null, headEnd: document.head.innerHTML.slice(-300)};
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
