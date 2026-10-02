const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function evaluatePhotoBenchmark(manifest,readings){
 const html=fs.readFileSync('App/public/index.html','utf8');
 const context=vm.createContext({console,Date,Number});
 vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('const METAL_SYMBOLS='))+html.slice(html.indexOf('let pendingSmartCameraSuggestion='),html.indexOf('function smartCameraConfidenceLabel')),context);
 assert.ok(Array.isArray(manifest.cases)&&manifest.cases.length,'Photo benchmark needs cases');
 assert.equal(new Set(manifest.cases.map(c=>c.id)).size,manifest.cases.length,'Duplicate case IDs');
 const fields={},results=[];
 for(const fixture of manifest.cases){
  assert.ok(typeof fixture.id==='string'&&fixture.id.length,'Missing case ID');
  assert.ok(fixture.expected&&Object.keys(fixture.expected).length,'Missing expected fields');
  assert.deepEqual(fixture.photos.map(p=>p.side).sort(),['obverse','reverse'],'Each case needs front and reverse');
  const pair=readings.filter(r=>r.caseId===fixture.id);
  assert.deepEqual(pair.map(p=>p.side).sort(),['obverse','reverse'],'Missing or duplicate photo readings: '+fixture.id);
  const photos=pair.map(photo=>context.selectSmartCameraPhotoEvidence({passes:photo.passes,confidence:.9}));
  const scan=context.interpretSmartCameraScan({lines:photos.flatMap(p=>p.lines||[]),photoEvidence:photos.map(p=>({lines:p.lines,weightLines:p.weightLines,confidence:p.confidence})),confidence:Math.max(...photos.map(p=>p.confidence)),sides:2});
  const checks={};
  for(const [field,expected] of Object.entries(fixture.expected)){
   assert.ok(['product','metal','weight','year','purity','mint','usable'].includes(field),'Unsupported expectation '+field);
   fields[field]??={checked:0,correct:0,blank:0,incorrect:0};fields[field].checked++;
   const actual=scan[field];
   const correct=field==='purity'?String(actual).trim().split(/\s/)[0]===expected:
    typeof expected==='number'?typeof actual==='number'&&Math.abs(actual-expected)<1e-8:actual===expected;
   checks[field]=correct;
   if(correct)fields[field].correct++;
   else if(actual===null||actual===''||(field==='weight'&&actual===0))fields[field].blank++;
   else fields[field].incorrect++;
  }
  const passed=Object.values(checks).every(Boolean)&&(!fixture.expected.usable||scan.warnings.length===0);
  results.push({id:fixture.id,passed,checks,actual:Object.fromEntries(Object.keys(checks).map(key=>[key,scan[key]])),warnings:scan.warnings,timing:pair.map(p=>({side:p.side,elapsedMs:p.elapsedMs,rimElapsedMs:p.rimElapsedMs}))});
 }
 assert.ok(readings.every(r=>manifest.cases.some(c=>c.id===r.caseId)),'Unexpected photo case');
 return {evidence:'actual-photo-ocr-shared-interpreter',coinPairs:results.length,fields,results};
}
module.exports={evaluatePhotoBenchmark};
if(require.main===module){
 const manifest=JSON.parse(fs.readFileSync(process.env.BENZA_SCANNER_PHOTO_MANIFEST||'tests/scanner-photo-cases.json','utf8'));
 // Missing readings fail instead of silently passing a skipped photo test.
 const readings=JSON.parse(fs.readFileSync('/tmp/benza-real-photo-readings.json','utf8'));
 const report=evaluatePhotoBenchmark(manifest,readings);
 fs.writeFileSync('/tmp/benza-scanner-photo-benchmark.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 assert.equal(report.results.filter(r=>!r.passed).length,0,'Real-photo benchmark failures');
}
