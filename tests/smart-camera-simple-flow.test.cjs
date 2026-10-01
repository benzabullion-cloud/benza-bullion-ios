const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('App/public/index.html','utf8');
const nodes=new Map();
const get=id=>{
 if(!nodes.has(id)){
  const classes=new Set();
  const node={value:'',dataset:{},hidden:false,disabled:false,textContent:'',options:[],selectedIndex:0,
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){on?classes.add(x):classes.delete(x)}},setAttribute(){}};
  Object.defineProperty(node,'innerHTML',{set(value){this.options=[...value.matchAll(/<option>(.*?)<\/option>/g)].map(m=>({value:m[1]}));this.value=this.options[0]?.value||''}});
  nodes.set(id,node);
 }
 return nodes.get(id);
};
let active=true,updates=0;
const context=vm.createContext({Date,Number,console,document:{getElementById:get,querySelectorAll:()=>[]},
 isProActive:()=>active,isBenzaNativeRuntime:()=>false,smartCameraPlugin:()=>null,
 ensureGlobalAddPortals(){},resetProInventoryForm(){get('holdingNotes').value='';get('holdingSerial').value=''},update(){updates++},
 addScreen:get('addScreen'),weight:get('weight'),cost:get('cost')});
vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('function ensureGlobalAddPortals(')),context);
vm.runInContext(html.slice(html.indexOf('let pendingSmartCameraSuggestion='),html.indexOf('function clearAttachmentObjectUrls')),context);
vm.runInContext(html.slice(html.indexOf('function fillBullionDetails('),html.indexOf('function editHolding(')),context);
let count=0;const test=(name,fn)=>{get('addScreen').classList.remove('show');fn();count++;console.log('PASS',name)};
const scan=text=>context.interpretSmartCameraScan({text,confidence:.95,sides:2});
const complete=scan('American Silver Eagle 1 oz Fine silver .999 2011');
test('Complete scan stays on compact result until review is selected',()=>{
 context.renderSmartCameraAnalysis(complete);assert.equal(get('addScreen').classList.contains('show'),false);
 assert.equal(get('smartAnalysisTitle').textContent,'Your scan is ready');assert.equal(get('smartScanProduct').textContent,'American Silver Eagle');
 assert.equal(get('smartAnalysisUseButton').hidden,false);assert.equal(get('smartAnalysisUseButton').disabled,false);
});
test('Review transfers real product, metal and weight through the real holding setup',()=>{
 context.renderSmartCameraAnalysis(complete);context.useSmartCameraAnalysis();
 assert.equal(get('addScreen').classList.contains('show'),true);assert.equal(get('product').value,'American Silver Eagle');
 assert.equal(get('weight').value,1);assert.equal(get('qty').value,1);assert.equal(get('cost').value,'');
 assert.equal(vm.runInContext('metal',context),'silver');assert.equal(get('holdingYear').value,2011);assert.equal(get('holdingNotes').value,'');
 assert.equal(get('proInventoryFields').hidden,false);assert.equal(get('proInventoryTeaser').hidden,true);
});
test('Successful scan stages both captured photos for the holding save',()=>{
 vm.runInContext('smartCameraCapturedFiles=[{name:"front.jpg"},{name:"back.jpg"}]',context);
 context.applySmartCameraSuggestion(complete);
 assert.equal(vm.runInContext('pendingScannerPhotoFiles.length',context),2);
});
test('Smart Camera menu uses explicit capture choices',()=>{
 assert.match(html,/>Scan Bullion<\/button>/);
 assert.match(html,/>Choose Bullion Photo<\/button>/);
 const open=html.slice(html.indexOf('async function openSmartCamera()'),html.indexOf('function closeSmartCamera()'));
 assert.doesNotMatch(open,/runSmartCameraScan\s*\(/);
});
test('Two-side metal-only result opens partial review with weight blank',()=>{
 const partial=scan('Fine silver');context.renderSmartCameraAnalysis(partial);assert.equal(get('smartAnalysisUseButton').hidden,false);assert.equal(get('smartAnalysisUseButton').disabled,false);assert.equal(get('smartAnalysisUseButton').textContent,'Review and complete holding');context.useSmartCameraAnalysis();
 assert.equal(get('addScreen').classList.contains('show'),true);assert.equal(get('weight').value,'');assert.equal(get('product').selectedIndex,-1);assert.equal(get('smartScanMetal').textContent,'Silver');
 assert.equal(get('smartScanProduct').textContent,'Not identified');assert.equal(get('smartScanWeight').textContent,'Not read');
 assert.equal(get('smartAnalysisTitle').textContent,'More details needed');
});
test('Product without weight proceeds with the weight blank',()=>{const s=scan('American Gold Eagle');context.renderSmartCameraAnalysis(s);assert.equal(context.applySmartCameraSuggestion(s),true);assert.equal(get('addScreen').classList.contains('show'),true);assert.equal(get('weight').value,'');assert.equal(get('product').value,'American Gold Eagle')});
test('Weight and metal without product proceed with no selected product',()=>{const s=scan('Fine silver 1 oz');context.renderSmartCameraAnalysis(s);assert.equal(context.applySmartCameraSuggestion(s),true);assert.equal(get('addScreen').classList.contains('show'),true);assert.equal(get('weight').value,1);assert.equal(get('product').selectedIndex,-1)});
test('Product outside the selected metal catalog cannot proceed',()=>{assert.equal(context.applySmartCameraSuggestion({...complete,metal:'gold'}),false);assert.equal(get('addScreen').classList.contains('show'),false)});
test('Weight conflicts proceed to review without a prefilled weight',()=>{assert.equal(context.applySmartCameraSuggestion({...complete,warnings:['Conflicting weight']}),true);assert.equal(get('weight').value,'');assert.match(get('holdingDetailsHint').textContent,/Conflicting weight/)});
test('Blank front asks for one reverse photo',()=>{context.renderSmartCameraAnalysis({...scan(''),sides:1});assert.equal(get('smartAnalysisTitle').textContent,'One more photo');assert.equal(vm.runInContext('smartCameraAwaitingReverse',context),true)});
test('Failed two-side scan stays on result with a fresh retry',()=>{context.renderSmartCameraAnalysis(scan(''));assert.equal(get('smartAnalysisTitle').textContent,'More details needed');assert.equal(vm.runInContext('smartCameraAwaitingReverse',context),false);assert.equal(get('addScreen').classList.contains('show'),false)});
test('Pro access is checked again at handoff',()=>{active=false;assert.equal(context.applySmartCameraSuggestion(complete),false);active=true});
test('Free and Pro inventory sections are mutually exclusive',()=>{active=false;context.syncProInventoryVisibility();assert.equal(get('proInventoryFields').hidden,true);assert.equal(get('proInventoryTeaser').hidden,false);active=true;context.syncProInventoryVisibility();assert.equal(get('proInventoryTeaser').hidden,true);assert.match(html,/#smartAnalysisUseButton\[hidden\],#proInventoryFields\[hidden\],#proInventoryTeaser\[hidden\]\{display:none!important\}/)});
test('Scanner photos cross only the local bridge until holding save',()=>{const scanner=html.slice(html.indexOf('function smartCameraPlugin('),html.indexOf('function clearAttachmentObjectUrls'));assert.doesNotMatch(scanner,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|indexedDB|sessionStorage/);const native=fs.readFileSync('App/SceneDelegate.swift','utf8');const plugin=native.slice(native.indexOf('@objc(BenzaSmartCameraPlugin)'),native.indexOf('@objc(BenzaStoreKitPlugin)'));assert.doesNotMatch(plugin,/URLSession|URLRequest|write\(to:|UserDefaults/);assert.match(plugin,/capturedPhotoBase64/);assert.match(html,/finishScannerPhotoUploads/);assert.match(html,/scanner_photo_paths/)});

test('Failure diagnostics contain counts and flags, never recognized text',()=>{
 vm.runInContext('smartCameraLastDiagnostic={engineVersion:3,appBuild:"44",ocrPasses:10,selectedPasses:2,rejectedPasses:8,lineCount:3,elapsedMs:1200};smartCameraPhotoCount=2',context);
 context.renderSmartCameraAnalysis(scan('Valcambi Fine gold Serial: SECRET123'));
 assert.equal(get('smartCameraDiagnostics').hidden,false);
 const diagnostic=JSON.parse(get('smartCameraDiagnosticText').textContent);
 assert.equal(diagnostic.appBuild,'44');assert.equal(diagnostic.photoCount,2);assert.equal(diagnostic.weightRead,false);
 assert.doesNotMatch(JSON.stringify(diagnostic),/SECRET123|Valcambi|gold|raw|serial|observations/i);
});
test('Fresh retry clears diagnostic and recognized evidence',()=>{
 get('smartCameraDiagnostics').open=true;context.clearSmartCameraEvidence();
 assert.equal(get('smartCameraDiagnostics').hidden,true);assert.equal(get('smartCameraDiagnostics').open,false);
 assert.equal(vm.runInContext('smartCameraLastDiagnostic',context),null);
 assert.equal(vm.runInContext('smartCameraScans.length+smartCameraPhotoCount',context),0);
});
test('Successful result hides diagnostics',()=>{
 vm.runInContext('smartCameraLastDiagnostic={engineVersion:3}',context);
 context.renderSmartCameraAnalysis(complete);assert.equal(get('smartCameraDiagnostics').hidden,true);
});
console.log(count+' scanner review checks passed');

test('First photo is acknowledged and both sources request opposite side',()=>{context.renderSmartCameraAnalysis({...scan('Fine silver'),sides:1});assert.match(get('smartAnalysisSub').textContent,/First photo received/);assert.equal(get('smartCameraProButton').textContent,'Scan Opposite Side');assert.equal(get('smartCameraLibraryButton').textContent,'Choose Opposite Side Photo')});
test('Second photo restores fresh scan choices',()=>{context.renderSmartCameraAnalysis(scan('Fine silver'));assert.equal(get('smartCameraProButton').textContent,'Scan again');assert.equal(get('smartCameraLibraryButton').textContent,'Choose Bullion Photo')});


test('Free account cannot see the Pro bullion detail fields',()=>{active=false;context.fillBullionDetails({year:2024,purity:'.999',mint:'Example mint',serial:'123'});context.syncProInventoryVisibility();assert.equal(get('holdingYear').value,2024);assert.equal(get('holdingSerial').value,'123');assert.equal(get('proInventoryFields').hidden,true);active=true});
test('Product suggestions do not replace user-entered purity or mint',()=>{get('product').value='American Silver Eagle';vm.runInContext("metal='silver'",context);get('holdingPurity').value='.999 confirmed';get('holdingMint').value='Custom mint';context.suggestBullionDetails();assert.equal(get('holdingPurity').value,'.999 confirmed');assert.equal(get('holdingMint').value,'Custom mint')});
test('Fresh form clears previous year and serial and suggests known product details',()=>{context.openAdd();assert.equal(get('holdingYear').value,'');assert.equal(get('holdingSerial').value,'');assert.equal(get('holdingPurity').value,'22K gold');assert.equal(get('holdingMint').value,'United States Mint')});
