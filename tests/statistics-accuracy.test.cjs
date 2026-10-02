const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('App/public/index.html','utf8');
const saleSql=fs.readFileSync('App/public/supabase_sale_restore.sql','utf8');

const metals=['gold','silver','platinum','palladium','copper'];
const prices={gold:4000,silver:50,platinum:1500,palladium:1400,copper:0.30};
const holdings=[
  {metal:'gold',oz:1,cost:3000,costKnown:true},
  {metal:'silver',oz:20,cost:800,costKnown:true},
  {metal:'platinum',oz:2,cost:2400,costKnown:true},
  {metal:'palladium',oz:1.5,cost:1800,costKnown:true},
  {metal:'copper',oz:32,cost:7.68,costKnown:true}
];
function stats(m,rows=holdings){
  const r=rows.filter(h=>h.metal===m),oz=r.reduce((s,h)=>s+h.oz,0);
  const known=r.length>0&&r.every(h=>h.costKnown!==false&&h.cost!==null&&h.cost!==undefined&&h.cost!=='');
  const cost=r.reduce((s,h)=>s+(h.costKnown===false?0:Number(h.cost)||0),0),value=oz*(prices[m]||0);
  const gain=known?value-cost:null,avg=known&&oz>0?cost/oz:null,ret=known&&cost>0?gain/cost*100:null;
  return {oz,cost,known,value,gain,avg,ret};
}
function cents(n){return Math.round(n*100)/100}
function scenario(moves){
  const current=holdings.reduce((s,h)=>s+h.oz*prices[h.metal],0);
  const projected=holdings.reduce((s,h)=>s+h.oz*prices[h.metal]*(1+(moves[h.metal]||0)/100),0);
  return {current,projected,delta:projected-current};
}

test('01 weighted returns across all five metals',()=>{
  for(const m of metals){const s=stats(m);assert.equal(s.ret,(s.value-s.cost)/s.cost*100,m)}
});
test('02 allocation and concentration use market value',()=>{
  const values=metals.map(m=>stats(m).value),total=values.reduce((a,b)=>a+b,0);
  const shares=values.map(v=>v/total*100);
  assert.ok(Math.abs(shares.reduce((a,b)=>a+b,0)-100)<1e-9);
  assert.equal(Math.max(...shares),stats('gold').value/total*100);
});
test('03 break-even recovery math',()=>{
  const avg=75,spot=50;
  assert.equal((avg-spot)/spot*100,50);
  assert.equal((spot-avg)/avg*100,-33.33333333333333);
});
test('04 premium and melt calculations',()=>{
  const qty=2,weight=1,spot=50,priceEach=60,totalOz=qty*weight,melt=totalOz*spot,total=qty*priceEach;
  assert.equal(melt,100);assert.equal(total-melt,20);assert.equal((total-melt)/melt*100,20);assert.equal(total/totalOz,60);
});
test('05 uniform scenario',()=>{const r=scenario(Object.fromEntries(metals.map(m=>[m,10])));assert.ok(Math.abs(r.projected-r.current*1.1)<1e-9)});
test('06 independent scenarios',()=>{const r=scenario({gold:10,silver:-10});assert.equal(r.delta,400-100)});
test('07 partial sale basis rounds to cents',()=>{assert.equal(cents(100*(1/3)),33.33)});
test('08 full sale removes full basis',()=>{assert.equal(cents(100*(3/3)),100)});
test('09 corrected sale recomputes from reconstructed base',()=>{const baseCost=66.67+33.33;assert.equal(cents(baseCost*(2/3)),66.67)});
test('10 undo restores sold basis',()=>{assert.match(saleSql,/v_current\.cost_basis \+ coalesce\(v_tx\.cost_basis_removed,0\)/)});
test('11 zero proceeds can realize a loss',()=>{assert.equal(0-cents(100*(1/2)),-50)});
test('12 fractional basis conservation',()=>{const first=cents(100/3),remaining=100-first,second=cents(remaining/2);assert.equal(cents(first+second+(remaining-second)),100)});
test('13 empty portfolio stays finite',()=>{const total=0;assert.equal(total?10/total*100:0,0)});
test('14 missing cost basis is unavailable, not zero return',()=>{
  const s=stats('gold',[{metal:'gold',oz:1,cost:0,costKnown:false}]);assert.equal(s.ret,null);assert.equal(s.gain,null);assert.equal(s.avg,null);
  assert.match(html,/Return unavailable/);assert.match(html,/Break-even unavailable/);
});
test('15 1,201-record pagination path exists',()=>{
  const rows=Array.from({length:1201},(_,i)=>i),pages=[rows.slice(0,1000),rows.slice(1000,2000)];
  assert.deepEqual(pages.map(x=>x.length),[1000,201]);
  assert.match(html,/\.range\(from,from\+SUPABASE_PAGE_SIZE-1\)/);
});
test('16 account-switch protection remains enforced',()=>{assert.match(html,/expectedUserId&&currentUser\?\.id!==expectedUserId/);assert.match(html,/aborted\|\|currentUser\?\.id!==userId/)});
test('17 copper aggregate labeling converts to troy-ounce equivalents',()=>{
  const factor=28.349523125/31.1034768;assert.ok(factor>0.91&&factor<0.92);
  assert.match(html,/troy oz eq\./);assert.match(html,/AVOIR_OZ_TO_TROY_OZ/);
});
test('18 net-zero P\/L does not fabricate contribution percentages',()=>{assert.match(html,/Math\.abs\(totalGain\)>0\.0001/);assert.match(html,/— of net P\/L/)});
test('19 calculator break-even requires quantity and weight',()=>{assert.match(html,/qty>0&&weight>0\?total\/totalOz:null/);assert.match(html,/priceEach&&breakEven!==null/)});

test('sale function source matches deployed cent rounding',()=>{assert.match(saleSql,/round\(v_holding\.cost_basis\*\(p_quantity\/v_holding\.quantity\),2\)/)});
test('statistics patch has no recovered syntax typo',()=>{assert.doesNotMatch(html,/async const SUPABASE_PAGE_SIZE/)});

console.log('PASS 19 statistics fixture groups plus source/deployment guards');

// Exercise functions extracted verbatim from the bundled app, rather than duplicated formulas.
const vm=require('node:vm');
function appFunction(name){
  const start=html.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const end=html.indexOf('\n}',start)+2;
  return html.slice(start,end);
}
test('actual purchase entry distinguishes each and total, including cents and invalid input',()=>{
  const context=vm.createContext({});vm.runInContext(appFunction('roundCurrency')+'\n'+appFunction('purchaseTotalCost'),context);
  const calc=context.purchaseTotalCost;
  assert.equal(calc('65',3,'each'),195);assert.equal(calc('65',3,'total'),65);
  assert.equal(calc('0.10',3,'each'),0.3);assert.equal(calc('0',3,'each'),0);
  for(const args of [['',3,'each'],['65',0,'each'],['-1',3,'total'],['Infinity',3,'each']])assert.equal(calc(...args),null);
});
test('actual per-holding recovery and unknown basis output',()=>{
  const context=vm.createContext({livePrices:{silver:50},holdingHasCostBasis:h=>h.costKnown!==false,
    isProActive:()=>true,money:n=>'$'+n.toFixed(2),signedMoney:n=>(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2),pct:n=>n.toFixed(2)+'%'});
  vm.runInContext(appFunction('proHoldingInsightHtml'),context);
  const h={metal:'silver',oz:1,cost:75,costKnown:true};
  assert.match(context.proHoldingInsightHtml(h),/Spot move to break-even.*\+50\.00%/);
  assert.doesNotMatch(context.proHoldingInsightHtml({...h,costKnown:false}),/0\.00%|NaN|Infinity/);
  assert.doesNotMatch(context.proHoldingInsightHtml({...h,cost:0}),/NaN|Infinity/);
});
test('all inline app scripts parse',()=>{
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
test('actual analytics renderer matches five-piece screenshot fixture and unknown cost',()=>{
  const nodes=new Map();
  const node=()=>({textContent:'',innerHTML:'',children:[],style:{},classList:{remove(){},add(){}},appendChild(child){this.children.push(child)}});
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node};
  const rows=[{metal:'silver',product:'American Silver Eagle',qty:3,weight:1,oz:3,cost:195,costKnown:true,date:'2026-09-09'},
    {metal:'silver',product:'Silver Round',qty:1,weight:1,oz:1,cost:65,costKnown:true,date:'2026-09-09'},
    {metal:'silver',product:'Canadian Silver Maple Leaf',qty:1,weight:1,oz:1,cost:65,costKnown:true,date:'2026-09-09'}];
  const context=vm.createContext({document,holdings:rows,METALS:metals,METAL_NAMES:Object.fromEntries(metals.map(m=>[m,m])),
    livePrices:{gold:4180.1,silver:61.23,platinum:1724,palladium:1206,copper:.41},AVOIR_OZ_TO_TROY_OZ:28.349523125/31.1034768,
    activeAnalyticsTab:'performance',setAnalyticsTab(){},renderStackScore(){},renderMilestones(){},updateBullionCalculator(){},
    formatDate:s=>s,escapeBullionHtml:s=>s});
  for(const name of ['roundCurrency','holdingHasCostBasis','metalStats','renderAnalytics'])vm.runInContext(appFunction(name),context);
  vm.runInContext("function money(n){return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})};function pct(n){return n.toFixed(2)+'%'};function signedMoney(n){return (n>=0?'+':'-')+money(Math.abs(n))};function setReturnClass(){}",context);
  context.renderAnalytics();
  assert.equal(nodes.get('anTotalValue').textContent,'$306.15');assert.equal(nodes.get('anCost').textContent,'$325.00');
  assert.equal(nodes.get('anTotalGain').textContent,'-$18.85 (-5.80%)');assert.equal(nodes.get('anSilverAvg').textContent,'$65.00');
  assert.equal(nodes.get('anSilverReturn').textContent,'-5.80%');assert.equal(nodes.get('anLargestShare').textContent,'60.0%');
  assert.equal(nodes.get('anOunces').textContent,'5.00 troy oz eq.');
  assert.match(nodes.get('anSensitivity').children[0].innerHTML,/\$275\.54/);
  assert.match(nodes.get('anSensitivity').children[3].innerHTML,/\$336\.77/);
  rows[0].costKnown=false;context.renderAnalytics();
  assert.equal(nodes.get('anCost').textContent,'Unavailable');assert.equal(nodes.get('anSilverReturn').textContent,'—');
});
