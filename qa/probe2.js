const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const servers = TABS.map(t => start(t, {silent:true}));
  await new Promise(r => setTimeout(r, 300));
  const b = await puppeteer.launch({executablePath: CHROME, headless:'new', args:['--hide-scrollbars']});
  for (const w of [320,360,375,390]) {
    const page = await b.newPage();
    await page.setViewport({width:w,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await page.goto('http://127.0.0.1:47835/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
    await new Promise(r=>setTimeout(r,700));
    const r = await page.evaluate(()=>{
      const btns=[...document.querySelectorAll('.wf-btnrow > *')];
      return btns.map(x=>({t:x.textContent.trim().slice(0,10),w:Math.round(x.getBoundingClientRect().width),sw:x.scrollWidth,cw:x.clientWidth,sh:x.scrollHeight,ch:x.clientHeight,fs:getComputedStyle(x).fontSize}));
    });
    console.log(w, JSON.stringify(r));
    if (w===320) await page.screenshot({path:'qa/out/probe-853-320.png', clip:{x:0,y:0,width:320,height:110}});
    await page.close();
  }
  await b.close(); servers.forEach(s=>s.close());
})();
