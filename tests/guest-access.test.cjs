const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n}',start)+2);}
function context(names){
 const nodes=new Map(),calls=[];const classes=new Set();
 const c={currentUser:null,guestBrowsing:false,authRequestGeneration:0,pendingAccountRoute:null,authMode:'login',activeMarketsTab:'calculator',
 document:{body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},value:'',textContent:''});return nodes.get(id)}},
 setAuthMode:m=>{c.authMode=m},clearAuthPassword:()=>calls.push('clearPassword'),setAuthError:()=>{},
 clearBenzaAccountState:()=>{c.currentUser=null;c.guestBrowsing=false;calls.push('clearAccount')},openMarkets:()=>calls.push('markets'),fetchLivePrices:()=>calls.push('prices'),initSupabase:()=>{},
 benzaRecoveryRedirect:false,supabaseClient:{auth:{}},console:{warn(){}},saveRememberedLogin:()=>calls.push('remember'),onSignedIn:()=>calls.push('signedIn')};
 vm.createContext(c);vm.runInContext(names.map(fn).join('\n'),c);return {c,nodes,calls,classes};
}
test('guest entry clears account state and loads public markets without creating a session',()=>{
 const {c,calls,classes}=context(['continueAsGuest']);c.continueAsGuest();
 assert.equal(c.currentUser,null);assert.equal(c.guestBrowsing,true);assert.equal(c.activeMarketsTab,'market');assert.equal(classes.has('guest-mode'),true);
 assert.deepEqual(calls,['clearAccount','clearPassword','markets','prices']);assert.equal(c.document.getElementById('authScreen').style.display,'none');
});
test('account actions explain sign-in; cancelling returns to public browsing',()=>{
 const {c}=context(['requestAccountAccess','continueAsGuest']);c.guestBrowsing=true;
 assert.equal(c.requestAccountAccess('save alerts','watchlist'),false);assert.equal(c.pendingAccountRoute,'watchlist');assert.match(c.document.getElementById('authStatus').textContent,/save alerts/);
 c.continueAsGuest();assert.equal(c.pendingAccountRoute,null);assert.equal(c.guestBrowsing,true);
 c.currentUser={id:'a'};assert.equal(c.requestAccountAccess(),true);
});
test('late startup session cannot reopen an account after guest choice',async()=>{
 const {c}=context(['restoreSession','continueAsGuest']);let resolve;let out=0;
 c.supabaseClient.auth.getSession=()=>new Promise(r=>resolve=r);c.supabaseClient.auth.signOut=async()=>out++;
 const request=c.restoreSession();c.continueAsGuest();resolve({data:{session:{user:{id:'old'}}}});await request;
 assert.equal(c.currentUser,null);assert.equal(c.guestBrowsing,true);assert.equal(out,1);
});
test('late login completion cannot reopen an account after guest choice',async()=>{
 const {c,calls}=context(['handleAuth','continueAsGuest']);let resolve;let out=0;
 c.document.getElementById('authEmail').value='test@example.test';c.document.getElementById('authPassword').value='test-password';
 c.supabaseClient.auth.signInWithPassword=()=>new Promise(r=>resolve=r);c.supabaseClient.auth.signOut=async()=>out++;
 const request=c.handleAuth();c.continueAsGuest();resolve({data:{user:{id:'a'},session:{}},error:null});await request;
 assert.equal(c.currentUser,null);assert.equal(out,1);assert.equal(calls.includes('signedIn'),false);assert.equal(calls.includes('remember'),false);
});
