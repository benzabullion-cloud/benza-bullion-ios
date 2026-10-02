// Inscription fixtures exercise shared interpretation; these are NOT camera accuracy.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('App/public/index.html','utf8');
const context=vm.createContext({Date,console});
vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('const METAL_SYMBOLS='))+html.slice(html.indexOf('let pendingSmartCameraSuggestion='),html.indexOf('function smartCameraConfidenceLabel')),context);
const read=(text,extra={})=>context.interpretSmartCameraScan({text,sides:2,confidence:.95,...extra});
const cases=[];
const add=(id,text,expected,extra={})=>cases.push({id,text,expected,extra});
for(const [metal,word] of Object.entries({gold:'GOLD',silver:'SILVER',platinum:'PLATINUM',palladium:'PALLADIUM',copper:'COPPER'})){
 const bar=metal==='copper'?'Copper Bullion Bar':word[0]+word.slice(1).toLowerCase()+' Bar';
 const round=metal==='copper'?'Copper Bullion Round':word[0]+word.slice(1).toLowerCase()+' Round';
 add(metal+'-bar','FINE '+word+' 10 OZ BAR',{metal,product:bar,weight:10});
 add(metal+'-round','FINE '+word+' 1 OZ ROUND',{metal,product:round,weight:1});
 add(metal+'-fraction','FINE '+word+' 1/4 OZ ROUND',{metal,product:round,weight:.25});
 add(metal+'-missing-weight','FINE '+word+' BAR',{metal,product:bar,weight:0});
 add(metal+'-conflict','FINE '+word+' 1 OZ 10 OZ BAR',{weight:0,usable:false});
 add(metal+'-replica','FINE '+word+' 1 OZ ROUND REPLICA',{usable:false});
}
for(const [metal,product,purity,denom] of [
 ['silver','Canadian Silver Maple Leaf','9999','5 DOLLARS'],
 ['gold','Canadian Gold Maple Leaf','9999','50 DOLLARS'],
 ['platinum','Canadian Platinum Maple Leaf','9995','50 DOLLARS'],
 ['palladium','Canadian Palladium Maple Leaf','9995','50 DOLLARS']]){
 add(metal+'-maple','CANADA '+purity+' FINE '+metal+' 1 OZ '+denom,{metal,product,weight:1,mint:'Royal Canadian Mint',year:null});
}
add('silver-eagle','UNITED STATES OF AMERICA ONE DOLLAR 1 OZ FINE SILVER 2022',{metal:'silver',product:'American Silver Eagle',weight:1,year:2022});
const pt='UNITED STATES OF AMERICA .9995 PLATINUM 1 OZ. $100';
add('platinum-eagle',pt,{metal:'platinum',product:'American Platinum Eagle',weight:1,mint:'United States Mint'});
add('platinum-eagle-written',pt.replace('$100','ONE HUNDRED DOLLARS'),{product:'American Platinum Eagle',weight:1});
add('platinum-eagle-conflict',pt+' 91 OZ',{product:'American Platinum Eagle',weight:0,usable:false});
add('platinum-maple-conflict','CANADA 9995 PLATINUM 1 OZ 50 DOLLARS 91 OZ',{product:'Canadian Platinum Maple Leaf',weight:0,usable:false});
for(const [id,text] of [
 ['no-country','.9995 PLATINUM 1 OZ $100'],
 ['wrong-country','AUSTRALIA .9995 PLATINUM 1 OZ $100'],
 ['wrong-purity','UNITED STATES OF AMERICA .999 PLATINUM 1 OZ $100'],
 ['wrong-denomination','UNITED STATES OF AMERICA .9995 PLATINUM 1 OZ $25'],
 ['absent-denomination','UNITED STATES OF AMERICA .9995 PLATINUM 1 OZ'],
 ['absent-weight','UNITED STATES OF AMERICA .9995 PLATINUM $100']]){
 add(id,text,{product:''});
}
add('us-platinum-bar',pt+' BAR',{product:'Platinum Bar'});
add('canadian-platinum-bar','CANADA .9995 PLATINUM 1 OZ 50 DOLLARS BAR',{product:'Platinum Bar'});
add('canadian-platinum-round','CANADA .9995 PLATINUM 1 OZ 50 DOLLARS ROUND',{product:'Platinum Round'});
add('platinum-maple-no-denomination','CANADA .9995 PLATINUM 1 OZ',{product:''});
add('platinum-maple-no-weight','CANADA .9995 PLATINUM 50 DOLLARS',{product:'',weight:0});
add('gold-maple-fraction','CANADA 9999 FINE GOLD 1/10 OZ',{product:'Canadian Gold Maple Leaf',weight:.1});
add('britannia','BRITANNIA FINE SILVER 1 OZ',{product:'British Silver Britannia',weight:1});
add('philharmonic','WIENER PHILHARMONIKER FEINSILBER 1 OZ',{product:'Austrian Silver Philharmonic',weight:1});
add('krugerrand','KRUGERRAND FINE GOLD 1 OZ',{product:'South African Gold Krugerrand',weight:1});
add('blank','',{product:'',metal:'',weight:0,usable:false});
add('mixed-metal','FINE GOLD FINE SILVER 1 OZ',{metal:'',usable:false});
const map=vm.runInContext('PRODUCT_MAP',context),catalog=vm.runInContext('SMART_CAMERA_CATALOG',context);
for(const [metal,products] of Object.entries(map))for(const product of products){
 const profile=catalog.find(p=>p.product===product&&p.metal===metal);
 const year=product==='U.S. Copper Cents'?1980:profile.yearMin||2026;
 add('title:'+product,product+' '+year+' '+metal,{product,metal});
}
const fields={},results=[];
for(const fixture of cases){
 const result=read(fixture.text,fixture.extra);const checks={};
 for(const [field,expected] of Object.entries(fixture.expected)){
  fields[field]??={checked:0,correct:0};fields[field].checked++;
  checks[field]=typeof expected==='number'?Math.abs(result[field]-expected)<1e-8:result[field]===expected;
  if(checks[field])fields[field].correct++;
 }
 results.push({id:fixture.id,passed:Object.values(checks).every(Boolean),checks,actual:Object.fromEntries(Object.keys(fixture.expected).map(key=>[key,result[key]]))});
}
const report={evidence:'synthetic-inscriptions-not-camera-accuracy',cases:cases.length,fields,results};
fs.writeFileSync('/tmp/benza-scanner-inscription-benchmark.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({evidence:report.evidence,cases:report.cases,fields,failures:results.filter(r=>!r.passed)},null,2));
assert.equal(results.filter(r=>!r.passed).length,0,'Release inscription benchmark failures');
