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
  await new Promise(r=>setTimeout(r,1000));
  const info=await p.evaluate(()=>{
    const bars=[...document.querySelectorAll('.wf-bars')].slice(0,3).map(b=>{
      const chart=b.querySelector('.bar-chart');
      const item=chart&&chart.querySelector('.bar-item');
      const val=chart&&chart.querySelector('.bar-val');
      return {bw:b.clientWidth, bsw:b.scrollWidth, chartW:chart?Math.round(chart.getBoundingClientRect().width):0,
        itemW:item?Math.round(item.getBoundingClientRect().width):0,
        valW:val?Math.round(val.getBoundingClientRect().width):0, valSW:val?val.scrollWidth:0,
        parentW:Math.round(b.parentElement.getBoundingClientRect().width),
        gridW:Math.round(b.closest('.dist-grid').getBoundingClientRect().width)};
    });
    const m=document.querySelector('.matrix');
    return {bars, matrix: m?{w:Math.round(m.getBoundingClientRect().width), sw:m.scrollWidth, cols:m.dataset.wfCols, wrapW:Math.round(m.closest('.matrix-wrap').clientWidth)}:null};
  });
  console.log(JSON.stringify(info,null,1));
  await b.close(); servers.forEach(s=>s.close());
})();
