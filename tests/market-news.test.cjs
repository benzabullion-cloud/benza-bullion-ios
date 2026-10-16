const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync('App/public/index.html','utf8');
function fixture(fetcher){
 const nodes={newsStatus:{textContent:''},newsRefreshButton:{disabled:false,setAttribute(k,v){this[k]=v}}};
 const storage=new Map();let rendered=[];
 const c=vm.createContext({URL,Date,Set,AbortController,setTimeout,clearTimeout,console:{warn(){}},
  SUPABASE_URL:'https://public.test',document:{getElementById:id=>nodes[id]},fetch:fetcher,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(html.slice(html.indexOf('let lastNewsLoad=0;'),html.indexOf('const BENZA_TIPS=')),c);
 vm.runInContext(html.slice(html.indexOf('function newsSource('),html.indexOf('function syncMarketRailArrows(')),c);
 vm.runInContext(html.slice(html.indexOf('function safeNewsUrl('),html.indexOf('function renderRotatingTips(')),c);
 vm.runInContext(html.slice(html.indexOf('async function loadMarketNews('),html.indexOf('\nfunction setActiveNav(')),c);
 c.renderRotatingTips=()=>{};c.renderNewsCards=items=>{rendered=items};
 return {c,nodes,storage,rendered:()=>rendered};
}
const item=(title='Gold news - Source',link='https://example.com/news',date=new Date().toISOString())=>({title,link,pubDate:date});
const response=(items=[item()],extra={})=>({ok:true,json:async()=>({status:'ok',items,fetched_at:new Date().toISOString(),...extra})});
test('Guest public request, deduplication, manual refresh and in-flight locking',async()=>{
 let calls=0,finish;const f=fixture(async(url,opts)=>{
  calls++;assert.match(url,/benza-market-news$/);assert.equal(opts.credentials,'omit');
  assert.equal(opts.headers,undefined);assert.ok(opts.signal);
  if(calls===1)return new Promise(r=>finish=r);return response();
 });
 const a=f.c.loadMarketNews(),b=f.c.loadMarketNews(true);
 assert.equal(calls,1);assert.equal(f.nodes.newsRefreshButton.disabled,true);
 finish(response([item(),item(),item('unsafe','javascript:alert(1)'),item('old','https://example.com/old','2020-01-01')]));
 await Promise.all([a,b]);assert.equal(f.rendered().length,1);
 assert.match(f.nodes.newsStatus.textContent,/Live headlines/);assert.equal(f.nodes.newsRefreshButton.disabled,false);
 await f.c.loadMarketNews();assert.equal(calls,1);
 await f.c.loadMarketNews(true);assert.equal(calls,2);
});
test('Offline, HTTP errors and empty responses show saved data without refreshing its age',async()=>{
 let mode='success';const f=fixture(async()=>{
  if(mode==='offline')throw Error('offline');if(mode==='http')return {ok:false};
  return response(mode==='empty'?[]:[item('Gold - Silver - Source')]);
 });
 await f.c.loadMarketNews(true);const cached=[...f.storage.values()][0];
 for(mode of ['offline','http','empty']){
  await f.c.loadMarketNews(true);assert.match(f.nodes.newsStatus.textContent,/saved headlines/);
  assert.equal(f.rendered()[0].title,'Gold - Silver');
  assert.equal([...f.storage.values()][0],cached);assert.equal(f.nodes.newsRefreshButton.disabled,false);
 }
});
test('Stale upstream never advances last success or masks stale status; next entry retries',async()=>{
 let calls=0;const fetched_at=new Date(Date.now()-3600000).toISOString();
 const f=fixture(async()=>{calls++;return response([item()],{stale:true,fetched_at})});
 await f.c.loadMarketNews();assert.match(f.nodes.newsStatus.textContent,/saved headlines.*1 hr/);
 await f.c.loadMarketNews();assert.equal(calls,2);
 assert.equal(JSON.parse([...f.storage.values()][0]).savedAt,Date.parse(fetched_at));
});
test('Expired or corrupt on-device cache becomes explicit guidance and timeout releases the button',async()=>{
 const f=fixture(async()=>{throw Error('unavailable')});
 f.storage.set('benzaMarketNewsCacheV70',JSON.stringify({savedAt:Date.now()-8*86400000,items:[item()]}));
 await f.c.loadMarketNews(true);assert.match(f.nodes.newsStatus.textContent,/guidance/);
 f.storage.set('benzaMarketNewsCacheV70','corrupt');
 f.c.setTimeout=fn=>setTimeout(fn,1);
 f.c.fetch=(_url,opts)=>new Promise((_r,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('timeout'))));
 await f.c.loadMarketNews(true);assert.match(f.nodes.newsStatus.textContent,/guidance/);
 assert.equal(f.nodes.newsRefreshButton.disabled,false);
});
