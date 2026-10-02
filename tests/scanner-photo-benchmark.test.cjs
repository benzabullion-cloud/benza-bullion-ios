// Test benchmark accounting with synthetic OCR, not camera pixels.
const assert=require('node:assert/strict'),{evaluatePhotoBenchmark}=require('./real-photo-gate.cjs');
const fixture=(id,expected)=>({id,photos:[{side:'obverse'},{side:'reverse'}],expected});
const photo=(caseId,side,text)=>({caseId,side,passes:[{id:0,confidence:.95,observations:[{text,confidence:.95}]}]});
const manifest={cases:[fixture('silver',{metal:'silver',product:'American Silver Eagle',weight:1,year:2022,usable:true}),fixture('copper',{metal:'copper',product:'Copper Bullion Bar',weight:10,usable:true})]};
const readings=[photo('silver','obverse','LIBERTY 2022'),photo('silver','reverse','UNITED STATES OF AMERICA ONE DOLLAR 1 OZ FINE SILVER'),photo('copper','obverse',''),photo('copper','reverse','FINE COPPER 10 OZ BAR')];
const good=evaluatePhotoBenchmark(manifest,readings);
assert.equal(good.coinPairs,2);assert.ok(good.results.every(r=>r.passed));assert.equal(good.fields.weight.correct,2);
const wrong={cases:[fixture('copper',{metal:'gold',product:'Gold Bar',weight:1,year:2022})]};
const bad=evaluatePhotoBenchmark(wrong,readings.filter(r=>r.caseId==='copper'));
assert.equal(bad.fields.metal.incorrect,1);assert.equal(bad.fields.weight.incorrect,1);assert.equal(bad.fields.year.blank,1);assert.equal(bad.results[0].passed,false);
assert.throws(()=>evaluatePhotoBenchmark(manifest,readings.slice(1)),/Missing or duplicate/);
assert.throws(()=>evaluatePhotoBenchmark({cases:[manifest.cases[0],manifest.cases[0]]},readings),/Duplicate case/);
assert.throws(()=>evaluatePhotoBenchmark(manifest,[...readings,readings[0]]),/Missing or duplicate/);
assert.throws(()=>evaluatePhotoBenchmark({cases:[]},[]),/needs cases/);
console.log('PASS photo benchmark groups pairs, distinguishes wrong fields from blanks, and fails missing/duplicate evidence');
