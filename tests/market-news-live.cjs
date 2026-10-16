// Release gate: real deployed news + actual bundled client, with unrelated services isolated.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('App/public/index.html','utf8');
const sweep=fs.readFileSync('tests/app-sweep.cjs','utf8');
const stub=vm.runInNewContext(sweep.slice(sweep.indexOf('const stub='),sweep.indexOf('(async()=>')).replace('const stub=','var stub=')+'\nstub;');
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const errors=[];let offline=false,live;
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/functions/v1/benza-market-news')){
     if(offline)return route.abort('internetdisconnected');
     return route.continue(); // Intentionally no mock, fixture or proxy response.
    }
    if(url==='https://news-release.test/')return route.fulfill({contentType:'text/html',body:html});
    if(url.endsWith('/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:stub});
    if(url.includes('benza-market-prices'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,prices:{gold:4000,silver:50,platinum:1500,palladium:1400,copper:.3},fetched_at:new Date().toISOString()})});
    return route.fulfill({status:200,body:''});
   });
   page.on('response',async response=>{if(response.url().includes('/functions/v1/benza-market-news')&&response.status()===200)live=await response.json();});
   await page.goto('https://news-release.test/');
   await page.locator('#guestBrowseButton').click();
   await page.evaluate(()=>openNews());
   await page.waitForFunction(()=>document.querySelector('#newsStatus').textContent.includes('Live headlines'),null,{timeout:25000});
   assert.equal(live.status,'ok');assert.equal(live.stale,false);assert.ok(live.items.length>0);
   assert.ok(Date.now()-Date.parse(live.fetched_at)<15*60000,'production data must be fresh');
   assert.ok(live.items.some(x=>Date.now()-Date.parse(x.pubDate)<48*3600000),'at least one recent headline');
   assert.equal(await page.locator('.newsCard').count(),Math.min(12,live.items.length));
   await page.evaluate(()=>{window.openedArticle=null;window.open=(url)=>{window.openedArticle=url;};});
   await page.locator('.newsOpen').first().click();
   assert.match(await page.evaluate(()=>window.openedArticle),/^https:\/\//);
   await page.locator('#newsRefreshButton').click();
   await page.waitForFunction(()=>document.querySelector('#newsRefreshButton').getAttribute('aria-busy')==='false');
   const savedAt=await page.evaluate(()=>JSON.parse(localStorage.getItem('benzaMarketNewsCacheV70')).savedAt);
   offline=true;await page.locator('#newsRefreshButton').click();
   await page.waitForFunction(()=>document.querySelector('#newsStatus').textContent.toLowerCase().includes('saved'));
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('benzaMarketNewsCacheV70')).savedAt),savedAt);
   assert.ok(await page.locator('.newsOpen').count()>0,'offline retains usable articles');
   assert.deepEqual(errors,[]);
   console.log('PASS production guest news, refresh, article opening and offline preservation',name,live.items.length,live.fetched_at);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1)});
