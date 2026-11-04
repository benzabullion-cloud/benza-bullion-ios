const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
const start=html.indexOf('const BENZA_SOCIAL_CALLBACK=');
const end=html.indexOf('async function handleAuth(){',start);
function harness({callback='com.benzabullion.app.auth://oauth/callback?code=abc',cancelled=false}={}){
 const buttons=[{},{}],status={},calls=[],panel={},context={
  URL,currentUser:null,guestBrowsing:false,authRequestGeneration:0,authMode:'login',
  SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'test',
  handleAuth(){},initSupabase(){},clearAuthPassword(){},onSignedIn(){calls.push('signedIn')},
  setAuthError(value){if(value)calls.push(value)},
  document:{getElementById:id=>id==='socialAuth'?panel:status,querySelectorAll:()=>buttons},
  isBenzaNativeRuntime:()=>true,
  supabaseClient:{auth:{setSession:async tokens=>{calls.push(['session',tokens]);return {data:{user:{id:'existing'}}}}}},
  window:{Capacitor:{Plugins:{BenzaSocialAuth:{
   status:async()=>({enabled:true}),authorize:async()=>({url:callback,cancelled})
  }}},supabase:{createClient(_url,_key,opts){
   assert.equal(opts.auth.flowType,'pkce');
   assert.equal(opts.auth.persistSession,false);
   return {auth:{
    signInWithOAuth:async opts=>{calls.push(['provider',opts.provider]);assert.equal(opts.options.skipBrowserRedirect,true);return {data:{url:'https://example.test/auth/v1/authorize'}}},
    exchangeCodeForSession:async code=>{calls.push(['exchange',code]);return {data:{session:{access_token:'access',refresh_token:'refresh'}}}}
   }};
  }}}
 };
 vm.createContext(context);
 vm.runInContext(html.slice(start,end),context);
 return {context,calls,panel,buttons,status};
}
test('hidden until the native build enables sign-in; recovery hides the buttons',async()=>{
 const {context,panel,calls}=harness();
 context.updateSocialAuthButtons();
 assert.equal(panel.hidden,true);
 await context.handleSocialAuth('google');
 assert.equal(calls.length,0);
 await context.configureSocialAuth();
 assert.equal(panel.hidden,false);
 context.authMode='recovery';
 context.updateSocialAuthButtons();
 assert.equal(panel.hidden,true);
});
test('provider sign-in exchanges a code and adopts the same Supabase user ID',async()=>{
 const {context,calls,buttons,status}=harness();
 await context.configureSocialAuth();
 await context.handleSocialAuth('google');
 assert.deepEqual(calls.map(x=>Array.isArray(x)?x[0]:x),['provider','exchange','session','signedIn']);
 assert.equal(context.currentUser.id,'existing');
 assert.ok(buttons.every(x=>!x.disabled));
 assert.equal(status.textContent,'');
});
test('cancel, foreign callbacks and repeated codes never install a session',async()=>{
 for(const params of [{cancelled:true},{callback:'https://example.test/oauth/callback?code=abc'},{callback:'com.benzabullion.app.auth://oauth/callback?code=a&code=b'}]){
  const {context,calls,buttons}=harness(params);
  await context.configureSocialAuth();
  await context.handleSocialAuth('apple');
  assert.equal(context.currentUser,null);
  assert.ok(!calls.some(x=>x[0]==='exchange'));
  assert.ok(buttons.every(x=>!x.disabled));
 }
});
test('choosing guest before the provider returns cannot reopen an account',async()=>{
 const {context,calls}=harness();
 let complete,started;
 const ready=new Promise(r=>started=r);
 context.window.Capacitor.Plugins.BenzaSocialAuth.authorize=()=>new Promise(r=>{complete=r;started()});
 await context.configureSocialAuth();
 const pending=context.handleSocialAuth('google');
 await ready;
 context.guestBrowsing=true;
 context.authRequestGeneration++;
 complete({url:'com.benzabullion.app.auth://oauth/callback?code=abc'});
 await pending;
 assert.deepEqual(calls,[['provider','google']]);
 assert.equal(context.currentUser,null);
});
