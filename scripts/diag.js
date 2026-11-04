const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args:['--hide-scrollbars'] , defaultViewport:{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}});
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.goto('http://127.0.0.1:8901/Web/liancuo.html', {waitUntil:'networkidle2'});
  const input = await p.$('#fileInput'); await input.uploadFile('C:/Users/Administrator/Desktop/3新澳彩.txt');
  await p.waitForFunction(()=>{const c=document.getElementById('content');return c&&!c.classList.contains('hidden')},{timeout:25000});
  await new Promise(r=>setTimeout(r,800));
  const info = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.matrix').forEach(m=>{
      const cs=getComputedStyle(m);
      out.push({cls:m.className,w:Math.round(m.getBoundingClientRect().width),cols:cs.gridTemplateColumns.slice(0,120),
        wrapW:Math.round(m.parentElement.getBoundingClientRect().width),
        cellW: m.children[1]?Math.round(m.children[1].getBoundingClientRect().width):0,
        pct: m.querySelector('.mc .pct')?getComputedStyle(m.querySelector('.mc .pct')).fontSize:'-',
        cntDisp: m.querySelector('.mc .cnt')?getComputedStyle(m.querySelector('.mc .cnt')).display:'-'});
    });
    return {out, links:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href)};
  });
  console.log(JSON.stringify(info,null,1));
  await b.close();
})();
