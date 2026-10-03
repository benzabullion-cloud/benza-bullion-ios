const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('App/public/index.html','utf8');
const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'old',disabled:false,textContent:'',options:[],selectedIndex:0,classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)},contains(v){return this.values.has(v)}},setAttribute(){}});return nodes.get(id)};
let queued=[],calls=[],resetCalls=0,resetOptions=[],resetHook=async()=>{};const plugin={reset:async options=>{resetCalls++;resetOptions.push(options||{});await resetHook();},scan:async options=>{calls.push(options);return await queued.shift()}};
const context=vm.createContext({Date,console,document:{getElementById:get,querySelectorAll:()=>[get('smartAnalysisUseButton')]},
  isProActive:()=>true,isBenzaNativeRuntime:()=>true,smartCameraPlugin:()=>plugin,ensureGlobalAddPortals(){},closeAddChoice(){},isFounderPro:()=>false,openAdd(){},selectMetal(){},update(){},fillBullionDetails(){},previewPendingScannerPhotos(){}});
vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('const METAL_SYMBOLS='))+html.slice(html.indexOf('let pendingSmartCameraSuggestion='),html.indexOf('function clearAttachmentObjectUrls')),context);
vm.runInContext('renderSmartCameraAnalysis=(suggestion)=>{pendingSmartCameraSuggestion=suggestion;globalThis.lastSuggestion=suggestion;}',context);
const reset=()=>vm.runInContext('smartCameraScans=[];smartCameraPhotoCount=0;pendingSmartCameraSuggestion=null;',context);
const pending=()=>vm.runInContext('pendingSmartCameraSuggestion',context);
const views=()=>vm.runInContext('smartCameraScans.length',context);
context.previewPendingScannerPhotos=()=>{};
let count=0;async function test(name,fn){await fn();count++;console.log('PASS',name)}
(async()=>{
 await test('Reverse merges same-item year and markings',async()=>{queued.push({text:'LIBERTY 2011',confidence:.9},{text:'UNITED STATES OF AMERICA 1 OZ FINE SILVER ONE DOLLAR',confidence:.9});await context.runSmartCameraScan();await context.runSmartCameraScan(true);assert.equal(context.lastSuggestion.year,2011);assert.equal(context.lastSuggestion.product,'American Silver Eagle');assert.equal(context.lastSuggestion.sides,2)});
 await test('New item does not inherit prior date or metal',async()=>{queued.push({text:'Fine gold 10 g',confidence:.9});await context.runSmartCameraScan();assert.equal(context.lastSuggestion.metal,'gold');assert.equal(context.lastSuggestion.year,null);assert.equal(context.lastSuggestion.sides,1)});
 await test('Cancellation retains previous result',async()=>{const before=context.lastSuggestion;queued.push({cancelled:true});await context.runSmartCameraScan(true);assert.equal(context.lastSuggestion,before);assert.equal(pending(),before)});
 await test('Library option reaches native photo picker',async()=>{queued.push({text:'argent pur 1 oz',confidence:.9});await context.runSmartCameraScan(false,'library');assert.equal(calls.at(-1).source,'library')});
 await test('Double tap calls native only once',async()=>{let done;queued.push(new Promise(resolve=>done=resolve));const first=context.runSmartCameraScan();await new Promise(resolve=>setImmediate(resolve));const n=calls.length;await context.runSmartCameraScan();assert.equal(calls.length,n);assert.equal(get('smartAnalysisUseButton').disabled,true);done({text:'Fine silver',confidence:.9});await first});
 await test('Closing prevents late result from being applied',async()=>{let done;const before=context.lastSuggestion;queued.push(new Promise(resolve=>done=resolve));const first=context.runSmartCameraScan();await new Promise(resolve=>setImmediate(resolve));context.closeSmartCamera();done({text:'Fine gold',confidence:.9});await first;assert.equal(context.lastSuggestion,before)});
 await test('Metal-only scan opens review with missing fields blank',async()=>{get('weight').value='1';get('product').selectedIndex=0;const scan=context.interpretSmartCameraScan({text:'Fine silver',confidence:.9});assert.equal(context.canUseSmartCameraSuggestion(scan),false);assert.equal(context.applySmartCameraSuggestion(scan),true);assert.equal(get('weight').value,'');assert.equal(get('product').selectedIndex,-1);assert.match(get('holdingDetailsHint').textContent,/Partial scan/)});
 await test('Unsupported suggestion cannot open or fill form',async()=>{get('weight').value='sentinel';assert.equal(context.applySmartCameraSuggestion(context.interpretSmartCameraScan({text:'',visualColor:{tone:'golden'}})),false);assert.equal(get('weight').value,'sentinel')});
 await test('Reverse metal contradiction blocks suggestion',async()=>{reset();queued.push({text:'Fine silver',confidence:.9},{text:'Fine gold',confidence:.9});await context.runSmartCameraScan();await context.runSmartCameraScan(true);assert.equal(context.lastSuggestion.usable,false);assert.equal(get('smartAnalysisUseButton').disabled,true)});

 await test('New item clears existing details before camera opens',async()=>{queued.push({text:'fine silver 2011 1 oz',confidence:.9});await context.runSmartCameraScan();let done;queued.push(new Promise(resolve=>done=resolve));const next=context.runSmartCameraScan();assert.equal(pending(),null);assert.equal(views(),0);await new Promise(resolve=>setImmediate(resolve));done({cancelled:true});await next;assert.equal(pending(),null);assert.equal(get('smartAnalysisUseButton').disabled,true)});
 await test('Failed fresh scan cannot resurrect old suggestion',async()=>{queued.push({text:'fine gold 1 oz',confidence:.9});await context.runSmartCameraScan();const oldConsole=context.console;context.console={...console,error(){}};queued.push(Promise.reject(Error('Camera failure')));await context.runSmartCameraScan();context.console=oldConsole;assert.equal(pending(),null);assert.equal(views(),0);assert.equal(get('smartAnalysisUseButton').disabled,true)});
 await test('Blank reverse does not stack or reduce evidence',async()=>{queued.push({text:'fine silver 1 oz .999',confidence:.95});await context.runSmartCameraScan();const before=pending();queued.push({lines:[],confidence:0});await context.runSmartCameraScan(true);assert.equal(pending().metal,before.metal);assert.equal(pending().weight,before.weight);assert.equal(views(),1);assert.equal(get('smartAnalysisUseButton').disabled,false)});
 await test('Noise-only reverse is ignored',async()=>{queued.push({text:'fine silver 1 oz .999',confidence:.95});await context.runSmartCameraScan();const before=pending();queued.push({text:'art textile',confidence:.1});await context.runSmartCameraScan(true);assert.equal(pending().metal,before.metal);assert.equal(pending().weight,before.weight);assert.equal(views(),1)});
 await test('Lower confidence detail cannot reduce prior good evidence',async()=>{queued.push({text:'fine silver 1 oz .999',confidence:.95});await context.runSmartCameraScan();const before=pending().confidence;queued.push({text:'2011',confidence:.25});await context.runSmartCameraScan(true);assert.ok(pending().confidence>=before)});
 await test('Two-side limit preserves the first side',async()=>{queued.push({text:'2011',confidence:.9},{text:'Fine silver 1 oz',confidence:.9});await context.runSmartCameraScan();await context.runSmartCameraScan(true);const n=calls.length;await context.runSmartCameraScan(true);assert.equal(calls.length,n);assert.equal(views(),2);assert.equal(pending().year,2011)});
 await test('Explicit reset clears results and calls native reset',async()=>{const n=resetCalls;await context.resetSmartCameraScan();assert.equal(resetCalls,n+1);assert.equal(pending(),null);assert.equal(views(),0);assert.equal(get('smartAnalysisUseButton').disabled,true)});
 await test('Visible reset action clears both photos and editor while keeping scanner open',async()=>{
  assert.match(html,/<div class="smartCameraEyebrow">BULLION SCAN ASSIST - BETA<\/div>/);
  assert.match(html,/<button id="smartCameraResetButton"[^>]*data-scan-control[^>]*onclick="resetSmartCameraScan\(\)"[^>]*>Reset scan<\/button>/);
  get('smartCameraScreen').classList.add('show');get('smartScanEditor').hidden=false;
  vm.runInContext('smartCameraCapturedFiles=[{name:"front.jpg"},{name:"reverse.jpg"}];smartCameraPhotoCount=2;smartCameraAwaitingReverse=true;smartCameraLastDiagnostic={engineVersion:5}',context);
  const callsBefore=calls.length;await context.resetSmartCameraScan();
  assert.equal(get('smartCameraScreen').classList.contains('show'),true);assert.equal(calls.length,callsBefore);
  assert.equal(vm.runInContext('smartCameraCapturedFiles.length+smartCameraPhotoCount',context),0);
  assert.equal(vm.runInContext('smartCameraLastDiagnostic',context),null);assert.equal(get('smartScanEditor').hidden,true);
  assert.equal(get('smartCameraProButton').textContent,'Scan Bullion');assert.equal(get('smartCameraLibraryButton').textContent,'Choose Bullion Photo');
  assert.equal(get('smartCameraResetButton').disabled,false);assert.equal(get('smartCameraStatus').textContent,'Ready for a new item.');
 });
 await test('Closing Smart Camera releases cached model runtime',async()=>{context.closeSmartCamera();await new Promise(resolve=>setImmediate(resolve));assert.equal(resetOptions.at(-1).releaseModels,true)});
 await test('Reset waits for native cleanup before enabling a new scan',async()=>{let done;resetHook=()=>new Promise(resolve=>done=resolve);const reset=context.resetSmartCameraScan();const n=calls.length;await context.runSmartCameraScan();assert.equal(calls.length,n);assert.equal(get('smartCameraProButton').disabled,true);done();await reset;resetHook=async()=>{};assert.equal(get('smartCameraProButton').disabled,false)});
 await test('Abandoned callback cannot unlock a newer operation',async()=>{let oldDone;queued.push(new Promise(resolve=>oldDone=resolve));const oldScan=context.runSmartCameraScan();await new Promise(resolve=>setImmediate(resolve));await context.resetSmartCameraScan();let newDone;queued.push(new Promise(resolve=>newDone=resolve));const newScan=context.runSmartCameraScan();await new Promise(resolve=>setImmediate(resolve));oldDone({text:'Fine gold',confidence:.9});await oldScan;assert.equal(get('smartCameraProButton').disabled,true);assert.equal(pending(),null);newDone({text:'Fine silver',confidence:.9});await newScan;assert.equal(pending().metal,'silver');assert.equal(get('smartCameraProButton').disabled,false)});
 await test('Twenty consecutive new items never mix evidence',async()=>{for(let i=0;i<20;i++){const metal=i%2?'gold':'silver';queued.push({text:'Fine '+metal+' 1 oz '+(i%2?'2020':'2011'),confidence:.9});await context.runSmartCameraScan();assert.equal(pending().metal,metal);assert.equal(pending().year,i%2?2020:2011);assert.equal(views(),1)}});
 await test('Unmarked front asks for the reverse without inventing evidence',async()=>{queued.push({lines:[],confidence:0});await context.runSmartCameraScan();assert.equal(views(),0);assert.equal(pending().sides,1);assert.equal(pending().usable,false)});
 await test('Unmarked front plus readable reverse counts as two photos',async()=>{queued.push({text:'fine silver 1 oz',confidence:.9});await context.runSmartCameraScan(true);assert.equal(pending().sides,2);assert.equal(views(),1)});
 await test('Two blank photos stop reverse retries',async()=>{queued.push({lines:[]},{lines:[]});await context.runSmartCameraScan();await context.runSmartCameraScan(true);assert.equal(vm.runInContext('smartCameraAwaitingReverse',context),false);const n=calls.length;await context.runSmartCameraScan(true);assert.equal(calls.length,n);assert.equal(views(),0);assert.equal(pending().sides,2)});
 await test('Reset failure does not report success or retain evidence',async()=>{resetHook=async()=>{throw Error('Reset failed')};assert.equal(await context.resetSmartCameraScan(true),false);resetHook=async()=>{};assert.equal(pending(),null);assert.equal(views(),0);assert.equal(get('smartCameraStatus').textContent,'Please close and reopen the scanner.')});
 await test('Opening after failed reset never opens camera',async()=>{resetHook=async()=>{throw Error('Reset failed')};const n=calls.length;await context.openSmartCamera();resetHook=async()=>{};assert.equal(calls.length,n)});
 await test('Opening Smart Camera shows choices without opening native capture',async()=>{const n=calls.length;await context.openSmartCamera();assert.equal(calls.length,n);assert.equal(get('smartCameraScreen').classList.contains('show'),true)});
 await test('Reopening while an older reset finishes still never auto-opens capture',async()=>{let done;let first=true;resetHook=async()=>{if(first){first=false;await new Promise(resolve=>done=resolve)}};const n=calls.length;const oldOpen=context.openSmartCamera();await new Promise(resolve=>setImmediate(resolve));context.closeSmartCamera();await context.openSmartCamera();done();await oldOpen;resetHook=async()=>{};assert.equal(calls.length,n)});
 await test('Blank OCR artwork front survives reverse markings',async()=>{reset();queued.push({lines:[],confidence:0,designSuggestion:{id:'american_eagle',source:'local-catalogue-v1'}},{text:'FINE SILVER ONE DOLLAR',confidence:.95});await context.runSmartCameraScan();assert.equal(views(),1);assert.equal(pending().weight,0);await context.runSmartCameraScan(true);assert.equal(views(),2);assert.equal(pending().product,'American Silver Eagle');assert.equal(pending().weight,1);assert.equal(pending().inferredWeight,true)});
 await test('New item clears prior artwork identity',async()=>{queued.push({text:'FINE SILVER',confidence:.95});await context.runSmartCameraScan();assert.equal(pending().product,'');assert.equal(pending().weight,0)});
 await test('Different artwork across two sides blocks holding',async()=>{queued.push({text:'FINE SILVER',confidence:.95,designSuggestion:{id:'american_eagle',source:'local-catalogue-v1'}},{text:'CANADA FINE SILVER 1 OZ',confidence:.95,designSuggestion:{id:'canadian_maple_leaf',source:'local-catalogue-v1'}});await context.runSmartCameraScan();await context.runSmartCameraScan(true);assert.ok(pending().warnings.length);assert.equal(context.applySmartCameraSuggestion(pending()),false)});
 await test('Scan button opens camera after a library scan',async()=>{queued.push({text:'Fine silver',confidence:.9});await context.runSmartCameraScan(false,'library');queued.push({cancelled:true});context.handleSmartCameraProAction();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1).source,'camera')});
 await test('Scan button captures reverse with camera after library front',async()=>{queued.push({lines:[]});await context.runSmartCameraScan(false,'library');vm.runInContext('smartCameraAwaitingReverse=true',context);queued.push({cancelled:true});context.handleSmartCameraProAction();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1).source,'camera');assert.equal(vm.runInContext('smartCameraPhotoCount',context),1)});
 await test('Reopening clears previous library capture preference',async()=>{vm.runInContext("smartCameraSource='library'",context);await context.openSmartCamera();assert.equal(vm.runInContext('smartCameraSource',context),'camera')});
 await test('Missing model asset status remains visible in diagnostics',async()=>{queued.push({text:'Fine silver',confidence:.9,designStatus:'asset-pack-unavailable'});await context.runSmartCameraScan();assert.equal(vm.runInContext('smartCameraLastDiagnostic.designStatus',context),'asset-pack-unavailable')});
 await test('Readable two-side OCR skips expensive design refinement',async()=>{
   let refinements=0;plugin.refine=async()=>{refinements++;throw Error('Should not run')};
   queued.push({text:'CANADA 9999 FINE SILVER 1 OZ ARGENT PUR',confidence:.95},{text:'ELIZABETH II 5 DOLLARS 2022',confidence:.9});
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(refinements,0);assert.equal(pending().product,'Canadian Silver Maple Leaf');assert.equal(pending().weight,1);
   delete plugin.refine;
 });
 await test('Incomplete first side requests one bounded refinement',async()=>{
   let refinements=0;plugin.refine=async()=>{refinements++;return {lines:['fine silver'],confidence:.95}};
   queued.push({lines:[],confidence:0});await context.runSmartCameraScan();assert.equal(refinements,1);assert.equal(pending().sides,1);assert.equal(pending().metal,'silver');
   delete plugin.refine;
 });
 await test('Unresolved second side requests one refinement and adds processing times',async()=>{
   let refinements=0;plugin.refine=async()=>{refinements++;return refinements===1?{text:'2022',confidence:.9}:{text:'CANADA FINE SILVER 1 OZ 9999',confidence:.95,elapsedMs:500}};
   queued.push({text:'2022',confidence:.9},{text:'FINE SILVER',confidence:.95,elapsedMs:120});
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(refinements,2);assert.equal(pending().product,'Canadian Silver Maple Leaf');
   assert.equal(vm.runInContext('smartCameraLastDiagnostic.elapsedMs',context),620);
   delete plugin.refine;
 });
 await test('Closing during refinement discards the late callback',async()=>{
   let done;let firstRefinement=true;plugin.refine=()=>{if(firstRefinement){firstRefinement=false;return Promise.resolve({text:'2022',confidence:.9})}return new Promise(resolve=>done=resolve)};
   queued.push({text:'2022',confidence:.9},{text:'FINE SILVER',confidence:.95});
   await context.runSmartCameraScan();const before=pending();const second=context.runSmartCameraScan(true);
   await new Promise(resolve=>setImmediate(resolve));context.closeSmartCamera();
   done({text:'CANADA FINE SILVER 1 OZ',confidence:.95});await second;assert.equal(pending(),null);
   delete plugin.refine;
 });
 await test('Maple without weight opens review and keeps captured photos',async()=>{
   const scan=context.interpretSmartCameraScan({text:'CANADA 9999 FINE SILVER 2026',confidence:.95});
   get('product').options=[{value:'Canadian Silver Maple Leaf'}];
   vm.runInContext("smartCameraCapturedFiles=[{name:'front.jpg'},{name:'back.jpg'}]",context);
   assert.equal(context.canUseSmartCameraSuggestion(scan),false);
   assert.equal(context.applySmartCameraSuggestion(scan),true);
   assert.equal(get('product').value,'Canadian Silver Maple Leaf');assert.equal(get('weight').value,'');
   assert.equal(vm.runInContext('pendingScannerPhotoFiles.length',context),2);
 });
 await test('Conflicting weights open manual review without autofilling weight',async()=>{
   const scan=context.interpretSmartCameraScan({text:'CANADA 9999 FINE SILVER 1 OZ 2 OZ',confidence:.95});
   assert.equal(context.canUseSmartCameraSuggestion(scan),false);
   assert.equal(context.applySmartCameraSuggestion(scan),true);assert.equal(get('weight').value,'');
   assert.match(get('holdingDetailsHint').textContent,/Different weights/);
 });
 await test('Real two-photo handoff cannot combine rim digits with another pass unit',async()=>{
   reset();vm.runInContext('smartCameraScanning=false',context);
   const pass=text=>({observations:[{text,confidence:.95}],confidence:.95});
   queued.push({passes:[pass('CHARLES III 5 DOLLARS 2026')],confidence:.95},
     {passes:[pass('CANADA 9999 FINE SILVER 666'),pass('G ARGENT PUR')],confidence:.95});
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(pending().product,'Canadian Silver Maple Leaf');assert.equal(pending().weight,1);
   assert.equal(pending().inferredWeight,true);
   // The value comes from the independently matched $5 specification, never 666 G.
   assert.equal(context.applySmartCameraSuggestion(pending()),true);assert.equal(Number(get('weight').value),1);
 });
 await test('A false year-unit reading stays blank through actual scanner-to-holding flow',async()=>{
   reset();vm.runInContext('smartCameraScanning=false',context);queued.push({lines:['BRITANNIA FINE GOLD','2026 OZ'],confidence:.95});
   await context.runSmartCameraScan();
   assert.equal(pending().weight,0);assert.equal(pending().year,2026);
   assert.equal(context.canUseSmartCameraSuggestion(pending()),false);
   assert.equal(context.applySmartCameraSuggestion(pending()),true);assert.equal(get('weight').value,'');
 });
 await test('Build 87 weak direct gram reading invokes refinement instead of declaring ready',async()=>{
   reset();vm.runInContext('smartCameraScanning=false',context);let refinements=0;
   const observed={id:3,confidence:.7666667302449545,observations:[
     {text:'CANADA 9999 FINE SILVER',confidence:1},{text:'666 G ARGENT PUR',confidence:.30000001192092896}
   ]};
   plugin.refine=async()=>{refinements++;if(refinements===1)return {lines:['CHARLES III 2026'],confidence:.95};return {passes:[{id:4,confidence:.95,observations:[
     {text:'CANADA 9999 FINE SILVER 1 OZ ARGENT PUR',confidence:.95}
   ]}],elapsedMs:1200}};
   queued.push({lines:['CHARLES III 2026'],confidence:.95},{passes:[observed],appBuild:'87',confidence:.95,elapsedMs:722});
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(refinements,2);assert.equal(pending().weight,1);assert.equal(context.canUseSmartCameraSuggestion(pending()),true);
   assert.equal(vm.runInContext('smartCameraLastDiagnostic.elapsedMs',context),1922);
   delete plugin.refine;
 });
 await test('Unrecovered weak weight stays blank and diagnostics explain its rejection',async()=>{
   reset();vm.runInContext('smartCameraScanning=false',context);
   queued.push({passes:[{id:3,confidence:.7666667302449545,observations:[
     {text:'CANADA 9999 FINE SILVER',confidence:1},{text:'666 G ARGENT PUR',confidence:.30000001192092896}
   ]}],appBuild:'87',confidence:.95});
   await context.runSmartCameraScan();assert.equal(pending().weight,0);
   const diagnostic=vm.runInContext('smartCameraLastDiagnostic',context);
   assert.equal(diagnostic.weightPasses[0].rejectedReasons.lowConfidence,1);
   assert.equal(diagnostic.weightPasses[0].weightsOz.length,0);assert.equal(diagnostic.weightPasses[0].direct.length,0);
   assert.equal(context.applySmartCameraSuggestion(pending()),true);assert.equal(get('weight').value,'');
 });
 // Synthetic bridge responses test orchestration, not Buffalo camera accuracy.
 await test('Weak Buffalo reverse is refined before a distinct portrait, in either order',async()=>{
  for(const reverseFirst of [true,false]){
   reset();vm.runInContext('smartCameraScanning=false',context);let refinementCalls=0,currentSide='';
   const originalScan=plugin.scan;
   plugin.scan=async options=>{const photo=await originalScan(options);currentSide=photo.testSide;return photo};
   plugin.refine=async()=>{
    refinementCalls++;
    return currentSide==='reverse'
     ?{lines:['UNITED STATES OF AMERICA 1 OZ .9999 FINE GOLD 50 DOLLARS'],confidence:.95,designSuggestion:{id:'american_buffalo',source:'local-catalogue-v1'},elapsedMs:500}
     :{lines:['LIBERTY 2012'],confidence:.95,elapsedMs:500};
   };
   const reverse={lines:['.9999'],confidence:.95,testSide:'reverse'};
   const portrait={lines:['LIBERTY 2012'],confidence:.95,testSide:'portrait'};
   queued.push(...(reverseFirst?[reverse,portrait]:[portrait,reverse]));
   await context.runSmartCameraScan();assert.equal(refinementCalls,1);
   if(reverseFirst){assert.equal(pending().product,'American Gold Buffalo');assert.equal(pending().weight,1)}
   await context.runSmartCameraScan(true);
   assert.equal(pending().product,'American Gold Buffalo');assert.equal(pending().metal,'gold');
   assert.equal(pending().weight,1);assert.equal(pending().year,2012);assert.equal(pending().sides,2);
   assert.equal(context.canUseSmartCameraSuggestion(pending()),true);
   assert.equal(refinementCalls,reverseFirst?1:2);
   plugin.scan=originalScan;delete plugin.refine;
  }
 });
 await test('Failed first-photo refinement retains partial evidence and one-photo count',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);plugin.refine=async()=>{throw Error('Design unavailable')};
  const originalConsole=context.console;context.console={...console,warn(){}};
  queued.push({lines:['FINE GOLD .9999'],confidence:.95});await context.runSmartCameraScan();
  context.console=originalConsole;delete plugin.refine;
  assert.equal(pending().metal,'gold');assert.equal(pending().purity.trim(),'.9999 gold');
  assert.equal(pending().sides,1);assert.equal(views(),1);assert.equal(pending().weight,0);
  assert.equal(context.canUseSmartCameraSuggestion(pending()),false);
 });
 await test('First-photo refinement still blocks conflicting purity and weights',async()=>{
  for(const markings of ['AMERICAN GOLD BUFFALO .9999 .900 1 OZ','AMERICAN GOLD BUFFALO .9999 1 OZ 91 OZ']){
   reset();vm.runInContext('smartCameraScanning=false',context);plugin.refine=async()=>({lines:[markings],confidence:.95});
   queued.push({lines:['.9999'],confidence:.95});await context.runSmartCameraScan();
   assert.equal(context.canUseSmartCameraSuggestion(pending()),false);assert.ok(pending().warnings.length);
   assert.equal(pending().sides,1);delete plugin.refine;
  }
 });
 await test('Closing during first-photo refinement cannot publish a late result',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);let done;plugin.refine=()=>new Promise(resolve=>done=resolve);
  queued.push({lines:['.9999'],confidence:.95});const scan=context.runSmartCameraScan();
  await new Promise(resolve=>setImmediate(resolve));context.closeSmartCamera();
  done({lines:['AMERICAN GOLD BUFFALO .9999 1 OZ'],confidence:.95});await scan;
  assert.equal(pending(),null);assert.equal(views(),0);delete plugin.refine;
 });
 await test('Recorded Palladium Maple Apple OCR still resolves with first-photo refinement in both orders',async()=>{
  const pair=JSON.parse(fs.readFileSync('tests/fixtures/palladium-maple-ocr.json','utf8'));
  for(const reversed of [false,true]){
   reset();vm.runInContext('smartCameraScanning=false',context);
   const originalScan=plugin.scan;let current;
   plugin.scan=async options=>{const photo=await originalScan(options);current=photo.testPhoto;return photo};
   plugin.refine=async()=>({passes:current.passes,confidence:.95});
   for(const photo of reversed?[...pair].reverse():pair){
    queued.push({passes:photo.passes.slice(0,4),testPhoto:photo,confidence:.95});
   }
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(pending().product,'Canadian Palladium Maple Leaf');assert.equal(pending().mint,'Royal Canadian Mint');
   assert.equal(pending().weight,1);assert.equal(pending().year,null);assert.equal(pending().warnings.length,0);
   assert.equal(context.canUseSmartCameraSuggestion(pending()),true);
   plugin.scan=originalScan;delete plugin.refine;
  }
 });
 await test('Ready first photo keeps the real camera and library controls on the opposite side',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);
  const render=context.renderSmartCameraAnalysis;
  // Run the actual renderer here: readiness previously disabled append mode.
  vm.runInContext(html.slice(html.indexOf('function renderSmartCameraAnalysis('),html.indexOf('function applySmartCameraSuggestion(')),context);
  for(const firstSource of ['camera','library']){
   await context.resetSmartCameraScan(true);
   const resetsBefore=resetCalls;
   queued.push({lines:['AMERICAN GOLD BUFFALO 1 OZ FINE GOLD .9999'],confidence:.95});
   await context.captureSmartCameraSide(firstSource);
   assert.equal(context.canUseSmartCameraSuggestion(pending()),true);assert.equal(pending().year,null);
   assert.equal(get('smartCameraProButton').textContent,'Scan Opposite Side');
   assert.equal(get('smartCameraLibraryButton').textContent,'Choose Opposite Side Photo');
   const session=vm.runInContext('smartCameraSession',context);
   queued.push({lines:['LIBERTY 2012'],confidence:.95});
   await context.captureSmartCameraSide(firstSource==='camera'?'library':'camera');
   assert.equal(resetCalls,resetsBefore+1);assert.equal(vm.runInContext('smartCameraSession',context),session);
   assert.equal(pending().sides,2);assert.equal(pending().year,2012);
   assert.equal(pending().product,'American Gold Buffalo');assert.equal(pending().weight,1);
   assert.equal(views(),2);assert.equal(context.canUseSmartCameraSuggestion(pending()),true);
  }
  context.renderSmartCameraAnalysis=render;
 });
 await test('Contradictory reverse retains established fields while blocking automatic use',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);
  queued.push({lines:['AMERICAN GOLD BUFFALO 1 OZ FINE GOLD .9999 2012'],confidence:.95},
    {lines:['FINE SILVER 2 OZ .999 2021'],confidence:.9});
  await context.captureSmartCameraSide('camera');const first=pending();
  await context.captureSmartCameraSide('library');
  for(const field of ['metal','product','weight','year','purity','mint'])assert.equal(pending()[field],first[field],field);
  assert.equal(pending().sides,2);assert.ok(pending().warnings.length);
  assert.equal(context.canUseSmartCameraSuggestion(pending()),false);
  assert.equal(context.applySmartCameraSuggestion(pending()),false);
  assert.equal(vm.runInContext('smartCameraScans[0].reading.product',context),'American Gold Buffalo');
 });
 await test('Opposite-side picker cancellation and failure keep first result and photo',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);
  queued.push({lines:['AMERICAN GOLD BUFFALO 1 OZ FINE GOLD .9999'],confidence:.95});
  await context.captureSmartCameraSide('camera');
  vm.runInContext('smartCameraCapturedFiles=[{name:"front.jpg"}]',context);
  const first=pending(),session=vm.runInContext('smartCameraSession',context),resets=resetCalls;
  queued.push({cancelled:true});await context.captureSmartCameraSide('library');
  assert.equal(pending(),first);assert.equal(vm.runInContext('smartCameraPhotoCount',context),1);
  const originalScan=plugin.scan,originalConsole=context.console;
  plugin.scan=async()=>{throw Error('Picker failed')};context.console={...console,error(){}};
  await context.captureSmartCameraSide('library');plugin.scan=originalScan;context.console=originalConsole;
  assert.equal(pending(),first);assert.equal(vm.runInContext('smartCameraCapturedFiles[0].name',context),'front.jpg');
  assert.equal(vm.runInContext('smartCameraSession',context),session);assert.equal(resetCalls,resets);
  queued.push({lines:[],confidence:0});await context.captureSmartCameraSide('library');
  assert.equal(pending().product,first.product);assert.equal(pending().sides,2);
 });
 await test('Generic gold reverse cannot skip the named-product refinement',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);
  let refinements=0,currentSide='';const originalScan=plugin.scan;
  plugin.scan=async options=>{const result=await originalScan(options);currentSide=result.testSide;return result};
  plugin.refine=async()=>{refinements++;return currentSide==='front'
    ?{lines:['LIBERTY'],confidence:.9}
    :{lines:['UNITED STATES OF AMERICA 1 OZ FINE GOLD 50 DOLLARS'],confidence:.95,
      designSuggestion:{id:'american_gold_eagle',source:'local-catalogue-v1'}}};
  queued.push({lines:['LIBERTY'],confidence:.9,testSide:'front'},
    {lines:['COIN 1 OZ FINE GOLD'],confidence:.95,testSide:'reverse'});
  await context.captureSmartCameraSide('library');await context.captureSmartCameraSide('library');
  plugin.scan=originalScan;delete plugin.refine;
  assert.equal(refinements,2);assert.equal(pending().product,'American Gold Eagle');
  assert.equal(pending().metal,'gold');assert.equal(pending().weight,1);
  assert.equal(pending().mint,'United States Mint');assert.equal(pending().warnings.length,0);
 });
 await test('A compatible named second side upgrades a generic first side without a product conflict',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);
  queued.push({lines:['COIN 1 OZ FINE GOLD'],confidence:.95},
    {lines:['AMERICAN GOLD EAGLE 1 OZ FINE GOLD 2012'],confidence:.95});
  await context.captureSmartCameraSide('camera');assert.equal(pending().product,'Gold Bullion Coin');
  await context.captureSmartCameraSide('library');
  assert.equal(pending().product,'American Gold Eagle');assert.equal(pending().year,2012);
  assert.equal(pending().warnings.length,0);assert.equal(context.canUseSmartCameraSuggestion(pending()),true);
 });
 await test('Generic categories for all five metals request refinement while named results remain fast',async()=>{
  for(const metal of ['gold','silver','platinum','palladium','copper']){
   const label=metal[0].toUpperCase()+metal.slice(1);
   for(const kind of ['Bullion Coin','Bar','Round']){
    assert.equal(context.shouldRefineSmartCameraSuggestion({usable:true,metal,product:label+' '+kind,weight:1,warnings:[]}),true);
   }
  }
  assert.equal(context.shouldRefineSmartCameraSuggestion(context.interpretSmartCameraScan({text:'AMERICAN GOLD EAGLE 1 OZ FINE GOLD',confidence:.95})),false);
 });
 await test('Generic first-side inference can improve to named purity but directly observed conflicts remain blocked',async()=>{
  const first={...context.interpretSmartCameraScan({text:'GOLD BULLION COIN 1 OZ FINE GOLD',confidence:.95}),purity:'.9999 gold',inferredPurity:true};
  const named=context.interpretSmartCameraScan({text:'AMERICAN GOLD EAGLE 1 OZ FINE GOLD',confidence:.95});
  const combined=context.interpretSmartCameraScan({text:'GOLD BULLION COIN AMERICAN GOLD EAGLE 1 OZ FINE GOLD',confidence:.95,sides:2});
  const merged=context.mergeSmartCameraReadings(first,named,combined);
  assert.equal(first.inferredPurity,true);assert.equal(merged.product,'American Gold Eagle');
  assert.equal(merged.purity,named.purity);assert.equal(merged.warnings.length,0);
  const direct=context.interpretSmartCameraScan({text:'GOLD BULLION COIN 1 OZ FINE GOLD .9999',confidence:.95});
  const conflict=context.mergeSmartCameraReadings(direct,named,combined);
  assert.equal(conflict.purity,direct.purity);assert.ok(conflict.warnings.length);
 });
 await test('Specific product survives a generic second reading without a false product disagreement',async()=>{
  reset();vm.runInContext('smartCameraScanning=false',context);
  queued.push({lines:['AMERICAN GOLD EAGLE 1 OZ FINE GOLD'],confidence:.95},
    {lines:['COIN 1 OZ FINE GOLD'],confidence:.95});
  await context.captureSmartCameraSide('camera');await context.captureSmartCameraSide('library');
  assert.equal(pending().product,'American Gold Eagle');assert.equal(pending().warnings.length,0);
 });
 await test('Every catalogue title retains the same reading in both orders and all camera/library transitions',async()=>{
  const map=vm.runInContext('PRODUCT_MAP',context),catalog=vm.runInContext('SMART_CAMERA_CATALOG',context);
  let products=0,scenarios=0;
  for(const [metal,titles] of Object.entries(map))for(const product of titles){
   products++;
   const profile=catalog.find(item=>item.product===product&&item.metal===metal);
   const year=product==='U.S. Copper Cents'?1980:profile.yearMin||2026;
   const text=product+' '+year+' fine '+metal+' 1 oz';
   const expected=context.interpretSmartCameraScan({text,confidence:.95});
   assert.equal(expected.product,product);assert.equal(expected.metal,metal);
   for(const blankFirst of [false,true])for(const sources of [['camera','camera'],['camera','library'],['library','camera'],['library','library']]){
    reset();vm.runInContext('smartCameraScanning=false',context);
    const photos=[{text,confidence:.95},{lines:[],confidence:0}];
    queued.push(...(blankFirst?photos.reverse():photos));
    await context.captureSmartCameraSide(sources[0]);const session=vm.runInContext('smartCameraSession',context),resets=resetCalls;
    await context.captureSmartCameraSide(sources[1]);
    assert.equal(vm.runInContext('smartCameraSession',context),session);assert.equal(resetCalls,resets);
    assert.equal(pending().sides,2);
    for(const field of ['product','metal','weight','year','purity','mint','serial','denomination']){
     assert.equal(pending()[field],expected[field],product+' / '+sources.join('→')+' / '+field);
    }
    scenarios++;
   }
  }
  console.log('Covered '+products+' product titles and '+scenarios+' two-photo source/order scenarios');
 });
 await test('All generic catalogue labels including size-labelled copper share the refinement rule',async()=>{
  const map=vm.runInContext('PRODUCT_MAP',context);let count=0;
  for(const [metal,products] of Object.entries(map))for(const product of products){
   if(context.smartCameraGenericProduct(product)){
    count++;assert.equal(context.shouldRefineSmartCameraSuggestion({metal,product,weight:1,usable:true,warnings:[]}),true,product);
   }
  }
  for(const product of ['1 oz Copper Round','1 lb Copper Bar','5 lb Copper Bar','10 lb Copper Bar','Copper Coin Collection'])assert.equal(context.smartCameraGenericProduct(product),true,product);
  assert.equal(count,20);
 });
 await test('Equivalent fineness and specific design aliases confirm fields without false conflicts',async()=>{
  const first=context.interpretSmartCameraScan({text:'AMERICAN SILVER EAGLE 1 OZ FINE SILVER .999 2022',confidence:.95});
  const merged=context.mergeSmartCameraReadings({...first,purity:'.999 fine silver',designID:'american_eagle'},
   {...first,purity:'.999 silver',designID:'american_silver_eagle'},first);
  assert.equal(merged.warnings.length,0);assert.equal(context.canUseSmartCameraSuggestion(merged),true);
  assert.equal(context.smartCameraSameField('purity','22K gold','.9167 gold'),true);
  assert.equal(context.smartCameraSameField('purity','.9999 gold','.999 gold'),false);
 });
 await test('Generic shape upgrades use the same kind check across all metals',async()=>{
  for(const [metal,product] of [['gold','American Gold Eagle'],['silver','American Silver Eagle'],['platinum','American Platinum Eagle'],['palladium','American Palladium Eagle'],['copper','U.S. Copper Cents']]){
   const specific={metal,product,weight:1,year:2022,purity:'',mint:'',serial:'',denomination:'',warnings:[],confidence:.95,usable:true,designID:''};
   const label=metal[0].toUpperCase()+metal.slice(1);
   const generic={...specific,product:label+' Bullion Coin',designID:'generic_coin'};
   const named={...specific,designID:metal==='copper'?'':'american_'+metal+'_eagle'};
   const upgrade=context.mergeSmartCameraReadings(generic,named,named);
   assert.equal(upgrade.product,product);assert.equal(upgrade.designID,named.designID||'generic_coin');assert.equal(upgrade.warnings.length,0);
   const wrongKind=context.mergeSmartCameraReadings({...generic,product:label+' Bar',designID:'generic_bar'},named,named);
   assert.equal(wrongKind.product,label+' Bar');assert.ok(wrongKind.warnings.length);assert.equal(context.canUseSmartCameraSuggestion(wrongKind),false);
  }
 });
 await test('Weight, year, purity and metal conflicts retain established values under the same rule for every metal',async()=>{
  for(const metal of ['gold','silver','platinum','palladium','copper']){
   const label=metal[0].toUpperCase()+metal.slice(1);
   for(const reverse of ['1 OZ .999 2021','2 OZ .999 2022','1 OZ .900 2022']){
    reset();vm.runInContext('smartCameraScanning=false',context);
    queued.push({text:label+' BULLION COIN FINE '+metal+' 1 OZ .999 2022',confidence:.95},
      {text:'FINE '+metal+' '+reverse,confidence:.95});
    await context.captureSmartCameraSide('camera');const first=pending();
    await context.captureSmartCameraSide('library');
    for(const field of ['product','metal','weight','year','purity'])assert.equal(pending()[field],first[field],metal+' '+field);
    assert.ok(pending().warnings.length);assert.equal(context.canUseSmartCameraSuggestion(pending()),false);
   }
   reset();vm.runInContext('smartCameraScanning=false',context);
   queued.push({text:label+' BULLION COIN FINE '+metal+' 1 OZ',confidence:.95},
    {text:'FINE '+(metal==='gold'?'silver':'gold')+' 1 OZ',confidence:.95});
   await context.captureSmartCameraSide('library');await context.captureSmartCameraSide('camera');
   assert.equal(pending().metal,metal);assert.equal(context.canUseSmartCameraSuggestion(pending()),false);
   assert.equal(context.applySmartCameraSuggestion(pending()),false);
  }
 });
 await test('A generic opposite-side design cannot hide confirmation for a named Gold Eagle, in either order',async()=>{
  const render=context.renderSmartCameraAnalysis;
  vm.runInContext(html.slice(html.indexOf('function renderSmartCameraAnalysis('),html.indexOf('function applySmartCameraSuggestion(')),context);
  for(const genericFirst of [false,true]){
   reset();vm.runInContext('smartCameraScanning=false',context);
   const named={lines:['AMERICAN GOLD EAGLE 1 OZ FINE GOLD'],confidence:.95,designSuggestion:{id:'american_gold_eagle',source:'local-catalogue-v1'}};
   const generic={lines:['LIBERTY'],confidence:.9,designSuggestion:{id:'generic_coin',source:'local-catalogue-v1'}};
   queued.push(...(genericFirst?[generic,named]:[named,generic]));
   await context.captureSmartCameraSide('camera');await context.captureSmartCameraSide('library');
   assert.equal(pending().product,'American Gold Eagle');assert.equal(pending().metal,'gold');assert.equal(pending().weight,1);
   assert.equal(pending().purity,'22K gold');assert.equal(pending().mint,'United States Mint');
   assert.equal(pending().warnings.length,0);assert.equal(context.canUseSmartCameraSuggestion(pending()),true);
   assert.equal(get('smartAnalysisUseButton').hidden,false);assert.equal(get('smartAnalysisUseButton').disabled,false);
   assert.equal(get('smartAnalysisTitle').textContent,'Your scan is ready');
   get('product').options=[{value:'American Gold Eagle'}];
   context.useSmartCameraAnalysis();
   assert.equal(get('product').value,'American Gold Eagle');assert.equal(get('weight').value,1);
   await new Promise(resolve=>setImmediate(resolve));
  }
  context.renderSmartCameraAnalysis=render;
 });
 await test('Compatible generic designs keep confirmation visible across metals and genuine design conflicts still block it',async()=>{
  const render=context.renderSmartCameraAnalysis;
  vm.runInContext(html.slice(html.indexOf('function renderSmartCameraAnalysis('),html.indexOf('function applySmartCameraSuggestion(')),context);
  for(const [metal,product,design,shape] of [
   ['gold','American Gold Eagle','american_gold_eagle','generic_coin'],
   ['silver','American Silver Eagle','american_silver_eagle','generic_coin'],
   ['platinum','American Platinum Eagle','american_platinum_eagle','generic_coin'],
   ['palladium','American Palladium Eagle','american_palladium_eagle','generic_coin'],
   ['copper','Copper Bullion Bar','generic_bar','unknown']]){
   for(const genericFirst of [true,false]){
    reset();vm.runInContext('smartCameraScanning=false',context);
    const known={text:product+' 1 OZ FINE '+metal,confidence:.95,designSuggestion:{id:design,source:'local-catalogue-v1'}};
    const generic={lines:[],confidence:.9,designSuggestion:{id:shape,source:'local-catalogue-v1'}};
    queued.push(...(genericFirst?[generic,known]:[known,generic]));
    await context.captureSmartCameraSide('library');await context.captureSmartCameraSide('camera');
    assert.equal(pending().product,product);assert.equal(pending().warnings.length,0);
    assert.equal(get('smartAnalysisUseButton').hidden,false);assert.equal(get('smartAnalysisUseButton').disabled,false);
   }
  }
  reset();vm.runInContext('smartCameraScanning=false',context);
  queued.push({text:'American Gold Eagle 1 OZ FINE GOLD',confidence:.95,designSuggestion:{id:'american_gold_eagle',source:'local-catalogue-v1'}},
   {lines:[],confidence:.95,designSuggestion:{id:'american_buffalo',source:'local-catalogue-v1'}});
  await context.captureSmartCameraSide('camera');await context.captureSmartCameraSide('library');
  assert.ok(pending().warnings.length);assert.equal(context.canUseSmartCameraSuggestion(pending()),false);
  assert.equal(get('smartAnalysisUseButton').hidden,true);assert.equal(context.applySmartCameraSuggestion(pending()),false);
  assert.doesNotMatch(get('smartAnalysisSub').textContent,/designID/);
  context.renderSmartCameraAnalysis=render;
 });
 console.log(count+' scanner flow checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
