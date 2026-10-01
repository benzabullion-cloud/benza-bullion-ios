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
   queued.push({text:'ELIZABETH II 5 DOLLARS 2022',confidence:.9},{text:'CANADA 9999 FINE SILVER 1 OZ ARGENT PUR',confidence:.95});
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(refinements,0);assert.equal(pending().product,'Canadian Silver Maple Leaf');assert.equal(pending().weight,1);
   delete plugin.refine;
 });
 await test('First side never waits for visual refinement',async()=>{
   let refinements=0;plugin.refine=async()=>{refinements++;return {text:'fine silver'}};
   queued.push({lines:[],confidence:0});await context.runSmartCameraScan();assert.equal(refinements,0);assert.equal(pending().sides,1);
   delete plugin.refine;
 });
 await test('Unresolved second side requests one refinement and adds processing times',async()=>{
   let refinements=0;plugin.refine=async()=>{refinements++;return {text:'CANADA FINE SILVER 1 OZ 9999',confidence:.95,elapsedMs:500}};
   queued.push({text:'2022',confidence:.9},{text:'FINE SILVER',confidence:.95,elapsedMs:120});
   await context.runSmartCameraScan();await context.runSmartCameraScan(true);
   assert.equal(refinements,1);assert.equal(pending().product,'Canadian Silver Maple Leaf');
   assert.equal(vm.runInContext('smartCameraLastDiagnostic.elapsedMs',context),620);
   delete plugin.refine;
 });
 await test('Closing during refinement discards the late callback',async()=>{
   let done;plugin.refine=()=>new Promise(resolve=>done=resolve);
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
 console.log(count+' scanner flow checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
