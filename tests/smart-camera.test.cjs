const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('App/public/index.html','utf8');
const context=vm.createContext({Date,console});
vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('const METAL_SYMBOLS='))+html.slice(html.indexOf('let pendingSmartCameraSuggestion='),html.indexOf('function smartCameraConfidenceLabel')),context);
const scan=(text,extra={})=>context.interpretSmartCameraScan({text,confidence:.95,...extra});
let count=0;function test(name,fn){fn();count++;console.log('PASS',name)}
test('Actual failed Maple OCR resolves silver profile',()=>{const r=scan('CAN 9999 9999 ARGENT PUR SINE STLVERN SILV');assert.equal(r.metal,'silver');assert.equal(r.product,'Canadian Silver Maple Leaf');assert.equal(r.weight,0);assert.equal(r.usable,true)});
test('Complete Maple inscription reads 1 oz',()=>{const r=scan('C A N A D A 9999 FINE SILVER 1 OZ ARGENT PUR');assert.equal(r.product,'Canadian Silver Maple Leaf');assert.equal(r.weight,1)});
test('Warm color and generic labels never determine metal',()=>{const r=scan('',{visualColor:{tone:'golden'},visualLabels:[{identifier:'eagle',confidence:.99}]});assert.equal(r.metal,'');assert.equal(r.product,'');assert.equal(r.usable,false)});
test('Truncated Eagle date is not invented',()=>{const r=scan('11 IN GOD WE TRUST');assert.equal(r.year,null);assert.equal(r.product,'');assert.equal(r.usable,false)});
test('Full date survives even without metal',()=>assert.equal(scan('LIBERTY 2011 IN GOD WE TRUST').year,2011));
test('Combined Eagle reverse and date match',()=>{const r=scan('LIBERTY 2011 IN GOD WE TRUST UNITED STATES OF AMERICA 1 OZ FINE SILVER ONE DOLLAR',{sides:2});assert.equal(r.product,'American Silver Eagle');assert.equal(r.weight,1);assert.equal(r.year,2011);assert.equal(r.sides,2)});
test('Generic silver ounce does not invent Eagle',()=>assert.equal(scan('1 oz fine silver .999').product,''));
test('Generic gold ounce does not invent Eagle or Buffalo',()=>assert.equal(scan('1 oz fine gold .9999').product,''));
test('Fractional gold Eagle does not default to one ounce',()=>assert.equal(scan('American Gold Eagle 1/10 oz fine gold').weight,.1));
test('Gold Eagle without weight leaves it blank',()=>assert.equal(scan('American Gold Eagle').weight,0));
test('Ambiguous Maple metal stays unknown',()=>{const r=scan('Maple Leaf Canada 9999');assert.equal(r.metal,'');assert.equal(r.product,'');assert.equal(r.usable,false)});
test('Gold and silver evidence blocks use',()=>{const r=scan('Fine silver 1 oz Fine gold');assert.equal(r.metal,'');assert.equal(r.usable,false)});
test('Conflicting weights block use and leave weight blank',()=>{const r=scan('Fine silver 1 oz 10 oz');assert.equal(r.weight,0);assert.equal(r.usable,false)});
test('Matched fixed specification disagreement blocks use',()=>{const r=scan('American Silver Eagle 1/2 oz');assert.equal(r.weight,0);assert.equal(r.usable,false)});
test('Plated and replicas block use',()=>{for(const s of ['gold plated','silver replica','gold filled'])assert.equal(scan(s+' 1 oz').usable,false)});
test('Gram and equivalent ounce deduplicate',()=>{const r=scan('fine gold 31.1035 g 1 oz');assert.ok(Math.abs(r.weight-1)<.001);assert.equal(r.warnings.length,0)});
test('Multilingual metal evidence',()=>{for(const text of ['argent pur','plata pura','feinsilber'])assert.equal(scan(text).metal,'silver');assert.equal(scan('oro puro').metal,'gold');assert.equal(scan('platine').metal,'platinum')});
test('Fraction and written ounce parsing',()=>{assert.equal(scan('fine silver ONE TROY OUNCE').weight,1);assert.equal(scan('fine gold 1/4 oz').weight,.25);assert.equal(scan('fine gold ½ oz').weight,.5)});
test('Kilogram parsing',()=>assert.ok(Math.abs(scan('fine silver 1 kg').weight-32.1507466)<.0001));
test('Purity by itself does not determine metal',()=>assert.equal(scan('9999 1 oz').usable,false));
test('Multiple dates leave year blank',()=>assert.equal(scan('fine silver 2011 2012').year,null));
test('Mint contradiction blocks use',()=>assert.equal(scan('American Silver Eagle Perth Mint').usable,false));
test('Historic Britannia purity is not assumed',()=>assert.equal(scan('Britannia Gold 1990').purity,''));
test('Serial retained literally',()=>assert.equal(scan('Valcambi Fine Gold Serial: AB12345 10 g').serial,'AB12345'));
test('Generic half dollar does not invent a historic product',()=>assert.equal(scan('Half dollar 1964').product,''));
test('Canada silver bar is not mistaken for Maple Leaf',()=>assert.equal(scan('Canada Fine Silver 9999 10 oz Bar').product,'Silver Bar'));
test('Split four-digit date is recovered without guessing',()=>assert.equal(scan('LIBERTY 2 0 1 1').year,2011));
test('Conflicting purity blocks use',()=>assert.equal(scan('Fine silver .999 .900 1 oz').usable,false));
test('Fixed product fineness contradiction blocks use',()=>assert.equal(scan('American Silver Eagle .925').usable,false));
test('Unrelated serial digits cannot create purity',()=>assert.equal(scan('Fine gold Serial: AB9999123').purity,''));

const design=(id,extra={})=>({designSuggestion:{id,source:'local-catalogue-v1',...extra}});
test('Artwork alone supplies no product specifications',()=>{const r=scan('',design('american_eagle'));assert.equal(r.designID,'american_eagle');assert.equal(r.product,'');assert.equal(r.metal,'');assert.equal(r.weight,0);assert.equal(r.usable,false)});
test('Eagle artwork plus independent silver uses confirmed catalogue standard',()=>{const r=scan('LIBERTY 2011 IN GOD WE TRUST FINE SILVER',design('american_eagle'));assert.equal(r.product,'American Silver Eagle');assert.equal(r.weight,1);assert.equal(r.inferredWeight,true);assert.equal(r.year,2011)});
test('Similar silver artwork without identifying date cannot assume Eagle weight',()=>{const r=scan('FINE SILVER',design('american_eagle'));assert.equal(r.product,'');assert.equal(r.weight,0)});
test('Gold Walking Liberty artwork cannot become silver Eagle',()=>{const r=scan('LIBERTY 2016 FINE GOLD 1/2 OZ',design('american_eagle'));assert.equal(r.product,'');assert.equal(r.metal,'gold');assert.equal(r.weight,.5)});
test('Fractional Maple artwork never overwrites weight',()=>{const r=scan('CANADA FINE GOLD 1/10 OZ',design('canadian_maple_leaf'));assert.equal(r.product,'Canadian Gold Maple Leaf');assert.equal(r.weight,.1);assert.equal(r.inferredWeight,false)});
test('Maple artwork never invents absent weight',()=>assert.equal(scan('CANADA FINE SILVER',design('canadian_maple_leaf')).weight,0));
test('Extra model specification fields invalidate the suggestion',()=>{const r=scan('FINE SILVER',design('american_eagle',{weight_oz:20}));assert.equal(r.weight,0);assert.equal(r.product,'');assert.ok(r.warnings.length)});
test('Conflicting side artwork blocks use',()=>{const r=scan('FINE SILVER',{designSuggestions:[design('american_eagle').designSuggestion,design('canadian_maple_leaf').designSuggestion]});assert.ok(r.warnings.length);assert.equal(r.designID,'')});
test('Unknown reverse preserves known front design',()=>{const r=scan('FINE SILVER 2011',{designSuggestions:[design('american_eagle').designSuggestion,design('unknown').designSuggestion]});assert.equal(r.product,'American Silver Eagle')});
test('Text and artwork product disagreement blocks use',()=>assert.ok(scan('Maple Leaf CANADA FINE SILVER 1 OZ',design('american_eagle')).warnings.length));
test('Historic half dollar artwork cannot inherit modern Eagle weight',()=>{const r=scan('LIBERTY 1942 HALF DOLLAR',design('walking_liberty_half_dollar'));assert.equal(r.weight,0);assert.equal(r.product,'')});
test('OCR pass selection retains independent design metadata',()=>{const r=context.selectSmartCameraPhotoEvidence({passes:[{observations:[{text:'Fine silver 2011',confidence:.95}],confidence:.95}],...design('american_eagle')});assert.equal(context.interpretSmartCameraScan(r).product,'American Silver Eagle')});

const pass=(text,confidence=.95)=>({observations:text.split('\n').map(text=>({text,confidence})),confidence});
const evidence=passes=>context.selectSmartCameraPhotoEvidence({passes,text:'Legacy union must be ignored',lines:['Fine gold 10 oz'],engineVersion:3,appBuild:'44'});
const interpreted=passes=>context.interpretSmartCameraScan(evidence(passes));
test('A weak alternate crop cannot poison a coherent Maple reading',()=>{
 const passes=[pass('CANADA 9999 FINE SILVER 1 OZ ARGENT PUR'),pass('10 OZ',.4)];
 assert.equal(scan(passes.flatMap(p=>p.observations.map(o=>o.text)).join(' ')).weight,0);
 const selected=evidence(passes);const r=context.interpretSmartCameraScan(selected);
 assert.equal(r.product,'Canadian Silver Maple Leaf');assert.equal(r.weight,1);assert.equal(r.warnings.length,0);
 assert.equal(selected.rejectedPasses,1);
});
test('Compatible crop can recover a date without stacking a different year',()=>{
 const passes=[pass('UNITED STATES OF AMERICA ONE DOLLAR 1 OZ FINE SILVER'),pass('LIBERTY 2011'),pass('2012',.35)];
 const selected=context.selectSmartCameraPhotoEvidence({passes});
 const r=context.interpretSmartCameraScan(selected);
 assert.equal(r.product,'American Silver Eagle');assert.equal(r.year,2011);assert.equal(r.weight,1);
});
test('Equally complete conflicting metals remain blocked',()=>{
 const r=interpreted([pass('Maple Leaf CANADA 9999 FINE SILVER 1 OZ'),pass('Maple Leaf CANADA 9999 FINE GOLD 1 OZ')]);
 assert.equal(r.usable,false);assert.ok(r.warnings.length);
});
test('Equally complete conflicting weights remain blocked',()=>{
 const r=interpreted([pass('CANADA 9999 FINE SILVER 1 OZ ARGENT PUR'),pass('CANADA 9999 FINE SILVER 10 OZ ARGENT PUR')]);
 assert.equal(r.usable,false);assert.equal(r.weight,0);
});
test('Replica markings survive rejection of a weaker crop',()=>{
 const r=interpreted([pass('American Silver Eagle 1 OZ FINE SILVER'),pass('REPLICA FINE GOLD',.4)]);
 assert.equal(r.usable,false);assert.match(r.warnings.join(' '),/replica/i);
});
test('Warnings within a single pass cannot be discarded',()=>{
 assert.equal(interpreted([pass('FINE GOLD FINE SILVER 1 OZ')]).usable,false);
});
test('Subthreshold observations cannot introduce conflicting weights',()=>{
 const p=pass('CANADA 9999 FINE SILVER 1 OZ ARGENT PUR');p.observations.push({text:'10 OZ',confidence:.1});
 assert.equal(interpreted([p]).weight,1);
});
test('Blank passes ignore the legacy flattened text',()=>{
 const r=interpreted([pass(''),{observations:[],confidence:0}]);assert.equal(r.usable,false);assert.equal(r.raw,'');
});
test('Older native engine retains its original result contract',()=>{
 const input={lines:['FINE SILVER 1 OZ'],engineVersion:2};assert.equal(context.selectSmartCameraPhotoEvidence(input),input);
 assert.equal(context.selectSmartCameraPhotoEvidence({cancelled:true}).cancelled,true);
});
test('Malformed pass observations cannot crash a scan',()=>{
 assert.equal(interpreted([null,{observations:[null,{}, {text:42,confidence:1}]}]).usable,false);
});
test('Missing data has a specific failure reason',()=>{
 assert.match(context.smartCameraFailureReason(scan('')),/No readable markings/);
 assert.match(context.smartCameraFailureReason(scan('LIBERTY 2011')),/metal could not/);
 assert.match(context.smartCameraFailureReason(scan('Fine silver')),/weight could not/);
 assert.match(context.smartCameraFailureReason(scan('Fine silver 1 OZ')),/product could not/);
 assert.match(context.smartCameraFailureReason(scan('Fine silver replica 1 OZ')),/replica/i);
});
test('Every existing holding title can be matched literally across all five metals',()=>{
 const map=vm.runInContext('PRODUCT_MAP',context),catalog=vm.runInContext('SMART_CAMERA_CATALOG',context);
 for(const [metal,products] of Object.entries(map))for(const product of products){
  const profile=catalog.find(p=>p.product===product&&p.metal===metal);
  const year=product==='U.S. Copper Cents'?1980:profile.yearMin||2026;
  assert.equal(scan(product+' '+year+' '+metal).product,product,product);
 }
});
test('Native OCR hints cover all holding titles without restricting recognition',()=>{
 const native=fs.readFileSync('App/SceneDelegate.swift','utf8');
 const words=JSON.parse(native.match(/request\.customWords\s*=\s*(\[[\s\S]*?\])/)[1]);
 for(const product of vm.runInContext('Object.values(PRODUCT_MAP).flat()',context))assert.ok(words.includes(product),product);
 assert.match(native,/automaticallyDetectsLanguage = true/);
});
test('Split family inscriptions resolve beyond Canadian and Australian coins',()=>{
 const cases=[['A U S T R A L I A N K O O K A B U R R A FINE SILVER 1 OZ','Australian Silver Kookaburra'],
 ['B R I T A N N I A FINE PLATINUM 1 OZ','British Platinum Britannia'],
 ['K R U G E R R A N D FINE GOLD 1 OZ','South African Gold Krugerrand'],
 ['P H I L H A R M O N I K E R FINE SILVER 1 OZ','Austrian Silver Philharmonic']];
 for(const [text,product] of cases)assert.equal(scan(text).product,product);
});
test('Overlapping literal titles resolve exact denominations',()=>{
 assert.equal(scan('Mexican 2.5 Peso Gold').product,'Mexican 2.5 Peso Gold');
 assert.equal(scan('British Gold Half Sovereign').product,'British Gold Half Sovereign');
 assert.equal(scan('Austrian 100 Corona Gold').product,'Austrian 100 Corona Gold');
});
test('Unicode inscriptions survive normalization even without a matching profile',()=>{
 assert.match(context.normalizeSmartCameraText('中华人民共和国 熊猫 银 2026'),/熊猫 银/);
});
test('Actual historic dime inscriptions need no silver or ounce marking',()=>{
 for(const [year,product] of [[1908,'Barber Dime'],[1944,'Mercury Dime'],[1958,'Roosevelt Silver Dime']]){
  const r=scan('LIBERTY '+year+' UNITED STATES OF AMERICA ONE DIME E PLURIBUS UNUM',{sides:2});
  assert.equal(r.product,product);assert.equal(r.metal,'silver');assert.equal(r.purity,'.900 silver');
  assert.ok(Math.abs(r.weight-2.25/31.1034768)<1e-10);assert.equal(r.inferredWeight,true);assert.equal(r.inferredMetal,true);
  assert.equal(r.usable,true);assert.equal(r.warnings.length,0);
 }
});
test('Actual historic quarters fill fine silver rather than gross coin mass',()=>{
 for(const [year,product] of [[1908,'Barber Quarter'],[1925,'Standing Liberty Quarter'],[1964,'Washington Silver Quarter']]){
  const r=scan('LIBERTY '+year+' UNITED STATES OF AMERICA QUARTER DOLLAR',{sides:2});
  assert.equal(r.product,product);assert.ok(Math.abs(r.weight-5.625/31.1034768)<1e-10);assert.equal(r.warnings.length,0);
 }
});
test('Historic half dollars preserve standard content without inventing commemorative identity',()=>{
 const generic=scan('UNITED STATES OF AMERICA HALF DOLLAR 1925',{sides:2});
 assert.equal(generic.product,'U.S. 90% Silver Coinage');assert.ok(Math.abs(generic.weight-11.25/31.1034768)<1e-10);
 const kennedy=scan('LIBERTY 1964 UNITED STATES OF AMERICA HALF DOLLAR',{sides:2});
 assert.equal(kennedy.product,'1964 Kennedy Half Dollar');assert.equal(kennedy.purity,'.900 silver');
});
test('Missing country, denomination or date never supplies historical metal weight',()=>{
 for(const text of ['ONE DIME 1964','UNITED STATES OF AMERICA ONE DIME','UNITED STATES OF AMERICA 1964',
 'CANADA ONE DIME 1964','AUSTRALIA QUARTER DOLLAR 1964','UNITED STATES OF AMERICA ONE DIME 1880']){
  const r=scan(text);assert.equal(r.weight,0,text);assert.equal(r.inferredMetal,false,text);
 }
});
test('Modern clad dates and unsupported compositions do not inherit 90 percent silver',()=>{
 for(const text of ['UNITED STATES OF AMERICA ONE DIME 1965','UNITED STATES OF AMERICA QUARTER DOLLAR 2026',
 'UNITED STATES OF AMERICA HALF DOLLAR 1967','UNITED STATES OF AMERICA ONE DIME 1944 GOLD',
 'UNITED STATES OF AMERICA ONE DIME 1944 REPLICA','UNITED STATES OF AMERICA QUARTER DOLLAR 1931']){
  const r=scan(text);assert.equal(r.weight,0,text);assert.equal(r.inferredMetal,false,text);
 }
});
test('Ambiguous historic date or denomination cannot supply standard weight',()=>{
 for(const text of ['UNITED STATES OF AMERICA ONE DIME 1964 1965','UNITED STATES OF AMERICA ONE DIME QUARTER DOLLAR 1964'])assert.equal(scan(text).weight,0,text);
 const overlap=scan('UNITED STATES OF AMERICA ONE DIME 1916');
 assert.equal(overlap.product,'U.S. 90% Silver Coinage');assert.ok(overlap.weight>0);
});
test('Historic gross gram inscriptions convert to fine content while conflicting weight stays blank',()=>{
 const prefix='UNITED STATES OF AMERICA QUARTER DOLLAR 1964 ';
 assert.ok(Math.abs(scan(prefix+'6.25 G').weight-5.625/31.1034768)<1e-10);
 const conflict=scan(prefix+'1 OZ');assert.equal(conflict.weight,0);assert.match(conflict.warnings.join(' '),/historical silver specification/);
 assert.equal(scan(prefix+'6.25 G 1 OZ').weight,0);
 assert.match(scan(prefix+'.999 SILVER').warnings.join(' '),/Purity disagrees/);
});
test('Separate native readings combine historic country denomination and date',()=>{
 const selected=context.selectSmartCameraPhotoEvidence({passes:[pass('UNITED STATES OF AMERICA ONE DIME'),pass('LIBERTY 1944')]});
 const r=context.interpretSmartCameraScan(selected);assert.equal(r.product,'Mercury Dime');assert.ok(r.weight>0);assert.equal(r.warnings.length,0);
});
console.log(count+' scanner regression checks passed');
