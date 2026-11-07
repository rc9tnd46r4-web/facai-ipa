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
    const clipped=(n)=>{ let a=n.parentElement; while(a&&a!==document.documentElement){ const cs=getComputedStyle(a); if(cs.overflowX!=='visible') return true; a=a.parentElement;} return false;};
    const out=[];
    document.querySelectorAll('body *').forEach(e=>{
      const r=e.getBoundingClientRect();
      if(r.width===0) return;
      if(r.right>innerWidth+1 && !clipped(e)) out.push({c:(e.className||e.tagName)+'', tag:e.tagName, w:Math.round(r.width), right:Math.round(r.right)});
    });
    return out.slice(0,15);
  });
  console.log(JSON.stringify(info,null,1));
  await b.close(); servers.forEach(s=>s.close());
})();
