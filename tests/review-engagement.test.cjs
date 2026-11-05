const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('App/public/index.html','utf8');
const code=html.slice(html.indexOf("const BENZA_REVIEW_KEY="),html.indexOf('function savedLoginPlugin(){'));
const day=86400000,start=Date.UTC(2026,0,1);
function setup(){
 const store=new Map(),timers=new Map(),events=[];let id=0;
 const c={Date,currentUser:{id:'one'},guestBrowsing:false,window:{Capacitor:{isNativePlatform:()=>true,Plugins:{BenzaReviews:{requestReview:async()=>{events.push('request');return {requested:true};},openReviewPage:async()=>{events.push('manual');return {opened:true};}}}}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{visibilityState:'visible',addEventListener(){},getElementById:()=>({style:{display:'none'}}),querySelector:s=>s.includes('.nav ')?{}:null},setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i),alert:()=>events.push('error')};
 vm.createContext(c);vm.runInContext(code,c);
 return {c,store,timers,events};
}
test('waits seven days, five distinct active days, and three successful adds',()=>{
 const {c}=setup();
 c.recordBenzaReviewVisit(start);c.recordBenzaReviewVisit(start+1000);
 assert.equal(c.readBenzaReviewState().days.length,1);
 for(let i=1;i<5;i++)c.recordBenzaReviewVisit(start+i*day);
 let state=c.readBenzaReviewState();state.adds=3;
 assert.equal(c.benzaReviewEligible(state,start+6*day),false);
 assert.equal(c.benzaReviewEligible(state,start+7*day),true);
 state.adds=2;assert.equal(c.benzaReviewEligible(state,start+7*day),false);
 state.adds=3;state.days=state.days.slice(0,4);assert.equal(c.benzaReviewEligible(state,start+7*day),false);
});
test('six-month cooldown includes manual review page visits',async()=>{
 const {c,events}=setup();c.recordBenzaReviewVisit(start);
 const state=c.readBenzaReviewState();state.days=['1','2','3','4','5'];state.adds=3;c.writeBenzaReviewState(state);
 await c.openBenzaReviewPage();assert.deepEqual(events,['manual']);
 const saved=c.readBenzaReviewState();assert.equal(c.benzaReviewEligible(saved,saved.lastRequest+179*day),false);
 assert.equal(c.benzaReviewEligible(saved,saved.lastRequest+180*day),true);
});
test('background, changed account, guest and overlays suppress pending requests',async()=>{
 const {c,events}=setup();c.recordBenzaReviewVisit(start);
 const state=c.readBenzaReviewState();Object.assign(state,{days:['1','2','3','4','5'],adds:3});c.writeBenzaReviewState(state);
 c.document.visibilityState='hidden';await c.requestBenzaReviewWhenQuiet('one');
 c.document.visibilityState='visible';await c.requestBenzaReviewWhenQuiet('other');
 c.guestBrowsing=true;await c.requestBenzaReviewWhenQuiet('one');c.guestBrowsing=false;
 c.document.querySelector=()=>({});await c.requestBenzaReviewWhenQuiet('one');
 assert.deepEqual(events,[]);
 c.document.querySelector=s=>s.includes('.nav ')?{}:null;
 await c.requestBenzaReviewWhenQuiet('one');await c.requestBenzaReviewWhenQuiet('one');
 assert.deepEqual(events,['request']);
});
test('guests and unavailable storage never become eligible or schedule a popup',()=>{
 const {c,timers}=setup();c.guestBrowsing=true;c.recordBenzaReviewHoldingAdded();assert.equal(c.readBenzaReviewState(),null);
 c.guestBrowsing=false;c.localStorage.setItem=()=>{throw Error('unavailable')};c.recordBenzaReviewHoldingAdded();assert.equal(timers.size,0);
});
test('only new holding success schedules engagement, not edit or sign-in',()=>{
 const save=html.slice(html.indexOf('async function saveHolding(){'),html.indexOf("let activeChartRange='1D'"));
 assert.equal((save.match(/recordBenzaReviewHoldingAdded\(\)/g)||[]).length,1);
 assert.ok(save.indexOf('recordBenzaReviewHoldingAdded()')>save.indexOf("rpc('benza_add_holding_details'"));
 const swift=fs.readFileSync('App/SceneDelegate.swift','utf8');
 assert.match(swift,/AppStore.requestReview\(in: scene\)/);
 assert.match(swift,/scene.activationState == .foregroundActive/);
 assert.match(swift,/action=write-review/);
});
