const puppeteer = require('puppeteer-core');
const { TABS, start } = require('./server');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const servers = TABS.map(t => start(t, {silent:true}));
  await new Promise(r => setTimeout(r, 300));
  const browser = await puppeteer.launch({executablePath: CHROME, headless: 'new', args:['--hide-scrollbars']});
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await page.goto('http://127.0.0.1:47835/__shell',{waitUntil:'domcontentloaded'});
  const f = page.frames().filter(x=>x!==page.mainFrame())[0];
  await f.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
  await new Promise(r=>setTimeout(r,800));
  const r = await f.evaluate(()=>{
    const bar = document.querySelector('.wf-topbar');
    const btns = [...document.querySelectorAll('.wf-btnrow > *')].map(b=>({
      tag:b.tagName, cls:b.className, w:Math.round(b.getBoundingClientRect().width), disp:getComputedStyle(b).display
    }));
    const h1 = document.querySelector('.wf-topbar h1');
    const st = document.querySelector('.wf-status');
    return {innerWidth:innerWidth, barH: Math.round(bar.getBoundingClientRect().height), btns,
      h1fs: h1?getComputedStyle(h1).fontSize:null, h1h: h1?Math.round(h1.getBoundingClientRect().height):null,
      stH: st?Math.round(st.getBoundingClientRect().height):null,
      stW: st?Math.round(st.getBoundingClientRect().width):null,
      fs: document.querySelector('#fileStatus')?getComputedStyle(document.querySelector('#fileStatus')).webkitLineClamp:null,
      fsDisp: document.querySelector('#fileStatus')?getComputedStyle(document.querySelector('#fileStatus')).display:null};
  });
  console.log(JSON.stringify(r,null,2));
  await browser.close(); servers.forEach(s=>s.close());
})();
