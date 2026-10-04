const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n}',start)+2);}
function ctx(names){
 const nodes=new Map(),messages=[];
 const c={currentUser:{id:'a'},supabaseClient:{},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'',dataset:{},style:{},classList:{remove(){},add(){}},setAttribute(){}});return nodes.get(id);}},console:{warn(){},error(){}},alert:m=>messages.push(m),confirm:()=>true,setButtonBusy:(b,busy)=>{b.disabled=busy},friendlyErrorMessage:(e,f)=>f,isAuthSessionError:()=>false,handleExpiredSession:async()=>{},Set,Map,Number,Date,Math,Promise,setTimeout,AbortSignal};
 c.nodes=nodes;c.messages=messages;vm.createContext(c);vm.runInContext(names.map(fn).join('\n'),c);return c;
}
test('CSV and JSON exports both use the native bridge with cancellation and failure recovery',async()=>{
 const c=ctx(['deliverExportFile','deliverProReport','exportBenzaData']);c.isBenzaNativeRuntime=()=>true;
 const exports=[];c.window={Capacitor:{Plugins:{BenzaExport:{shareFile:async p=>{exports.push(p);return {completed:true};}}}}};
 c.fetchAllSupabaseRows=async()=>({data:[]});c.supabaseClient={from:()=>({select:()=>({maybeSingle:async()=>({data:null})})})};c.accountDisplayName=()=> 'Bullion Builder';c.setAccountSettingsStatus=m=>{c.status=m};
 await c.deliverProReport('csv');await c.exportBenzaData();assert.equal(exports.length,2);assert.match(exports[0].filename,/\.csv$/);assert.match(exports[1].filename,/\.json$/);assert.equal(JSON.parse(exports[1].text).account.id,'a');assert.match(c.status,/shared or saved/);
 c.window.Capacitor.Plugins.BenzaExport.shareFile=async()=>({completed:false});await c.exportBenzaData();assert.equal(c.status,'Export cancelled.');
 c.window.Capacitor.Plugins.BenzaExport.shareFile=async()=>{throw Error('Unavailable')};await c.exportBenzaData();assert.equal(c.nodes.get('exportDataButton').disabled,false);assert.match(c.status,/try again/);
});
test('failed alert writes retain the old target and failed removals retain the alert',async()=>{
 const c=ctx(['saveMarketsWatchItem','removeMarketsWatchItem']);c.watchlistMutationBusy=false;c.marketsWatchDirection='higher';c.MARKETS_META={gold:{}};c.isProActive=()=>true;c.benzaWatchlist=[{metal:'gold',target:100,direction:'higher'}];c.document.getElementById('marketsWatchMetal').value='gold';c.document.getElementById('marketsWatchTarget').value='200';let persisted=0;c.persistBenzaWatchlist=()=>persisted++;c.renderMarketsWatchlist=()=>{};
 c.syncWatchItemToSupabase=async()=>{throw Error('Offline')};c.removeWatchItemFromSupabase=c.syncWatchItemToSupabase;
 await c.saveMarketsWatchItem();assert.equal(c.benzaWatchlist[0].target,100);assert.equal(persisted,0);assert.equal(c.nodes.get('marketsWatchTarget').value,'200');assert.equal(c.watchlistMutationBusy,false);
 await c.removeMarketsWatchItem('gold','higher');assert.equal(c.benzaWatchlist.length,1);assert.equal(c.messages.length,2);
});
test('alert writes cannot overlap or modify another account after a delayed response',async()=>{
 const c=ctx(['saveMarketsWatchItem']);c.watchlistMutationBusy=false;c.marketsWatchDirection='higher';c.MARKETS_META={gold:{}};c.isProActive=()=>true;c.benzaWatchlist=[];c.document.getElementById('marketsWatchMetal').value='gold';c.document.getElementById('marketsWatchTarget').value='200';c.persistBenzaWatchlist=()=>{throw Error('Unexpected cache write')};c.renderMarketsWatchlist=()=>{};
 let resolve,count=0;c.syncWatchItemToSupabase=()=>{count++;return new Promise(r=>resolve=r)};
 const request=c.saveMarketsWatchItem();await c.saveMarketsWatchItem();assert.equal(count,1);c.currentUser={id:'b'};resolve();await request;assert.equal(c.benzaWatchlist.length,0);assert.equal(c.nodes.get('marketsWatchTarget').value,'200');
});
test('sale uses holding identity across refresh/reordering and cannot submit twice',async()=>{
 const c=ctx(['saleBaseState','recordHoldingSale']);c.saleMutationBusy=false;c.saleHoldingIndex=0;c.saleHoldingId='gold';c.editingSaleId=null;c.holdings=[{id:'silver',qty:10,cost:100,weight:1},{id:'gold',qty:2,cost:4000,weight:1}];c.document.getElementById('saleQuantity').value='1';c.document.getElementById('saleProceeds').value='2500';c.updateSalePreview=()=>{};c.closeSaleModal=()=>{};c.refreshAfterSaleCorrection=async()=>{};
 let resolve,writes=[];c.supabaseClient.rpc=(name,args)=>{writes.push(args);return new Promise(r=>resolve=r)};
 const request=c.recordHoldingSale();await c.recordHoldingSale();assert.equal(writes.length,1);assert.equal(writes[0].p_holding_id,'gold');c.currentUser={id:'b'};resolve({});await request;assert.equal(c.messages.length,0);assert.equal(c.saleMutationBusy,false);
});
test('sale and undo transport errors recover controls and show a retry message',async()=>{
 const c=ctx(['recordHoldingSale','undoRecordedSale']);c.saleMutationBusy=false;c.editingSaleId='sale';c.saleBaseState=()=>({baseQty:2,holding:{id:'h'}});c.saleById=()=>({quantity:1});c.updateSalePreview=()=>{};c.document.getElementById('saleQuantity').value='1';c.document.getElementById('saleProceeds').value='100';c.supabaseClient.rpc=async()=>{throw Error('Offline')};
 await c.recordHoldingSale();await c.undoRecordedSale();assert.equal(c.messages.length,2);assert.equal(c.saleMutationBusy,false);assert.equal(c.nodes.get('saleUndoBtn').disabled,false);
});
test('delete removes the requested ID after reordering and ignores another account response',async()=>{
 const c=ctx(['deleteHolding']);c.holdingDeletes=new Set();c.holdings=[{id:'first'},{id:'second'}];c.currentPortfolioMarketValue=()=>0;c.removePrivateHoldingFiles=async()=>{};c.rebaseLiveChartForPortfolioFlow=()=>{};c.renderHoldings=()=>{};c.loadActivityFromSupabase=async()=>{};c.recordPortfolioSnapshot=async()=>{};
 let resolve,count=0;c.supabaseClient.rpc=()=>{count++;return new Promise(r=>resolve=r)};
 const request=c.deleteHolding(0);await c.deleteHolding(0);assert.equal(count,1);c.holdings.reverse();resolve({});await request;assert.equal(c.holdings[0].id,'second');assert.equal(c.holdings.length,1);
 const other=c.deleteHolding(0);c.currentUser={id:'b'};c.holdings=[{id:'b-holding'}];resolve({});await other;assert.equal(c.holdings[0].id,'b-holding');
});
test('portfolio history reads all pages with date filter and ignores obsolete range replies',async()=>{
 const c=ctx(['fetchAllSupabaseRows','loadPortfolioSnapshots']);c.SUPABASE_PAGE_SIZE=1000;c.activeChartRange='ALL';c.chartSnapshots=[];c.chartRangeStart=()=>null;c.cleanPortfolioHistory=p=>p;c.adjustPortfolioHistoryForFlows=p=>p;c.downsamplePortfolioHistory=p=>p;c.drawPortfolioRangeChart=()=>{};
 const rows=Array.from({length:1501},(_,i)=>({captured_at:new Date(2026,0,1,0,i).toISOString(),total_value:i}));const calls=[];
 c.supabaseClient.from=()=>{let from,to;return {select(){return this},order(column){calls.push(column);return this},gte(){return this},range(a,b){from=a;to=b;return this},then(resolve){return Promise.resolve({data:rows.slice(from,to+1)}).then(resolve)}}};
 await c.loadPortfolioSnapshots('ALL');assert.equal(c.chartSnapshots.length,1501);assert.equal(c.chartSnapshots.at(-1).value,1500);assert.ok(calls.includes('id'));
 let resolve;c.fetchAllSupabaseRows=()=>new Promise(r=>resolve=r);const request=c.loadPortfolioSnapshots('ALL');c.activeChartRange='1D';c.chartSnapshots=[];resolve({data:rows});await request;assert.equal(c.chartSnapshots.length,0);
});
test('late private photo and receipt responses do not overwrite the next holding preview',async()=>{
 const c=ctx(['hydrateExistingAttachmentPreviews']);c.scannerPreviewGeneration=1;c.renderScannerPhotoPreviews=()=>{};let shown=[];c.setAttachmentPreview=(...p)=>shown.push(p);let resolve;c.signedHoldingFileUrl=()=>new Promise(r=>resolve=r);
 const photo=c.hydrateExistingAttachmentPreviews({photoPath:'old'});c.scannerPreviewGeneration++;resolve('old-url');await photo;assert.equal(shown.length,0);
 const receipt=c.hydrateExistingAttachmentPreviews({receiptPath:'old.pdf'});c.currentUser={id:'b'};resolve('old-url');await receipt;assert.equal(shown.length,0);
});
test('account initialization stops after sign-out while holdings are loading and reuses auth client',async()=>{
 const c=ctx(['onSignedIn','initSupabase']);c.updateWelcomeBack=()=>{};c.handleBenzaDeepLink=()=>{};let resolve;c.loadHoldingsFromSupabase=()=>new Promise(r=>resolve=r);c.loadBenzaEntitlement=()=>{throw Error('Must not continue after account changes')};
 const request=c.onSignedIn();c.currentUser=null;resolve();await request;c.window={supabase:{createClient:()=>{throw Error('Must not recreate client')}}};c.initSupabase();
});
test('an old account deletion response cannot sign out or clear the next account',async()=>{
 const c=ctx(['deleteBenzaAccount']);c.prompt=()=> 'DELETE';c.setAccountSettingsStatus=()=>{};c.SUPABASE_PUBLISHABLE_KEY='public';c.SUPABASE_URL='https://example.test';let resolve,signouts=0;c.supabaseClient.auth={getSession:async()=>({data:{session:{access_token:'token'}}}),signOut:async()=>signouts++};c.fetch=()=>new Promise(r=>resolve=r);
 const request=c.deleteBenzaAccount();await new Promise(r=>setImmediate(r));c.currentUser={id:'b'};resolve({ok:true,json:async()=>({success:true})});await request;assert.equal(signouts,0);assert.equal(c.currentUser.id,'b');assert.equal(c.nodes.get('deleteAccountButton').disabled,false);
});
test('a slow LIVE chart restore cannot overwrite the newly selected chart range',async()=>{
 const c=ctx(['loadLivePortfolioSnapshots']);c.activeChartRange='LIVE';c.restoreLiveChartPoints=()=>{};let resolve;c.loadLiveChartFromCloud=()=>new Promise(r=>resolve=r);c.holdingsLoaded=true;c.currentPortfolioMarketValue=()=>{throw Error('Obsolete LIVE view must not continue')};
 const request=c.loadLivePortfolioSnapshots();c.activeChartRange='1M';resolve();await request;
});
