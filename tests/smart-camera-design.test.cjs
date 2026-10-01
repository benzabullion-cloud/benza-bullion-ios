const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('App/public/index.html','utf8');
const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){},contains(){return true}},setAttribute(){}});return nodes.get(id)};
const queued=[];const plugin={reset:async()=>{},scan:async()=>queued.shift()};
const context=vm.createContext({Date,console,document:{getElementById:get,querySelectorAll:()=>[]},isProActive:()=>true,isBenzaNativeRuntime:()=>true,smartCameraPlugin:()=>plugin});
vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('const METAL_SYMBOLS='))+html.slice(html.indexOf('let pendingSmartCameraSuggestion='),html.indexOf('function clearAttachmentObjectUrls')),context);
vm.runInContext('renderSmartCameraAnalysis=s=>{pendingSmartCameraSuggestion=s;globalThis.last=s;}',context);
const design=id=>({id,source:'local-catalogue-v1'});
const read=(text,id,extra={})=>context.interpretSmartCameraScan({text,confidence:.95,designSuggestion:design(id),...extra});
let count=0;async function test(name,fn){await fn();count++;console.log('PASS',name)}
(async()=>{
await test('Artwork alone cannot provide holding fields',()=>{const r=read('','american_eagle');assert.equal(r.designID,'american_eagle');assert.equal(r.metal,'');assert.equal(r.product,'');assert.equal(r.weight,0);assert.equal(context.canUseSmartCameraSuggestion(r),false)});
await test('Exact Silver Eagle artwork needs two sides before standard weight',()=>{const one=read('','american_silver_eagle');assert.equal(one.metal,'silver');assert.equal(one.product,'American Silver Eagle');assert.equal(one.weight,0);assert.equal(context.canUseSmartCameraSuggestion(one),false);const two=context.interpretSmartCameraScan({lines:[],confidence:.95,sides:2,designSuggestion:design('american_silver_eagle')});assert.equal(two.weight,1);assert.equal(two.inferredWeight,true);assert.equal(context.canUseSmartCameraSuggestion(two),true)});
await test('Exact Gold Eagle artwork still requires fractional weight evidence',()=>{const r=read('1/2 OZ','american_gold_eagle');assert.equal(r.metal,'gold');assert.equal(r.product,'American Gold Eagle');assert.equal(r.weight,.5);assert.equal(context.canUseSmartCameraSuggestion(r),true)});
await test('Exact Platinum Eagle artwork maps platinum independently',()=>{const r=read('1 OZ','american_platinum_eagle');assert.equal(r.metal,'platinum');assert.equal(r.product,'American Platinum Eagle');assert.equal(r.weight,1);assert.equal(context.canUseSmartCameraSuggestion(r),true)});
await test('Exact Palladium Eagle artwork resolves fixed weight after two sides',()=>{const one=read('','american_palladium_eagle');assert.equal(one.metal,'palladium');assert.equal(one.product,'American Palladium Eagle');assert.equal(one.weight,0);const two=context.interpretSmartCameraScan({lines:[],confidence:.95,sides:2,designSuggestion:design('american_palladium_eagle')});assert.equal(two.weight,1);assert.equal(context.canUseSmartCameraSuggestion(two),true)});
await test('Copper generic bar uses OCR metal and weight with visual shape',()=>{const r=read('FINE COPPER 1 OZ','generic_bar');assert.equal(r.metal,'copper');assert.equal(r.product,'Copper Bullion Bar');assert.equal(r.weight,1);assert.equal(context.canUseSmartCameraSuggestion(r),true)});
await test('Model extra specification fields invalidate design payload',()=>{const r=read('','american_eagle',{designSuggestion:{...design('american_eagle'),metal:'silver',weight_oz:20}});assert.equal(r.designID,'');assert.equal(r.weight,0)});
await test('Unsupported and inherited IDs are ignored',()=>{for(const id of ['unknown','arbitrary','__proto__','constructor'])assert.equal(read('',id).designID,'')});
await test('Maple artwork needs independent metal weight and country',()=>{assert.equal(read('Fine gold 1/10 oz CANADA','canadian_maple_leaf').product,'Canadian Gold Maple Leaf');assert.equal(read('Fine gold CANADA','canadian_maple_leaf').weight,0);assert.equal(read('Fine gold 1 oz','canadian_maple_leaf').product,'')});
await test('Half dollar does not gain invented silver weight',()=>{const r=read('Half Dollar 1942','walking_liberty_half_dollar');assert.equal(r.metal,'');assert.equal(r.weight,0);assert.equal(r.product,'')});
await test('Artwork contradicting a supported inscription blocks review',()=>{const r=read('American Silver Eagle 1 oz fine silver','canadian_maple_leaf');assert.ok(r.warnings.length);assert.equal(context.canUseSmartCameraSuggestion(r),false)});
await test('Replica markings block artwork-based review',()=>{for(const text of ['CANADA fine silver 1 oz REPLICA'])assert.equal(context.canUseSmartCameraSuggestion(read(text,'canadian_maple_leaf')),false)});
await test('Conflicting front and reverse artwork blocks use',()=>{const r=read('American Silver Eagle fine silver 1 oz','unknown',{designSuggestions:[design('american_eagle'),design('canadian_maple_leaf')]});assert.equal(context.canUseSmartCameraSuggestion(r),false);assert.match(r.warnings.join(' '),/different designs/)});
await test('Unavailable model preserves validated OCR',()=>{const r=read('American Silver Eagle 1 oz fine silver','unknown',{designSuggestion:undefined});assert.equal(context.canUseSmartCameraSuggestion(r),true)});
await test('Unknown reverse does not erase known design',()=>{const r=read('Fine gold 1/10 oz CANADA','unknown',{designSuggestions:[design('canadian_maple_leaf'),design('unknown')]});assert.equal(r.designID,'canadian_maple_leaf');assert.equal(r.weight,.1)});
await test('OCR pass selection preserves separate design channel',()=>{const selected=context.selectSmartCameraPhotoEvidence({passes:[],designSuggestion:design('american_eagle')});assert.equal(context.interpretSmartCameraScan(selected).designID,'american_eagle')});
await test('Actual two-photo flow retains artwork with no front text',async()=>{queued.push({lines:[],designSuggestion:design('canadian_maple_leaf')},{text:'CANADA fine gold 1/10 oz',confidence:.95,designSuggestion:design('unknown')});await context.runSmartCameraScan();assert.equal(context.last.designID,'canadian_maple_leaf');assert.equal(context.last.weight,0);await context.runSmartCameraScan(true);assert.equal(context.last.product,'Canadian Gold Maple Leaf');assert.equal(context.last.weight,.1);assert.equal(context.last.sides,2);assert.equal(context.canUseSmartCameraSuggestion(context.last),true)});
await test('Fresh scan never inherits artwork from prior item',async()=>{queued.push({text:'fine silver 1 oz',confidence:.95});await context.runSmartCameraScan();assert.equal(context.last.designID,'');assert.equal(context.last.product,'');assert.equal(context.last.sides,1)});
await test('Actual conflicting photo flow retains failure state',async()=>{queued.push({lines:[],designSuggestion:design('american_eagle')},{text:'CANADA fine gold 1 oz',confidence:.95,designSuggestion:design('canadian_maple_leaf')});await context.runSmartCameraScan();await context.runSmartCameraScan(true);assert.equal(context.canUseSmartCameraSuggestion(context.last),false);assert.match(context.last.warnings.join(' '),/different designs/)});
await test('Every selectable bullion product has scanner catalogue coverage',()=>{
  const metals=vm.runInContext('METALS',context);
  const map=vm.runInContext('PRODUCT_MAP',context);
  const catalog=vm.runInContext('SMART_CAMERA_CATALOG',context);
  for(const metal of metals){
    for(const product of map[metal]||[]){
      assert.ok(catalog.some(item=>item.product===product&&item.metal===metal),metal+': '+product);
    }
  }
});
await test('Fragmented Maple rim OCR recombines product metal and weight',()=>{
  const result=context.selectSmartCameraPhotoEvidence({
    passes:[
      {id:0,observations:[{text:'CANADA 9999',confidence:.86}],confidence:.86},
      {id:1,observations:[{text:'FINE SILVER',confidence:.91}],confidence:.91},
      {id:2,observations:[{text:'1 OZ ARGENT PUR',confidence:.64}],confidence:.64}
    ],
    designSuggestion:design('canadian_maple_leaf')
  });
  const r=context.interpretSmartCameraScan(result);
  assert.equal(r.product,'Canadian Silver Maple Leaf');
  assert.equal(r.metal,'silver');
  assert.equal(r.weight,1);
});
await test('Representative sovereign families resolve across metals',()=>{
  const cases=[
    ['FINE GOLD 1 OZ BRITANNIA','britannia','British Gold Britannia','gold',1],
    ['FINE SILVER 1 OZ BRITANNIA','britannia','British Silver Britannia','silver',1],
    ['PLATINUM 1 OZ BRITANNIA','britannia','British Platinum Britannia','platinum',1],
    ['FINE GOLD 1 OZ KRUGERRAND','krugerrand','South African Gold Krugerrand','gold',1],
    ['FINE SILVER 1 OZ KRUGERRAND','krugerrand','South African Silver Krugerrand','silver',1],
    ['PLATINUM 1 OZ PHILHARMONIKER','philharmonic','Austrian Platinum Philharmonic','platinum',1],
    ['FINE SILVER 1 OZ PANDA','panda','Chinese Silver Panda','silver',1],
    ['FINE GOLD 1 OZ LIBERTAD','libertad','Mexican Gold Libertad','gold',1]
  ];
  for(const [text,id,product,metal,weight] of cases){
    const r=read(text,id);
    assert.equal(r.product,product,text);
    assert.equal(r.metal,metal,text);
    assert.equal(r.weight,weight,text);
  }
});
await test('Generic bars and rounds resolve for all five metals',()=>{
  const cases=[
    ['FINE GOLD 10 OZ','generic_bar','Gold Bar','gold',10],
    ['FINE SILVER 10 OZ','generic_bar','Silver Bar','silver',10],
    ['FINE PLATINUM 1 OZ','generic_bar','Platinum Bar','platinum',1],
    ['FINE PALLADIUM 1 OZ','generic_round','Palladium Round','palladium',1],
    ['FINE COPPER 1 OZ','generic_round','Copper Bullion Round','copper',1]
  ];
  for(const [text,id,product,metal,weight] of cases){
    const r=read(text,id);
    assert.equal(r.product,product,text);
    assert.equal(r.metal,metal,text);
    assert.equal(r.weight,weight,text);
  }
});
await test('Unsupported sovereign bullion still resolves to safe generic coin category',()=>{
  const cases=[
    ['FINE GOLD 1 OZ COIN','Gold Bullion Coin','gold',1],
    ['FINE SILVER 2 OZ COIN','Silver Bullion Coin','silver',2],
    ['FINE PLATINUM 1 OZ COIN','Platinum Bullion Coin','platinum',1],
    ['FINE PALLADIUM 1 OZ COIN','Palladium Bullion Coin','palladium',1],
    ['FINE COPPER 1 OZ COIN','Copper Bullion Coin','copper',1]
  ];
  for(const [text,product,metal,weight] of cases){
    const r=read(text,'generic_coin');
    assert.equal(r.product,product,text);
    assert.equal(r.metal,metal,text);
    assert.equal(r.weight,weight,text);
  }
});
await test('Two-sided Maple ignores generic portrait-side visual disagreement',()=>{
  const r=context.interpretSmartCameraScan({
    lines:['CANADA 9999','FINE SILVER 1 OZ ARGENT PUR'],
    confidence:.9,
    sides:2,
    designSuggestions:[design('generic_coin'),design('canadian_maple_leaf')]
  });
  assert.equal(r.product,'Canadian Silver Maple Leaf');
  assert.equal(r.metal,'silver');
  assert.equal(r.weight,1);
  assert.equal(r.designID,'canadian_maple_leaf');
  assert.equal(r.warnings.length,0);
  assert.equal(context.canUseSmartCameraSuggestion(r),true);
});
await test('Two-sided Maple readable reverse resolves specific false family on portrait side',()=>{
  const r=context.interpretSmartCameraScan({
    lines:['CANADA 9999 FINE SILVER 1 OZ ARGENT PUR'],
    confidence:.9,
    sides:2,
    designSuggestions:[design('britannia'),design('canadian_maple_leaf')]
  });
  assert.equal(r.product,'Canadian Silver Maple Leaf');
  assert.equal(r.designID,'canadian_maple_leaf');
  assert.equal(r.warnings.length,0);
});
await test('Unresolved two-specific-family disagreement still blocks use',()=>{
  const r=context.interpretSmartCameraScan({
    lines:['FINE SILVER 1 OZ'],
    confidence:.9,
    sides:2,
    designSuggestions:[design('britannia'),design('canadian_maple_leaf')]
  });
  assert.ok(r.warnings.some(w=>/different designs/.test(w)));
  assert.equal(context.canUseSmartCameraSuggestion(r),false);
});
console.log(count+' design integration checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
