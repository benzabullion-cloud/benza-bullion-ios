// Full bundled app, real DOM/CSS and functions; services mocked, never customer data.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('App/public/index.html','utf8');
const sweepBrowsers=[];let sweepDeadline;
const stub=`
window.sweep={tables:{holdings:[],transactions:[],price_alerts:[],portfolio_snapshots:[],user_entitlements:null,notification_preferences:null,live_chart_state:null},alerts:[],writes:[],removed:[],failRpc:false};
window.Capacitor={isNativePlatform:()=>true,Plugins:{BenzaSmartCamera:{reset:async()=>({})},BenzaNotifications:{status:async()=>({permission:'denied'})}}};
window.alert=message=>sweep.alerts.push(message);window.confirm=()=>true;
window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},
 from(table){const query={_from:0,_to:null,select(){return this},eq(){return this},gte(){return this},order(){return this},limit(){return this},range(from,to){this._from=from;this._to=to;return this},maybeSingle(){return this},insert(value){sweep.writes.push({table,value});return this},upsert(value){sweep.writes.push({table,value});return this},update(){return this},delete(){return this},then(resolve,reject){const rows=sweep.tables[table]??null;const data=Array.isArray(rows)&&this._to!==null?rows.slice(this._from,this._to+1):rows;return Promise.resolve({data,error:null}).then(resolve,reject)}};return query},
 rpc:async(name,args)=>{if(sweep.failRpc)throw Error('Network unavailable');sweep.writes.push({name,args});const row={id:args.p_holding_id||'sweep-holding',metal:args.p_metal,product:args.p_product,quantity:args.p_quantity,weight_oz:args.p_weight_oz,total_oz:args.p_quantity*args.p_weight_oz,cost_basis:args.p_cost_basis,purchase_date:args.p_purchase_date,bullion_year:args.p_year,purity:args.p_purity,mint:args.p_mint,scanner_photo_paths:args.p_paths};return {data:row,error:null}},
 storage:{from:()=>({remove:async paths=>{sweep.removed.push(...paths);return {error:null}},upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://sweep.test/photo.jpg'},error:null})})}
})};`;
(async()=>{
 sweepDeadline=setTimeout(()=>{console.error('Full-app sweep exceeded 120 seconds');process.exit(1)},120000);
 let states=0;
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  sweepBrowsers.push(browser);
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
  console.log('Loaded bundled app in '+engineName);
  await page.evaluate(()=>{currentUser={id:'account-a',email:'sweep@example.test',user_metadata:{}};document.getElementById('authScreen').style.display='none';});
  for(const width of [320,390,768])for(const theme of ['dark','light'])for(const pro of [false,true]){
   console.log('Check',engineName,width,theme,pro?'Pro':'Free');
   await page.setViewportSize({width,height:844});
   await page.evaluate(({theme,pro})=>{applyTheme(theme);benzaEntitlement={tier:pro?'pro':'free',status:pro?'active':'inactive'};updateProIntegratedUI();},{theme,pro});
   for(const open of ['goPortfolio','openAnalytics','openMarkets','openNews','openSettings','openManualAdd','openSmartCamera']){
    await page.evaluate(async name=>{closeAdd();closeAddChoice();closeSmartCamera();hideMainOverlays();await Promise.race([Promise.resolve(window[name]()),new Promise((_,reject)=>setTimeout(()=>reject(Error(name+' did not finish')),5000))]);},open);
    const metric=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,visible:[...document.querySelectorAll('.show')].map(n=>n.id).filter(Boolean)}));
    assert.equal(metric.overflow,false,JSON.stringify({engineName,width,theme,pro,open,metric}));
    states++;
   }
  }
  console.log('Check scanner assistant editor in '+engineName);
  for(const width of [320,390,768])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:844});
   await page.evaluate(async theme=>{
    document.documentElement.dataset.theme=theme;await openSmartCamera();
    renderSmartCameraAnalysis(interpretSmartCameraScan({text:'Fine silver',sides:2,confidence:.95}));openSmartScanEditor();
   },theme);
   await page.selectOption('#smartEditMetal','silver');await page.selectOption('#smartEditProduct','Canadian Silver Maple Leaf');
   await page.fill('#smartEditWeight','1');await page.fill('#smartEditYear','2024');await page.fill('#smartEditPurity','.9999');await page.fill('#smartEditMint','Royal Canadian Mint');
   const editState=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,disabled:document.getElementById('smartAnalysisUseButton').disabled}));
   assert.equal(editState.overflow,false,engineName+' scanner editor '+width+' '+theme);assert.equal(editState.disabled,true);
   await page.getByRole('button',{name:'Confirm changes',exact:true}).click();
   assert.equal(await page.locator('#smartAnalysisTitle').textContent(),'Your reviewed details');
   await page.getByRole('button',{name:'Use reviewed details',exact:true}).click();
   assert.equal(await page.locator('#product').inputValue(),'Canadian Silver Maple Leaf');assert.equal(await page.locator('#holdingYear').inputValue(),'2024');
   assert.equal(await page.locator('#holdingPurity').inputValue(),'.9999');assert.equal(await page.locator('#holdingMint').inputValue(),'Royal Canadian Mint');
  }
  console.log('Check reviewed scan through save and both photo attachments in '+engineName);
  const scanSave=await page.evaluate(async()=>{
   holdings=[];sweep.writes=[];
   closeAdd();await openSmartCamera();
   renderSmartCameraAnalysis(interpretSmartCameraScan({text:'CANADA .9995 FINE PALLADIUM 50 DOLLARS',sides:2,confidence:.95}));
   const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#999';ctx.fillRect(0,0,2,2);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
   smartCameraCapturedFiles=[new File([blob],'front.jpg',{type:'image/jpeg'}),new File([blob],'reverse.jpg',{type:'image/jpeg'})];
   openSmartScanEditor();document.getElementById('smartEditWeight').value='1';document.getElementById('smartEditYear').value='2024';
   if(!saveSmartScanReview())throw Error('Review failed');useSmartCameraAnalysis();
   qty.value='3';cost.value='65';update();
   const staged=pendingScannerPhotoFiles.length;await saveHolding();
   const h=holdings[0],write=sweep.writes.find(w=>w.name==='benza_add_holding_details');
   const photos=sweep.writes.find(w=>w.name==='benza_update_scanner_photos');
   const result={staged,product:h.product,metal:h.metal,oz:h.oz,cost:h.cost,year:h.year,mint:h.mint,photoPaths:h.scannerPhotoPaths.length,
    savedQuantity:write.args.p_quantity,savedWeight:write.args.p_weight_oz,savedCost:write.args.p_cost_basis,
    attachedPhotos:photos.args.p_paths.length,pending:pendingScannerPhotoFiles.length};
   holdings=[];return result;
  });
  assert.deepEqual(scanSave,{staged:2,product:'Canadian Palladium Maple Leaf',metal:'palladium',oz:3,cost:195,year:2024,mint:'Royal Canadian Mint',photoPaths:2,
   savedQuantity:3,savedWeight:1,savedCost:195,attachedPhotos:2,pending:0});
  console.log('Check purchase cost and analytics fixtures in '+engineName);
  const purchaseFixture=await page.evaluate(async()=>{
    closeSmartCamera();openManualAdd();selectMetal('silver');qty.value='3';weight.value='1';cost.value='65';update();
    const perPiece={total:purchaseTotalCost(cost.value,qty.value,'each'),summary:document.getElementById('purchaseCostSummary').textContent};
    document.getElementById('purchaseCostMode').value='total';changePurchaseCostMode();
    const totalMode={input:cost.value,total:purchaseTotalCost(cost.value,qty.value,'total')};
    document.getElementById('purchaseCostMode').value='each';changePurchaseCostMode();
    const eachAgain=cost.value;
    await saveHolding();
    const saved=holdings.at(-1).cost;
    holdings=[{id:'eagle',metal:'silver',product:'American Silver Eagle',qty:3,weight:1,oz:3,cost:195,costKnown:true,date:'2026-09-09'},
      {id:'round',metal:'silver',product:'Silver Round',qty:1,weight:1,oz:1,cost:65,costKnown:true,date:'2026-09-09'},
      {id:'maple',metal:'silver',product:'Canadian Silver Maple Leaf',qty:1,weight:1,oz:1,cost:65,costKnown:true,date:'2026-09-09'}];
    livePrices.silver=61.23;renderAnalytics();renderProAnalytics();
    const analytics={value:document.getElementById('anTotalValue').textContent,cost:document.getElementById('anCost').textContent,
      gain:document.getElementById('anTotalGain').textContent,avg:document.getElementById('anSilverAvg').textContent,
      ret:document.getElementById('anSilverReturn').textContent,largest:document.getElementById('anLargestShare').textContent,
      scenario:document.getElementById('anSensitivity').textContent,detail:proHoldingInsightHtml(holdings[0])};
    const recovery=proHoldingInsightHtml({...holdings[0],cost:225});
    holdings[0].costKnown=false;renderAnalytics();renderProAnalytics();
    const missing={cost:document.getElementById('anCost').textContent,ret:document.getElementById('anSilverReturn').textContent,detail:proHoldingInsightHtml(holdings[0])};
    const invalid=[purchaseTotalCost('',3,'each'),purchaseTotalCost('65',0,'each'),purchaseTotalCost('-1',3,'total')];
    const fractional=purchaseTotalCost('0.10',3,'each');
    holdings=[];return {perPiece,totalMode,eachAgain,saved,analytics,recovery,missing,invalid,fractional};
  });
  assert.equal(purchaseFixture.perPiece.total,195);assert.match(purchaseFixture.perPiece.summary,/195\.00.*total cost basis/);
  assert.equal(purchaseFixture.totalMode.input,'195');assert.equal(purchaseFixture.totalMode.total,195);
  assert.equal(purchaseFixture.eachAgain,'65');assert.equal(purchaseFixture.saved,195);
  assert.equal(purchaseFixture.analytics.value,'$306.15');assert.equal(purchaseFixture.analytics.cost,'$325.00');
  assert.equal(purchaseFixture.analytics.gain,'-$18.85 (-5.80%)');assert.equal(purchaseFixture.analytics.avg,'$65.00');
  assert.equal(purchaseFixture.analytics.ret,'-5.80%');assert.equal(purchaseFixture.analytics.largest,'60.0%');
  assert.match(purchaseFixture.analytics.scenario,/\$275\.54/);assert.match(purchaseFixture.analytics.scenario,/\$336\.77/);
  assert.match(purchaseFixture.recovery,/\+22\.49%/);assert.equal(purchaseFixture.missing.cost,'Unavailable');
  assert.equal(purchaseFixture.missing.ret,'—');assert.doesNotMatch(purchaseFixture.missing.detail,/0\.00%|NaN|Infinity/);
  assert.deepEqual(purchaseFixture.invalid,[null,null,null]);assert.equal(purchaseFixture.fractional,0.3);
  console.log('Check save and account flows in '+engineName);
  await page.evaluate(()=>{closeSmartCamera();openManualAdd();document.getElementById('cost').value='0';document.getElementById('holdingYear').value='';document.getElementById('holdingPurity').value='';document.getElementById('holdingMint').value='';});
  await page.evaluate(()=>saveHolding());
  assert.equal(await page.evaluate(()=>holdings.length),1,'Optional inventory fields may remain blank');
  assert.equal(await page.evaluate(()=>holdings[0].cost),0,'An optional purchase price may remain zero');
  await page.evaluate(()=>{openManualAdd();cost.value='65';sweep.failRpc=true;});await page.evaluate(()=>saveHolding());
  assert.equal(await page.locator('#holdingSaveBtn').isEnabled(),true,'Retry must remain available after a failed save');
  assert.ok(await page.evaluate(()=>sweep.alerts.includes('You appear to be offline. Reconnect and try again.')),'A thrown network error must show the offline recovery message');
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
   supabaseClient={from:()=>({select(){return this},order(){return this},range(){return this},then(resolve){callbacks.push(resolve)}})};
   const a=loadHoldingsFromSupabase(),b=loadActivityFromSupabase();
   await new Promise(resolve=>setTimeout(resolve,0));currentUser={id:'account-b'};holdings=[];activities=[];
   if(callbacks.length<2)throw Error('Delayed account query fixture was not initialized');
   callbacks.forEach(resolve=>resolve({data:[{id:'private-a',metal:'silver',product:'PRIVATE ACCOUNT A',quantity:1,weight_oz:1,total_oz:1}],error:null}));
   await Promise.race([Promise.all([a,b]),new Promise((_,reject)=>setTimeout(()=>reject(Error('Delayed account reads did not finish')),5000))]);supabaseClient=original;return {holdings:holdings.length,activities:activities.length};
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
 clearTimeout(sweepDeadline);
 console.log('PASS '+states+' full-app screen states in Chromium/WebKit; optional save, retry, account isolation, watchlist and sign-out');
})().catch(async e=>{clearTimeout(sweepDeadline);await Promise.allSettled(sweepBrowsers.map(browser=>browser.close()));console.error(e);process.exitCode=1});
