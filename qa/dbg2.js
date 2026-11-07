const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
(async()=>{
  const servers=[start(TABS[0],{silent:true})];
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
  for (const mob of [false,true]){
    const p=await b.newPage();
    await p.setViewport({width:390,height:844,isMobile:mob,hasTouch:mob,deviceScaleFactor:1});
    await p.goto('http://127.0.0.1:47831/',{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
    const before=await p.evaluate(()=>({iw:innerWidth,vw:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth,vp:document.querySelector('meta[name=viewport]').content}));
    await p.click('.src-btn[data-src="xinao"]');
    await p.waitForFunction(()=>document.querySelectorAll('.matrix .mc').length>20,{timeout:90000});
    await new Promise(r=>setTimeout(r,1000));
    const after=await p.evaluate(()=>{
      const all=[...document.querySelectorAll('body *')];
      const wide=all.filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,6).map(e=>e.className+':'+Math.round(e.getBoundingClientRect().width)+':'+Math.round(e.getBoundingClientRect().right));
      return {iw:innerWidth,sw:document.documentElement.scrollWidth,wideCount:wide.length,wide};
    });
    console.log('isMobile',mob,JSON.stringify({before,after}));
    await p.close();
  }
  await b.close(); servers.forEach(s=>s.close());
})();
