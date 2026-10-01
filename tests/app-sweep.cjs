// Full bundled app, real DOM/CSS and functions; services mocked, never customer data.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('App/public/index.html','utf8');
const stub=`
window.sweep={tables:{holdings:[],transactions:[],price_alerts:[],portfolio_snapshots:[],user_entitlements:null,notification_preferences:null,live_chart_state:null},alerts:[],writes:[],removed:[],failRpc:false};
window.Capacitor={isNativePlatform:()=>true,Plugins:{BenzaSmartCamera:{reset:async()=>({})},BenzaNotifications:{status:async()=>({permission:'denied'})}}};
window.alert=message=>sweep.alerts.push(message);window.confirm=()=>true;
window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},
 from(table){const query={select(){return this},eq(){return this},gte(){return this},order(){return this},limit(){return this},maybeSingle(){return this},insert(value){sweep.writes.push({table,value});return this},upsert(value){sweep.writes.push({table,value});return this},update(){return this},delete(){return this},then(resolve,reject){return Promise.resolve({data:sweep.tables[table]??null,error:null}).then(resolve,reject)}};return query},
 rpc:async(name,args)=>{if(sweep.failRpc)throw Error('Network unavailable');sweep.writes.push({name,args});const row={id:args.p_holding_id||'sweep-holding',metal:args.p_metal,product:args.p_product,quantity:args.p_quantity,weight_oz:args.p_weight_oz,total_oz:args.p_quantity*args.p_weight_oz,cost_basis:args.p_cost_basis,purchase_date:args.p_purchase_date};return {data:row,error:null}},
 storage:{from:()=>({remove:async paths=>{sweep.removed.push(...paths);return {error:null}},upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://sweep.test/photo.jpg'},error:null})})}
})};`;
(async()=>{
 let states=0;
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(url==='https://sweep.test/')return route.fulfill({contentType:'text/html',body:html});
   if(url.endsWith('/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:stub});
   if(url.includes('benza-market-prices'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,prices:{gold:4000,silver:50,platinum:1500,palladium:1400,copper:.3},fetched_at:new Date().toISOString()})});
   if(url.includes('rss2json'))return route.fulfill({contentType:'application/json',body:'{"status":"ok","items":[]}'});
   return route.fulfill({status:200,contentType:'text/plain',body:''});
  });
  await page.goto('https://sweep.test/');
  await page.evaluate(()=>{currentUser={id:'account-a',email:'sweep@example.test',user_metadata:{}};document.getElementById('authScreen').style.display='none';});
  for(const width of [320,390,768])for(const theme of ['dark','light'])for(const pro of [false,true]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(({theme,pro})=>{applyTheme(theme);benzaEntitlement={tier:pro?'pro':'free',status:pro?'active':'inactive'};updateProIntegratedUI();},{theme,pro});
   for(const open of ['goPortfolio','openAnalytics','openMarkets','openNews','openSettings','openManualAdd','openSmartCamera']){
    await page.evaluate(async name=>{closeAdd();closeAddChoice();closeSmartCamera();hideMainOverlays();await window[name]();},open);
    const metric=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,visible:[...document.querySelectorAll('.show')].map(n=>n.id).filter(Boolean)}));
    assert.equal(metric.overflow,false,JSON.stringify({engineName,width,theme,pro,open,metric}));
    states++;
   }
  }
  await page.evaluate(()=>{closeSmartCamera();openManualAdd();document.getElementById('cost').value='0';document.getElementById('holdingYear').value='';document.getElementById('holdingPurity').value='';document.getElementById('holdingMint').value='';});
  await page.evaluate(()=>saveHolding());
  assert.equal(await page.evaluate(()=>holdings.length),1,'Optional inventory fields may remain blank');
  assert.equal(await page.evaluate(()=>holdings[0].cost),0,'An optional purchase price may remain zero');
  await page.evaluate(()=>{openManualAdd();sweep.failRpc=true;});await page.evaluate(()=>saveHolding());
  assert.equal(await page.locator('#holdingSaveBtn').isEnabled(),true,'Retry must remain available after a failed save');
  assert.ok(await page.evaluate(()=>sweep.alerts.some(message=>/Network|save/i.test(message))),'A thrown network error must be visible');
  assert.equal(await page.evaluate(()=>holdings.length),1,'Failed save cannot invent a holding');
  await page.evaluate(()=>{sweep.failRpc=false;});
  const uploadFailure=await page.evaluate(async()=>{
   const rpc=supabaseClient.rpc;
   supabaseClient.rpc=async()=>({data:null,error:null});
   const result=await finishScannerPhotoUploads('sweep-holding',[new File(['fixture'],'coin.dat',{type:'application/octet-stream'})]);
   supabaseClient.rpc=rpc;
   return {paths:result.length,removed:sweep.removed.length,warning:sweep.alerts.at(-1)};
  });
  assert.equal(uploadFailure.paths,0);assert.equal(uploadFailure.removed,1);assert.match(uploadFailure.warning,/could not be attached/);
  // Reproduce delayed responses from account A after B signs in.
  const stale=await page.evaluate(async()=>{
   const original=supabaseClient;const callbacks=[];
   supabaseClient={from:()=>({select(){return this},order(){return this},then(resolve){callbacks.push(resolve)}})};
   const a=loadHoldingsFromSupabase(),b=loadActivityFromSupabase();
   await Promise.resolve();currentUser={id:'account-b'};holdings=[];activities=[];
   callbacks.forEach(resolve=>resolve({data:[{id:'private-a',metal:'silver',product:'PRIVATE ACCOUNT A',quantity:1,weight_oz:1,total_oz:1}],error:null}));
   await Promise.all([a,b]);supabaseClient=original;return {holdings:holdings.length,activities:activities.length};
  });assert.deepEqual(stale,{holdings:0,activities:0});
  await page.evaluate(()=>{localStorage.setItem('benzaWatchlist',JSON.stringify([{metal:'gold',target:9999}]));localStorage.setItem('benzaWatchlist:account-a',JSON.stringify([{metal:'silver',target:100}]));sweep.tables.price_alerts=[];});
  await page.evaluate(()=>loadBenzaWatchlist());
  assert.equal(await page.evaluate(()=>benzaWatchlist.length),0,'Account B cannot import A or anonymous cache');
  assert.equal(await page.evaluate(()=>sweep.writes.filter(x=>x.table==='price_alerts').length),0,'Loading cannot recreate deleted alerts');
  await page.evaluate(()=>{benzaWatchlist=[{metal:'gold',target:100}];persistBenzaWatchlist();openSettings();openManualAdd();});
  await page.evaluate(()=>signOut());
  const cleared=await page.evaluate(()=>({user:currentUser,pro:isProActive(),holdings:holdings.length,watchlist:benzaWatchlist.length,scannerFiles:pendingScannerPhotoFiles.length,overlays:[...document.querySelectorAll('#addScreen.show,#settingsScreen.show,#smartCameraScreen.show,#proUpgradeModal.show')].length}));
  assert.deepEqual(cleared,{user:null,pro:false,holdings:0,watchlist:0,scannerFiles:0,overlays:0});
  assert.deepEqual(errors,[],engineName+' runtime errors');
  await browser.close();
 }
 console.log('PASS '+states+' full-app screen states in Chromium/WebKit; optional save, retry, account isolation, watchlist and sign-out');
})().catch(e=>{console.error(e);process.exitCode=1});
