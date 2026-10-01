const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path='/tmp/benza-real-photo-readings.json';
if(!fs.existsSync(path)){console.log('SKIP actual-photo accuracy gate: no authorized real-photo fixtures');process.exit(0);}
const html=fs.readFileSync('App/public/index.html','utf8');
const context=vm.createContext({console,Date,Number});
vm.runInContext(html.slice(html.indexOf('const GOLD_PRODUCTS='),html.indexOf('const METAL_SYMBOLS='))+html.slice(html.indexOf('const SMART_CAMERA_CATALOG='),html.indexOf('function smartCameraResultRows')),context);
const report=JSON.parse(fs.readFileSync(path,'utf8'));
const photos=report.map(photo=>context.selectSmartCameraPhotoEvidence({passes:photo.passes,confidence:.9}));
const scan=context.interpretSmartCameraScan({
  lines:photos.flatMap(photo=>photo.lines||[]),
  photoEvidence:photos.map(photo=>({lines:photo.lines,confidence:photo.confidence})),
  confidence:Math.max(...photos.map(photo=>photo.confidence)),sides:2
});
console.log(JSON.stringify({product:scan.product,metal:scan.metal,weight:scan.weight,year:scan.year,purity:scan.purity,usable:scan.usable,timing:report.map(p=>({side:p.side,elapsedMs:p.elapsedMs}))}));
assert.equal(scan.product,'Canadian Silver Maple Leaf');
assert.equal(scan.metal,'silver');assert.equal(scan.weight,1);assert.equal(scan.year,2022);
assert.equal(scan.usable,true);assert.equal(scan.warnings.length,0);
console.log('PASS actual coin-photo OCR -> catalogue -> usable holding fields');
