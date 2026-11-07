const puppeteer=require('puppeteer-core');
const {TABS,start}=require('./server');
(async()=>{
  const servers=[start(TABS[4],{silent:true})];
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new'});
  const p=await b.newPage();
  await p.setViewport({width:320,height:844,deviceScaleFactor:1});
  await p.goto('http://127.0.0.1:47835/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>!!window.__WF_ADAPT_READY__);
  await p.click('button.src-btn[onclick*="xinao"]');
  await p.waitForFunction(()=>document.querySelector('#dataMeta')&&document.querySelector('#dataMeta').textContent.trim().length>2,{timeout:90000});
  await new Promise(r=>setTimeout(r,1200));
  console.log(JSON.stringify(await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.card,.win-card,.wrap').forEach(el=>{
      if(el.scrollWidth>el.clientWidth+1 && getComputedStyle(el).overflowX==='visible'){
        const kids=[...el.children].map(k=>({c:k.className,w:Math.round(k.getBoundingClientRect().width),sw:k.scrollWidth}));
        out.push({c:el.className,sw:el.scrollWidth,cw:el.clientWidth,kids});
      }
    });
    return out;
  }),null,1));
  await b.close(); servers.forEach(s=>s.close());
})();
