const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
function setup({saved=true,failStatus=false,failForget=false}={}){
 const nodes={authRemember:{checked:false},authEmail:{value:'saved@example.com'},savedLoginOption:{},authRememberLabel:{},forgetSavedLogin:{style:{}}};
 let cleared=0;
 const context={authMode:'login',handleAuth:{},window:{Capacitor:{isNativePlatform:()=>true,Plugins:{BenzaSavedLogin:{status:async()=>{if(failStatus)throw Error();return {available:true,hasSavedLogin:saved};},forgetPassword:async()=>{if(failForget)throw Error();saved=false;}}}}},document:{getElementById:id=>nodes[id]},clearRecentEmails(){cleared++;},setAuthError(){}};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function savedLoginPlugin(){'),html.indexOf('function clearBenzaAccountState(){')),context);
 return {context,nodes,cleared:()=>cleared};
}
test('saved Keychain login restores checkbox on each login screen refresh',async()=>{
 const {context,nodes}=setup();
 await context.configureSavedLogin();
 assert.equal(nodes.authRemember.checked,true);
 nodes.authRemember.checked=false;
 await context.configureSavedLogin();
 assert.equal(nodes.authRemember.checked,true);
 assert.equal(nodes.savedLoginOption.hidden,false);
});
test('old remembered email is not consent to save a password',async()=>{
 const {context,nodes}=setup({saved:false});nodes.authRemember.checked=true;
 await context.configureSavedLogin();assert.equal(nodes.authRemember.checked,false);
});
test('unchecking explicitly forgets saved credentials; failure preserves the preference',async()=>{
 const a=setup();await a.context.configureSavedLogin();
 a.nodes.authRemember.checked=false;await a.context.changeRememberLogin(false);
 assert.equal(a.context.handleAuth.hasSavedLogin,false);assert.equal(a.cleared(),1);assert.equal(a.nodes.authRemember.checked,false);
 const b=setup({failForget:true});await b.context.configureSavedLogin();b.nodes.authRemember.checked=false;
 await b.context.changeRememberLogin(false);assert.equal(b.nodes.authRemember.checked,true);assert.equal(b.cleared(),0);
});
test('transient Keychain error does not erase known saved-login availability',async()=>{
 const {context,nodes}=setup({failStatus:true});context.handleAuth.hasSavedLogin=true;context.handleAuth.savedLoginAvailable=true;nodes.authRemember.checked=true;
 await context.configureSavedLogin();assert.equal(nodes.authRemember.checked,true);assert.equal(context.handleAuth.savedLoginAvailable,true);
});
