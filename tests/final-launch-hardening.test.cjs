const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const html=fs.readFileSync('App/public/index.html','utf8');
function fn(src,name){const re=new RegExp('(?:async )?function '+name+'\\('),a=src.search(re);assert.ok(a>=0,name);return src.slice(a,src.indexOf('\n}',a)+2)}
function run(c,src,names,types=false){vm.createContext(c);for(const name of names)vm.runInContext(types?stripTypeScriptTypes(fn(src,name)):fn(src,name),c);return c}
test('password can be revealed, concealed and cleared; focus and accessibility stay correct',()=>{
 let focused=0;const attrs={};const input={value:'secret123',type:'password',selectionStart:4,selectionEnd:4,focus(){focused++},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}};
 const els={authPassword:input,authPasswordClear:{},authPasswordVisibility:{setAttribute(k,v){attrs[k]=v}},authPasswordEyeSlash:{style:{}}};
 const c=run({document:{getElementById:k=>els[k]}},html,['updateAuthPasswordControls','toggleAuthPasswordVisibility','clearAuthPassword']);
 c.toggleAuthPasswordVisibility();assert.equal(input.type,'text');assert.equal(attrs['aria-label'],'Hide password');assert.equal(attrs['aria-pressed'],'true');assert.equal(input.selectionStart,4);
 c.toggleAuthPasswordVisibility();assert.equal(input.type,'password');c.clearAuthPassword();assert.equal(input.value,'');assert.equal(els.authPasswordClear.disabled,true);assert.equal(focused,3);
});
test('completed payment plus verification outage retains recovery; cancellation removes it',async()=>{
 let state='purchased',marked=false;
 const c=run({console:{error(){}},currentUser:{id:'account-a'},selectedProPlan:'monthly',storeKitProducts:{benza_pro_monthly:{}},isBenzaNativeRuntime:()=>true,nativeStoreKitPlugin:()=>({purchase:async()=>({state})}),document:{getElementById:()=>({dataset:{},textContent:'Subscribe'})},setPendingPurchase(u,p,b){marked=b},verifyNativeStoreTransaction:async()=>{throw Error('Offline')},alert(){},closeProUpgrade(){},renderStoreKitProducts(){}},html,['startNativeProPurchase']);
 await c.startNativeProPurchase();assert.equal(marked,true);state='cancelled';await c.startNativeProPurchase();assert.equal(marked,false);
});
test('sign-out clears account UI and stored session even when auth throws',async()=>{
 let cleared=false;const removed=[];
 const c=run({URL,console:{warn(){}},SUPABASE_URL:'https://project.supabase.co',isBenzaNativeRuntime:()=>false,currentUser:{id:'x'},supabaseClient:{auth:{signOut:async()=>{throw Error('Offline')}}},clearBenzaAccountState(){cleared=true},clearAuthPassword(){},document:{getElementById:()=>({style:{}})},setAuthError(){},localStorage:{removeItem:k=>removed.push(k)}},html,['signOut']);
 await c.signOut();assert.equal(cleared,true);assert.ok(removed.includes('sb-project-auth-token'));
});
const worker=fs.readFileSync('supabase/functions/benza-price-alerts/index.ts','utf8');
function workerContext(rows){return{Number,Set,Error,console:{error(){}},DEFAULT_PREFS:{price_targets:true},supabase:{from(){let filter;const q={select(){return q},order(){return q},eq(k,v){if(k==='user_id')filter=v;return q},range(a,b){return Promise.resolve({data:rows.filter(x=>!filter||x.user_id===filter).slice(a,b+1),error:null})},maybeSingle(){return Promise.resolve({data:null,error:Error('Preferences unavailable')})}};return q}}}}
test('worker visits all 1501 users and values all 1501 holdings; partial quote suppresses value',async()=>{
 const rows=Array.from({length:1501},(_,i)=>({id:i,user_id:'u'+i,metal:'silver',total_oz:1}));
 const c=run(workerContext(rows),worker,['allRows','getActiveUserIds','getPortfolioValue','getPreferences'],true);
 assert.equal((await c.getActiveUserIds()).length,1501);rows.forEach(x=>x.user_id='big');assert.equal(await c.getPortfolioValue('big',{silver:50}),75050);rows[0].metal='gold';assert.equal(await c.getPortfolioValue('big',{silver:50}),null);assert.equal(await c.getPreferences('big'),null);
});
test('all edited inline scripts and deployed worker scripts parse',()=>{
 for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
 for(const name of ['benza-price-alerts','benza-portfolio-snapshots','benza-delete-account']){const src=fs.readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import .*;\n/gm,'');new vm.Script(stripTypeScriptTypes(src));}
});
