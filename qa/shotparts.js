const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
(async()=>{
  const servers=TABS.map(t=>start(t,{silent:true}));
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--hide-scrollbars']});
  for (const t of [TABS[0], TABS[4]]) {
    const p=await b.newPage();
    await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await p.goto(`http://127.0.0.1:${t.port}/`,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
    if(t.id===4){ await p.click('button.src-btn[onclick*="xinao"]'); await p.waitForFunction(()=>document.querySelector('#dataMeta')&&document.querySelector('#dataMeta').textContent.trim().length>2,{timeout:90000}); }
    else { await p.click('.src-btn[data-src="xinao"]'); await p.waitForFunction(()=>document.querySelectorAll('.matrix .mc').length>20,{timeout:90000}); }
    await new Promise(r=>setTimeout(r,1500));
    for (const [name,sel] of [['top',null],['matrix','.matrix-wrap'],['dist','.dist-grid'],['mid','#content .card:nth-of-type(3)']]) {
      if(sel){ const el=await p.$(sel); if(el) await el.scrollIntoView(); await new Promise(r=>setTimeout(r,400)); }
      await p.screenshot({path:`out/part-t${t.id}-${name}.png`});
    }
    await p.close();
  }
  await b.close(); servers.forEach(s=>s.close());
})();
