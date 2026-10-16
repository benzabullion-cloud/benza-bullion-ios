// Exercise the actual bundled app with isolated mock services, including delayed auth.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('App/public/index.html','utf8');
const sweep=fs.readFileSync('tests/app-sweep.cjs','utf8');
const stub=vm.runInNewContext(sweep.slice(sweep.indexOf('const stub='),sweep.indexOf('(async()=>')).replace('const stub=','var stub=')+'\nstub;');
(async()=>{
 for(const [name,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  try{
   for(const viewport of [{width:390,height:844},{width:320,height:568},{width:834,height:1194},{width:1194,height:834}]){
    const page=await browser.newPage({viewport});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
     const url=route.request().url();
     if(url==='https://guest.test/')return route.fulfill({contentType:'text/html',body:html});
     if(url.endsWith('/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:stub});
     if(url.includes('benza-market-prices'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,prices:{gold:4000,silver:50,platinum:1500,palladium:1400,copper:.3},fetched_at:new Date().toISOString()})});
     if(url.includes('benza-market-news'))return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',fetched_at:new Date().toISOString(),items:[{title:'Bullion market headline',link:'https://example.test/news',pubDate:new Date().toISOString()}]})});
     return route.fulfill({status:200,body:''});
    });
    await page.goto('https://guest.test/');
    for(const theme of ['dark','light']){
     const writesBeforeGuest=await page.evaluate(()=>sweep.writes.length);
     await page.evaluate(t=>applyTheme(t),theme);
     await page.locator('#guestBrowseButton').click();
     assert.equal(await page.locator('#marketsScreen').isVisible(),true);
     assert.equal(await page.evaluate(()=>currentUser),null);
     await page.waitForFunction(()=>document.getElementById('marketsFocusPrice').textContent!=='—');
     await page.locator('#marketsCalculatorTab').click();
     assert.equal(await page.locator('#marketsCalculatorPanel').isVisible(),true);
     await page.evaluate(()=>openNews());await page.getByText('Bullion market headline',{exact:true}).waitFor();
     for(const fn of ['goPortfolio','openAnalytics','openAddChoice','openSettings']){
      await page.evaluate(f=>window[f](),fn);
      assert.equal(await page.locator('#authScreen').isVisible(),true,fn);
      await page.locator('#guestBrowseButton').click();
     }
     await page.locator('#marketsWatchTab').click();
     assert.equal(await page.locator('#authScreen').isVisible(),true);
     await page.locator('#guestBrowseButton').click();
     await page.evaluate(()=>openProUpgrade());
     assert.equal(await page.locator('#proUpgradeModal').isVisible(),true);
     await page.evaluate(()=>closeProUpgrade());
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
     assert.equal(await page.evaluate(()=>sweep.writes.length),writesBeforeGuest,'guests must not write user data');
     // Sign-in loads only the selected account, and sign-out clears it before guest entry.
     await page.evaluate(async()=>{currentUser={id:'account-a',email:'test@example.test',user_metadata:{}};await onSignedIn();});
     assert.equal(await page.evaluate(()=>guestBrowsing),false);
     await page.evaluate(()=>signOut());await page.locator('#guestBrowseButton').click();
     assert.deepEqual(await page.evaluate(()=>({user:currentUser,holdings:holdings.length,activities:activities.length,pro:isProActive()})),{user:null,holdings:0,activities:0,pro:false});
     await page.evaluate(()=>requestAccountAccess());
    }
    assert.deepEqual(errors,[],name+JSON.stringify(viewport));
    await page.close();
    console.log('PASS guest browsing/account transition',name,viewport.width,viewport.height);
   }
   const page=await browser.newPage();
   await page.route('**/*',route=>route.fulfill({contentType:route.request().url().endsWith('/vendor/supabase.js')?'text/javascript':'text/html',body:route.request().url().endsWith('/vendor/supabase.js')?stub:html}));
   await page.goto('https://guest.test/');
   const result=await page.evaluate(async()=>{
    let resolve;let signedOut=0;
    supabaseClient.auth.getSession=()=>new Promise(r=>resolve=r);
    supabaseClient.auth.signOut=async()=>{signedOut++;return {error:null}};
    const restore=restoreSession();continueAsGuest();
    resolve({data:{session:{user:{id:'old-account'}}}});await restore;
    return {user:currentUser,guest:guestBrowsing,signedOut};
   });
   assert.deepEqual(result,{user:null,guest:true,signedOut:1});await page.close();
   console.log('PASS startup restoration race',name);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1)});
