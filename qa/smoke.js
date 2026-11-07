const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
(async()=>{
  const servers=TABS.map(t=>start(t,{silent:true}));
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--hide-scrollbars']});
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await p.goto('http://127.0.0.1:47831/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__,{timeout:15000});
  console.log('adapt ready');
  await p.click('.src-btn[data-src="xinao"]');
  await p.waitForFunction(()=>document.querySelectorAll('.matrix .mc').length>20,{timeout:90000});
  await new Promise(r=>setTimeout(r,1200));
  const info=await p.evaluate(()=>({
    cols:[...document.querySelectorAll('.matrix')].map(m=>m.dataset.wfCols),
    docW:document.documentElement.scrollWidth, vp:innerWidth,
    btnW:[...document.querySelectorAll('.wf-btnrow > *')].filter(x=>getComputedStyle(x).display!=='none').map(x=>Math.round(x.getBoundingClientRect().width)),
    btnTrunc:[...document.querySelectorAll('.wf-btnrow > *')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent.trim()),
    topbar:document.querySelector('.upload-bar')?.getBoundingClientRect().height,
    top:document.querySelector('.upload-bar')?.getBoundingClientRect().top,
    bars:document.querySelectorAll('.wf-bars').length,
    tables:document.querySelectorAll('.wf-xscroll').length
  }));
  console.log(JSON.stringify(info,null,1));
  console.log('errors:',errs.slice(0,8));
  await p.screenshot({path:'out/smoke-390.png'});
  await b.close(); servers.forEach(s=>s.close());
})();
