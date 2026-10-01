const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('App/public/index.html','utf8');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const form=html.slice(html.indexOf('<div id="addScreen"'),html.indexOf('<!-- Locally bundled Supabase client'));
(async()=>{
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 const page=await browser.newPage();fs.mkdirSync('ui-artifacts',{recursive:true});
 for(const width of [320,375,390,430,768,1280]){
  for(const theme of ['dark','light'])for(const pro of [false,true]){
   await page.setViewportSize({width,height:844});
   await page.setContent('<!doctype html><html class="native-app" data-theme="'+theme+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style></head><body>'+form+'</body></html>');
   await page.evaluate(pro=>{
    document.getElementById('addScreen').classList.add('show');
    document.getElementById('proInventoryFields').hidden=!pro;
    document.getElementById('proInventoryFields').open=pro;
    document.getElementById('proInventoryTeaser').hidden=pro;
    document.getElementById('dateDisplay').textContent='October 1, 2026';
   },pro);
   await page.evaluate(()=>document.getAnimations().forEach(animation=>animation.finish()));
   await page.locator('#holdingSheetTitle').waitFor({state:'visible'});
   const metrics=await page.evaluate(()=>{
    const sheet=document.querySelector('#addScreen>.sheet');
    const form=document.querySelector('#addScreen .form');
    const bounds=form.getBoundingClientRect();
    const visible=[...form.querySelectorAll('input,select,textarea,.dateField,.money,.row,.inventoryDetails,.save')].filter(e=>e.getClientRects().length);
    const overflow=visible.filter(e=>{const r=e.getBoundingClientRect();return r.left<bounds.left-.5||r.right>bounds.right+.5}).map(e=>e.id||e.className);
    const rowErrors=[...form.querySelectorAll('.row')].filter(e=>e.getClientRects().length).filter(row=>{const rs=[...row.querySelectorAll('input')].map(e=>e.getBoundingClientRect());return Math.abs(rs[0].top-rs[1].top)>.5||Math.abs(rs[0].width-rs[1].width)>.5}).length;
    const date=document.getElementById('dateDisplay').getBoundingClientRect();
    const dateWrap=document.querySelector('.dateField').getBoundingClientRect();
    sheet.scrollTop=sheet.scrollHeight;
    const save=document.getElementById('holdingSaveBtn').getBoundingClientRect();
    const s=sheet.getBoundingClientRect();
    const header=document.querySelector('#addScreen .sheetTop');const hr=header.getBoundingClientRect();const topElement=document.elementFromPoint(hr.left+hr.width/2,hr.top+hr.height/2);const headerOnTop=header.contains(topElement);
    return {headerOnTop,formWidth:bounds.width,sheetHeight:s.height,sheetTop:s.top,overflow,rowErrors,horizontal:sheet.scrollWidth>sheet.clientWidth+1||form.scrollWidth>form.clientWidth+1,dateCentered:Math.abs((date.left+date.right)-(dateWrap.left+dateWrap.right))<1,saveVisible:save.bottom<=s.bottom+1&&save.top>=s.top};
   });
   const access=await page.evaluate(()=>({yearVisible:!!document.getElementById('holdingYear').getClientRects().length,panels:document.querySelectorAll('#addScreen details.inventoryDetails').length}));
   assert.equal(access.yearVisible,pro);assert.equal(access.panels,1);
   assert.ok(metrics.formWidth>250&&metrics.sheetHeight>200&&metrics.sheetTop>=0,JSON.stringify(metrics));
   assert.deepEqual(metrics.overflow,[],JSON.stringify({width,theme,pro,metrics}));
   assert.equal(metrics.headerOnTop,true,'Sticky header must remain above scrolled date and fields');assert.equal(metrics.rowErrors,0);assert.equal(metrics.horizontal,false);assert.equal(metrics.dateCentered,true);assert.equal(metrics.saveVisible,true);
   if(width===390){await page.locator('#addScreen>.sheet').evaluate(e=>e.scrollTop=0);await page.screenshot({animations:'disabled',path:'ui-artifacts/add-holding-'+engineName+'-'+theme+'-'+(pro?'pro':'free')+'.png'});await page.locator('#addScreen>.sheet').evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:'ui-artifacts/add-holding-'+engineName+'-'+theme+'-'+(pro?'pro':'free')+'-details.png'});}
  }
 }
 await browser.close();
 }
 console.log('PASS 48 responsive form states: aligned fields, centered date, no horizontal overflow, save reachable');
})().catch(e=>{console.error(e);process.exitCode=1});
