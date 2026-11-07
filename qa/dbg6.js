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
  console.log(await p.evaluate(()=>{
    const m=document.querySelector('.matrix');
    const hs=[...m.querySelectorAll('.mh')].slice(0,4).map(h=>({html:h.innerHTML,len:h.innerHTML.length,h:h.getBoundingClientRect().height,sw:h.scrollWidth,cw:h.clientWidth,sh:h.scrollHeight,ch:h.clientHeight}));
    return JSON.stringify(hs);
  }));
  await b.close(); servers.forEach(s=>s.close());
})();
