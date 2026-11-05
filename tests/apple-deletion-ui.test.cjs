const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
const source=html.slice(html.indexOf('async function deleteBenzaAccount(){'),html.indexOf("let activeSettingsTab='settings'"));
function harness(verified){
 const requests=[],messages=[],button={disabled:false};
 const context={currentUser:{id:'owner',identities:[{provider:'apple'}]},authRequestGeneration:0,
  SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEY:'public',
  supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'existing-session'}}})}},
  beginSocialOAuth:async provider=>{assert.equal(provider,'apple');return verified;},
  document:{getElementById:()=>button},confirm:()=>true,prompt:()=> 'DELETE',
  setAccountSettingsStatus:message=>messages.push(message),console:{error(){}},
  fetch:async(url,request)=>{requests.push(request);return {ok:false,json:async()=>({error:'stop before deleting real data'})};}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,requests,messages,button};
}
test('cancelled, different-account and incomplete Apple verification never sends deletion',async()=>{
 for(const reply of [null,{user:{id:'other'},provider_refresh_token:'provider-token'},{user:{id:'owner'}}]){
  const {context,requests,button}=harness(reply);await context.deleteBenzaAccount();
  assert.equal(requests.length,0);assert.equal(button.disabled,false);
 }
});
test('verified deletion keeps original account session and sends provider token only to deletion endpoint',async()=>{
 const {context,requests}=harness({user:{id:'owner'},provider_refresh_token:'provider-token'});
 await context.deleteBenzaAccount();assert.equal(requests.length,1);
 assert.equal(requests[0].headers.Authorization,'Bearer existing-session');
 assert.deepEqual(JSON.parse(requests[0].body),{confirm:true,apple_refresh_token:'provider-token'});
});
