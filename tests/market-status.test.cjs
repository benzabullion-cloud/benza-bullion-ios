const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('App/public/index.html','utf8');
const nodes={liveFeedStatus:{classList:{remove(){},add(){}},textContent:''},marketPauseNote:{hidden:true,textContent:''},marketRefreshButton:{disabled:false,setAttribute(k,v){this[k]=v}}};
const c=vm.createContext({Date,Intl,console,document:{getElementById:id=>nodes[id]},lastMarketFeedStatusState:{},marketRefreshInFlight:null});
vm.runInContext(html.slice(html.indexOf('function metalsMarketPausedCentral'),html.indexOf('function setAuthError')),c);
for(const [instant,paused] of [['2026-10-02T20:59:59Z',false],['2026-10-02T21:00:00Z',true],['2026-10-04T21:59:59Z',true],['2026-10-04T22:00:00Z',false],['2026-10-05T21:30:00Z',true],['2026-10-05T22:00:00Z',false]])assert.equal(c.metalsMarketPausedCentral(new Date(instant)),paused,instant);
assert.match(c.marketPauseExplanation(new Date('2026-10-02T23:10:00Z')),/Weekend.*Sun.*5:00 PM CT.*1d 22h 50m/);
assert.match(c.marketPauseExplanation(new Date('2026-10-05T21:30:00Z')),/Daily.*30m/);
assert.match(c.marketPauseExplanation(new Date('2026-10-30T23:00:00Z')),/Sun.*5:00 PM CT.*2d/); // Fall DST weekend adds an hour.
assert.match(c.marketPauseExplanation(new Date('2026-03-07T00:00:00Z')),/Sun.*5:00 PM CT.*1d 22h/); // Spring DST removes an hour.
const data={source_updated_at:{silver:'2026-10-02T21:00:00Z'}};
c.renderLiveFeedStatus(data,{date:new Date('2026-10-02T23:10:00Z')});assert.equal(nodes.marketPauseNote.hidden,false);assert.match(nodes.liveFeedStatus.textContent,/Market paused.*Last quote/);
c.renderLiveFeedStatus(data,{date:new Date('2026-10-05T18:00:00Z')});assert.equal(nodes.marketPauseNote.hidden,true);assert.equal(nodes.marketPauseNote.textContent,'');
c.renderLiveFeedStatus(data,{problem:true});assert.match(nodes.marketPauseNote.textContent,/recovery time is unknown/);assert.equal(c.lastMarketFeedStatusState.problem,true);
c.renderLiveFeedStatus(data,{offline:true});assert.match(nodes.marketPauseNote.textContent,/reconnect/);assert.doesNotMatch(nodes.marketPauseNote.textContent,/Expected/);
c.renderLiveFeedStatus({...data,stale_metals:['silver']});assert.match(nodes.liveFeedStatus.textContent,/Quotes delayed/);assert.match(nodes.marketPauseNote.textContent,/cached/);
vm.runInContext(html.slice(html.indexOf('async function fetchLivePrices'),html.indexOf('async function performMarketPriceRefresh')),c);
(async()=>{
 let calls=0,finish;
 c.performMarketPriceRefresh=()=>{calls++;return new Promise(resolve=>{finish=resolve})};
 const first=c.fetchLivePrices(),second=c.fetchLivePrices();assert.equal(calls,1);assert.equal(nodes.marketRefreshButton.disabled,true);assert.equal(nodes.marketRefreshButton['aria-busy'],'true');
 finish();await Promise.all([first,second]);assert.equal(nodes.marketRefreshButton.disabled,false);assert.equal(nodes.marketRefreshButton['aria-busy'],'false');
 c.performMarketPriceRefresh=()=>Promise.reject(Error('feed failed'));await assert.rejects(c.fetchLivePrices(),/feed failed/);assert.equal(nodes.marketRefreshButton.disabled,false);assert.equal(c.marketRefreshInFlight,null);
 console.log('PASS market boundaries, DST reopening estimates, status transitions, cached/offline failures and refresh deduplication');
})().catch(e=>{console.error(e);process.exitCode=1});
