const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
(async()=>{
  const servers=TABS.map(t=>start(t,{silent:true}));
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--hide-scrollbars']});
  for (const t of TABS) {
    const p=await b.newPage();
    await p.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await p.goto(`http://127.0.0.1:${t.port}/`,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
    if(t.id===4){ await p.click('button.src-btn[onclick*="xinao"]'); await p.waitForFunction(()=>document.querySelector('#dataMeta')&&document.querySelector('#dataMeta').textContent.trim().length>2,{timeout:90000}); }
    else { await p.click('.src-btn[data-src="xinao"]'); await p.waitForFunction(()=>document.querySelectorAll('.matrix .mc').length>20,{timeout:90000}); }
    await new Promise(r=>setTimeout(r,1500));
    const h=await p.evaluate(()=>document.documentElement.scrollHeight);
    for (const [i,y] of [[1,0],[2,Math.round(h*0.5)],[3,h-900]]) {
      await p.evaluate(v=>window.scrollTo(0,v),y);
      await new Promise(r=>setTimeout(r,500));
      await p.screenshot({path:`out/full-t${t.id}-${i}.png`});
    }
    console.log('tab',t.id,'height',h);
    await p.close();
  }
  await b.close(); servers.forEach(s=>s.close());
})();
