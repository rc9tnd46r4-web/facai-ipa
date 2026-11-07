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
  console.log(await p.evaluate(()=>{
    const card=[...document.querySelectorAll('.card')].find(c=>c.scrollWidth>c.clientWidth+1&&getComputedStyle(c).overflowX==='visible');
    if(!card) return 'none';
    const last=card.children[card.children.length-1];
    const t=last.querySelector('table');
    return JSON.stringify({
      lastHtml: last.outerHTML.slice(0,240),
      lastOverflow: getComputedStyle(last).overflowX,
      tableParent: t? t.parentElement.className: 'no table',
      tableClass: t? t.className : '',
      tableW: t? Math.round(t.getBoundingClientRect().width):0,
      tablesInXscroll: document.querySelectorAll('.wf-xscroll table').length,
      allTables: document.querySelectorAll('table').length
    },null,1);
  }));
  await b.close(); servers.forEach(s=>s.close());
})();
