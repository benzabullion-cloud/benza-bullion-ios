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
  console.log('Check sale previews and quantity units in '+engineName);
  await page.evaluate(()=>{
   closeAdd();closeAddChoice();closeSmartCamera();hideMainOverlays();
   benzaEntitlement={tier:'pro',status:'active'};
   holdings=[{id:'sale-fixture',metal:'gold',product:'American Gold Eagle',qty:1,weight:1,oz:1,cost:4000,costKnown:true}];
   openSaleModal(0);
  });
  assert.equal(await page.locator('#saleCostPreview').textContent(),'—');
  await page.locator('#saleQuantity').fill('1');
  await page.locator('#saleProceeds').fill('4000');
  assert.equal(await page.locator('#saleCostPreview').textContent(),'$4,000.00');
  assert.equal(await page.locator('#saleGainPreview').textContent(),'+$0.00');
  assert.equal(await page.locator('#saleSaveBtn').isEnabled(),true);
  await page.locator('#saleQuantity').fill('0.5');
  await page.locator('#saleProceeds').fill('2500');
  assert.equal(await page.locator('#saleCostPreview').textContent(),'$2,000.00');
  assert.equal(await page.locator('#saleGainPreview').textContent(),'+$500.00');
  await page.locator('#saleProceeds').fill('0');
  assert.equal(await page.locator('#saleGainPreview').textContent(),'-$2,000.00');
  await page.locator('#saleQuantity').fill('5');
  assert.equal(await page.locator('#saleSaveBtn').isEnabled(),false);
  assert.match(await page.locator('#saleValidation').textContent(),/Only 1 piece available/);
  assert.equal(await page.locator('#saleGainPreview').textContent(),'—');
  await page.evaluate(()=>{holdings[0].cost=0;openSaleModal(0);});
  await page.locator('#saleQuantity').fill('1');
  await page.locator('#saleProceeds').fill('1000');
  assert.equal(await page.locator('#saleCostPreview').textContent(),'$0.00');
  assert.equal(await page.locator('#saleGainPreview').textContent(),'+$1,000.00');
  assert.match(await page.evaluate(()=>proHoldingInsightHtml(holdings[0])),/No cost to recover/);
  await page.evaluate(()=>{closeSaleModal();openManualAdd();selectMetal('copper');});
  assert.match(await page.locator('#holdingWeightLabel').textContent(),/avoirdupois oz/);
  await page.locator('#qty').fill('5');
  await page.locator('#weight').fill('1');
  assert.match(await page.locator('#holdingQuantityHint').textContent(),/Total entered: 5 avoirdupois oz/);
  await page.evaluate(()=>{selectMetal('gold');closeAdd();});
  assert.match(await page.locator('#holdingWeightLabel').textContent(),/troy oz/);
  console.log('Check sale date sizing, centering and correction sync in '+engineName);
  for(const viewport of [{width:320,height:844},{width:360,height:844},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const theme of ['dark','light'])for(const editing of [false,true]){
   await page.setViewportSize(viewport);
   await page.evaluate(({theme,editing})=>{
    applyTheme(theme);closeSaleModal();
    activities=[{id:'sale-date-fixture',type:'sell',holding_id:holdings[0].id,product:holdings[0].product,quantity:.5,weight_oz:1,cost_basis_removed:1000,sale_proceeds:2000,transaction_date:'2026-09-18'}];
    if(editing)openEditSaleModal('sale-date-fixture');else openSaleModal(0);
   },{theme,editing});
   if(editing)assert.match(await page.locator('#saleDateDisplay').textContent(),/18.*2026/);
   await page.locator('#saleDate').fill('2026-10-04');
   assert.match(await page.locator('#saleDateDisplay').textContent(),/2026/);
   const bounds=await page.evaluate(()=>{
    const field=document.querySelector('#saleModal .dateField').getBoundingClientRect(),input=document.getElementById('saleDate').getBoundingClientRect(),proceeds=document.getElementById('saleProceeds').getBoundingClientRect();
    const text=document.getElementById('saleDateDisplay').getBoundingClientRect(),sheet=document.querySelector('.saleSheet');
    return {height:field.height,aligned:Math.abs(field.left-proceeds.left)<1&&Math.abs(field.width-proceeds.width)<1,centered:Math.abs((text.left+text.right)-(field.left+field.right))<2&&Math.abs((text.top+text.bottom)-(field.top+field.bottom))<2,inputFits:input.width<=field.width&&input.height<=field.height,overflow:sheet.scrollWidth>sheet.clientWidth+1,themeMatches:getComputedStyle(document.querySelector('#saleModal .dateField')).backgroundColor===getComputedStyle(document.getElementById('saleProceeds')).backgroundColor,dialogCentered:Math.abs((sheet.getBoundingClientRect().top+sheet.getBoundingClientRect().bottom)-window.innerHeight)<2,backgroundLocked:getComputedStyle(document.body).position==='fixed'};
   });
   assert.equal(bounds.themeMatches,true,JSON.stringify({engineName,viewport,theme,editing,bounds}));assert.equal(bounds.dialogCentered,true);assert.equal(bounds.backgroundLocked,true);assert.equal(bounds.height,48);assert.equal(bounds.aligned,true);assert.equal(bounds.centered,true);assert.equal(bounds.inputFits,true);assert.equal(bounds.overflow,false,JSON.stringify({engineName,viewport,theme,editing,bounds}));
   if(viewport.height===390){
    await page.locator('.saleSheet').evaluate(el=>{el.scrollTop=0;});
    const background=await page.evaluate(()=>({x:window.scrollX,y:window.scrollY,top:document.body.getBoundingClientRect().top}));
    await page.locator('.saleSheet').hover();await page.mouse.wheel(0,500);await page.waitForTimeout(150);
    assert.ok(await page.locator('.saleSheet').evaluate(el=>el.scrollTop)>0,'Sale contents should scroll');
    assert.deepEqual(await page.evaluate(()=>({x:window.scrollX,y:window.scrollY,top:document.body.getBoundingClientRect().top})),background,'Background should stay still');
   }
   await page.locator('#saleDate').fill('');assert.equal(await page.locator('#saleDateDisplay').textContent(),'');
   await page.locator('#saleDate').fill('2026-10-04');
   if(viewport.width===390&&!editing){await page.locator('#saleDate').scrollIntoViewIfNeeded();await page.screenshot({path:'ui-artifacts/sale-date-'+engineName+'-'+theme+'.png'});}
  }
  await page.evaluate(()=>closeSaleModal());
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('sale-dialog-open')),false);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{closeSaleModal();applyTheme('dark');openManualAdd();});
  await page.locator('#date').fill('2027-02-03');
  assert.match(await page.locator('#dateDisplay').textContent(),/3.*2027/);
  await page.evaluate(()=>closeAdd());
  console.log('Check both native report entry points in '+engineName);
  await page.evaluate(()=>{
    closeAdd();hideMainOverlays();
    window.sweep.exports=[];
    window.Capacitor.Plugins.BenzaExport={shareFile:async data=>{sweep.exports.push(data);return {completed:true};}};
    openSettings('pro');
  });
  await page.locator('#settingsProReportButton').click();
  await page.waitForFunction(()=>!proReportExportBusy);
  assert.equal(await page.evaluate(()=>sweep.exports.length),1);
  assert.match(await page.evaluate(()=>sweep.exports[0].text),/Metal allocation/);
  assert.match(await page.locator('#settingsProPanel .reportExportStatus').textContent(),/shared or saved/);
  await page.evaluate(()=>{hideMainOverlays();openAnalytics();setAnalyticsTab('pro');});
  await page.locator('#proExportReportButton').scrollIntoViewIfNeeded();
  await page.locator('#proExportReportButton').click();
  await page.waitForFunction(()=>!proReportExportBusy);
  assert.equal(await page.evaluate(()=>sweep.exports.length),2);
  await page.evaluate(()=>{window.Capacitor.Plugins.BenzaExport.shareFile=async()=>({completed:false});});
  await page.locator('#proExportReportButton').click();
  await page.waitForFunction(()=>!proReportExportBusy);
  assert.match(await page.locator('#analyticsScreen .reportExportStatus').textContent(),/cancelled/);
  await page.evaluate(()=>{window.Capacitor.Plugins.BenzaExport.shareFile=async()=>{throw Error('Export unavailable');};});
  await page.locator('#proExportReportButton').click();
  await page.waitForFunction(()=>!proReportExportBusy);
  assert.match(await page.locator('#analyticsScreen .reportExportStatus').textContent(),/Export unavailable/);
  assert.equal(await page.locator('#proExportReportButton').isDisabled(),false);
  await page.evaluate(()=>{window.Capacitor=null;});
  const download=page.waitForEvent('download');
  await page.locator('#proExportReportButton').click();
  assert.equal((await download).suggestedFilename(),'Benza_Bullion_Pro_Portfolio_Report.csv');
  await page.evaluate(()=>{hideMainOverlays();goPortfolio();window.Capacitor={isNativePlatform:()=>true,Plugins:{}};});
  console.log('Check native account-data export in '+engineName);
  await page.evaluate(()=>{
    hideMainOverlays();openSettings('settings');
    window.Capacitor.Plugins.BenzaExport={shareFile:async data=>{sweep.exports.push(data);return {completed:true};}};
  });
  await page.locator('#exportDataButton').click();
  await page.waitForFunction(()=>!document.getElementById('exportDataButton').disabled);
  assert.match(await page.evaluate(()=>sweep.exports.at(-1).filename),/\.json$/);
  assert.equal(await page.evaluate(()=>JSON.parse(sweep.exports.at(-1).text).account.id),'account-a');
  await page.evaluate(()=>{window.Capacitor.Plugins.BenzaExport.shareFile=async()=>({completed:false});});
  await page.locator('#exportDataButton').click();
  await page.waitForFunction(()=>!document.getElementById('exportDataButton').disabled);
  assert.match(await page.locator('#accountSettingsStatus').textContent(),/cancelled/);
  console.log('Check default and personalized account names in '+engineName);
  await page.evaluate(()=>{hideMainOverlays();goPortfolio();});
  await page.evaluate(()=>{currentUser.user_metadata={};updateWelcomeBack();populateAccountSettings();});
  assert.equal(await page.locator('#welcomeBack').textContent(),'Welcome back, Bullion Builder');
  assert.equal(await page.locator('#accountName').inputValue(),'Bullion Builder');
  assert.equal(await page.locator('#accountNameHint').isVisible(),false);
  await page.evaluate(()=>openSettings());
  assert.equal(await page.locator('#accountNameHint').isVisible(),true);
  await page.evaluate(async()=>{
    supabaseClient.auth.updateUser=async attrs=>({data:{user:{...currentUser,user_metadata:attrs.data}},error:null});
    document.getElementById('accountName').value='Gabriel';await saveAccountProfile();
  });
  assert.equal(await page.locator('#welcomeBack').textContent(),'Welcome back, Gabriel');
  await page.evaluate(()=>{hideMainOverlays();currentUser.user_metadata={name:'',full_name:'Existing Name'};updateWelcomeBack();});
  assert.equal(await page.locator('#welcomeBack').textContent(),'Welcome back, Existing Name');
  await page.evaluate(async()=>{
    const signupClient=supabaseClient,createClient=window.supabase.createClient;window.supabase.createClient=()=>signupClient;
    supabaseClient.auth.signUp=async attrs=>{sweep.signup=attrs;return {data:{session:null,user:null},error:null};};
    document.getElementById('authEmail').value='new@example.test';document.getElementById('authPassword').value='test-password';
    setAuthMode('signup');await handleAuth();setAuthMode('login');window.supabase.createClient=createClient;
  });
  assert.equal(await page.evaluate(()=>sweep.signup.options.data.name),'Bullion Builder');
  console.log('Check password field controls in '+engineName);
  await page.evaluate(()=>{document.getElementById('authScreen').style.display='flex';});
  await page.locator('#authPassword').fill('example-password');
  await page.locator('#authPasswordVisibility').click();
  assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
  assert.equal(await page.locator('#authPasswordVisibility').getAttribute('aria-label'),'Hide password');
  await page.locator('#authPasswordVisibility').click();
  assert.equal(await page.locator('#authPassword').getAttribute('type'),'password');
  await page.locator('#authPasswordClear').click();
  assert.equal(await page.locator('#authPassword').inputValue(),'');
  await page.evaluate(()=>{document.getElementById('authScreen').style.display='none';});
  console.log('Check localized Pro plans and trial eligibility in '+engineName);
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(async()=>{
    closeSmartCamera();closeAdd();hideMainOverlays();
    window.Capacitor={isNativePlatform:()=>true,Plugins:{BenzaStoreKit:{getProducts:async()=>({products:[
     {productId:'benza_pro_monthly',displayPrice:'€5,99'},
     {productId:'benza_pro_annual',displayPrice:'€44,99',trialValue:7,trialUnit:'day'},
     {productId:'benza_pro_founder_lifetime',displayPrice:'€29,99'}
    ]})}}};
    benzaEntitlement={tier:'free',status:'inactive'};openProUpgrade('settings');await refreshStoreKitProducts();selectProPlan('monthly');
   });
   assert.equal(await page.locator('#proPlanMonthly strong').textContent(),'€5,99/month');
   assert.doesNotMatch(await page.locator('#proPlanMonthly').textContent(),/free trial/);
   assert.equal(await page.locator('#proStartTrialBtn').textContent(),'Subscribe');
   await page.evaluate(()=>selectProPlan('annual'));
   assert.match(await page.locator('#proStartTrialBtn').textContent(),/7-day free trial/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.evaluate(async()=>{
    nativeStoreKitPlugin().getProducts=async()=>{throw Error('Offline')};await refreshStoreKitProducts();
   });
   assert.equal(await page.locator('#proStartTrialBtn').isDisabled(),true);
   await page.evaluate(()=>{closeProUpgrade();window.Capacitor=null;benzaEntitlement={tier:'pro',status:'active'};updateProIntegratedUI();});
  }
  console.log('Check compact market status in '+engineName);
  for(const width of [320,390,768])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:844});
   await page.evaluate(theme=>{
    closeSmartCamera();hideMainOverlays();goPortfolio();applyTheme(theme);
    renderLiveFeedStatus({fetched_at:'2026-10-02T21:00:00Z'},{date:new Date('2026-10-02T23:10:00Z')});
   },theme);
   assert.equal(await page.locator('#marketPauseNote').isVisible(),true);
   assert.match(await page.locator('#marketPauseNote').textContent(),/Weekend.*Expected.*CT/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const style=await page.locator('#marketRefreshButton').evaluate(el=>({background:getComputedStyle(el).backgroundColor,width:el.getBoundingClientRect().width}));
   assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.width,32);
   await page.evaluate(()=>renderLiveFeedStatus({fetched_at:'2026-10-05T18:00:00Z'},{date:new Date('2026-10-05T18:00:00Z')}));
   assert.equal(await page.locator('#marketPauseNote').isVisible(),false);
  }
  await page.locator('#marketRefreshButton').click();
  await page.waitForFunction(()=>!document.getElementById('marketRefreshButton').disabled);
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
   await page.evaluate(async()=>{closeAdd();await openSmartCamera();renderSmartCameraAnalysis(interpretSmartCameraScan({text:'Fine silver',sides:2,confidence:.95}));});
   assert.equal(await page.locator('#smartScanFeedback').isVisible(),false);
   const hierarchy=await page.evaluate(()=>({linkSize:parseFloat(getComputedStyle(document.getElementById('smartScanFeedbackLink')).fontSize),
    actionSize:parseFloat(getComputedStyle(document.getElementById('smartCameraProButton')).fontSize),linkBackground:getComputedStyle(document.getElementById('smartScanFeedbackLink')).backgroundColor}));
   assert.ok(hierarchy.linkSize<hierarchy.actionSize);assert.equal(hierarchy.linkBackground,'rgba(0, 0, 0, 0)');
   await page.getByRole('button',{name:'Report a scan issue',exact:true}).click();
   await page.selectOption('#smartFeedbackIssue',{label:'Missing details'});await page.fill('#smartFeedbackCorrection','Silver Maple, 1 troy oz');
   await page.getByRole('button',{name:'Preview report',exact:true}).click();
   assert.match(await page.locator('#smartFeedbackReport').inputValue(),/Silver Maple, 1 troy oz/);
   assert.match(await page.locator('#smartFeedbackEmail').getAttribute('href'),/^mailto:benzabullion@gmail.com\?/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Feedback overflow '+engineName+' '+width+' '+theme);
   await page.getByRole('button',{name:'Reset scan',exact:true}).click();
   await page.waitForFunction(()=>!smartCameraScanning);assert.equal(await page.locator('#smartScanFeedback').isVisible(),false);
  }
  console.log('Check reviewed scan through save and both photo attachments in '+engineName);
  await page.evaluate(async()=>{
   closeAdd();await openSmartCamera();
   renderSmartCameraAnalysis(interpretSmartCameraScan({text:'American Silver Eagle 1 OZ FINE SILVER',sides:2,confidence:.95}));
   openSmartScanEditor();smartCameraCapturedFiles=[{name:'front.jpg'},{name:'back.jpg'}];
  });
  await page.getByRole('button',{name:'Reset scan',exact:true}).click();
  await page.waitForFunction(()=>!smartCameraScanning&&pendingSmartCameraSuggestion===null);
  const resetState=await page.evaluate(()=>({open:document.getElementById('smartCameraScreen').classList.contains('show'),
   files:smartCameraCapturedFiles.length,editorHidden:document.getElementById('smartScanEditor').hidden,
   scan:document.getElementById('smartCameraProButton').textContent,badge:document.querySelector('.smartCameraEyebrow').textContent,
   overflow:document.documentElement.scrollWidth>innerWidth+1}));
  assert.deepEqual(resetState,{open:true,files:0,editorHidden:true,scan:'Scan Bullion',badge:'BULLION SCAN ASSIST - BETA',overflow:false});
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
   supabaseClient.rpc=async(name,args)=>name==='benza_queue_file_cleanup'?rpc(name,args):({data:null,error:null});
   const result=await finishScannerPhotoUploads('sweep-holding',[new File(['fixture'],'coin.dat',{type:'application/octet-stream'})]);
   supabaseClient.rpc=rpc;
   return {paths:result.length,queued:sweep.writes.filter(x=>x.name==='benza_queue_file_cleanup').length,warning:sweep.alerts.at(-1)};
  });
  assert.equal(uploadFailure.paths,0);assert.ok(uploadFailure.queued>=1);assert.match(uploadFailure.warning,/could not be attached/);
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
