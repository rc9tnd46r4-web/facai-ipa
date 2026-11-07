const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
(async()=>{
  const servers=[start(TABS[0],{silent:true})];
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:1});
  await p.goto('http://127.0.0.1:47831/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
  await p.click('.src-btn[data-src="xinao"]');
  await p.waitForFunction(()=>document.querySelectorAll('.matrix .mc').length>20,{timeout:90000});
  await new Promise(r=>setTimeout(r,800));
  const info=await p.evaluate(()=>{
    const el=document.getElementById('tabs');
    const chain=[]; let n=el;
    while(n && n!==document.documentElement){ const r=n.getBoundingClientRect(); const cs=getComputedStyle(n);
      chain.push({tag:n.tagName+'.'+(n.className||''), w:Math.round(r.width), sw:n.scrollWidth, cw:n.clientWidth, disp:cs.display, ox:cs.overflowX, minw:cs.minWidth}); n=n.parentElement; }
    const t=el.firstElementChild;
    return {chain, tabW: t?Math.round(t.getBoundingClientRect().width):0, tabsScroll: el.scrollWidth, tabsClient: el.clientWidth};
  });
  console.log(JSON.stringify(info,null,1));
  await b.close(); servers.forEach(s=>s.close());
})();
