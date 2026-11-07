const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
(async()=>{
  const servers=TABS.map(t=>start(t,{silent:true}));
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--hide-scrollbars']});
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  p.on('console',m=>console.log('[console]',m.type(),m.text().slice(0,300)));
  p.on('pageerror',e=>console.log('[pageerror]',e.message.slice(0,400)));
  p.on('response',r=>{ if(r.url().includes('history')) console.log('[resp]',r.status(),r.url(),r.headers()['x-facai-cache']); });
  await p.goto('http://127.0.0.1:47831/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__,{timeout:15000});
  await p.click('.src-btn[data-src="xinao"]');
  for(let i=0;i<12;i++){
    await new Promise(r=>setTimeout(r,1500));
    const s=await p.evaluate(()=>({
      status:document.getElementById('status')?.textContent,
      content:document.getElementById('content')?.className,
      stats:document.getElementById('stats')?.textContent?.slice(0,80),
      mc:document.querySelectorAll('.matrix .mc').length,
      recs:(typeof RECS!=='undefined')?RECS.length:'n/a'
    }));
    console.log(i,JSON.stringify(s));
    if(s.mc>20) break;
  }
  await p.screenshot({path:'out/dbg.png',fullPage:false});
  await b.close(); servers.forEach(s=>s.close());
})();
