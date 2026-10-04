const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('App/public/index.html','utf8');
function fn(name){const re=new RegExp('(?:async )?function '+name+'\\(');const start=html.search(re);assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n}',start)+2)}
function context(){
 const els={accountName:{value:'Test'},accountEmail:{value:'new@example.test'},accountPassword:{value:'abcdefgh'},accountPasswordConfirm:{value:'abcdefgh'},saveProfileButton:{dataset:{}},changePasswordButton:{dataset:{}},proStartTrialBtn:{dataset:{}},notificationPrefsStatus:{textContent:''}};
 const storage=new Map(),messages=[];
 const ctx={console:{warn(){}},Set,Map,currentUser:{id:'account-a',email:'old@example.test',user_metadata:{}},document:{getElementById:id=>els[id],querySelectorAll:()=>[],addEventListener(){}},window:{Capacitor:{Plugins:{}}},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},isBenzaNativeRuntime:()=>true,alert:s=>messages.push(s),setAccountSettingsStatus:s=>{ctx.status=s},setButtonBusy:(el,busy)=>{el.disabled=busy},updateWelcomeBack(){},friendlyErrorMessage:(e,f)=>e?.message||f,detectedBenzaTimezone:()=> 'UTC',renderNotificationPreferences(){},setTimeout:()=>{},NOTIFICATION_PREF_UI:{price_targets:1,daily_summary:1},benzaNotificationPrefs:{price_targets:false,daily_summary:false}};
 vm.createContext(ctx);ctx.els=els;ctx.messages=messages;ctx.storage=storage;return ctx;
}
function load(ctx,names,prefix=''){vm.runInContext(prefix+'\n'+names.map(fn).join('\n'),ctx)}
test('profile keeps email confirmation instructions; thrown errors recover buttons',async()=>{
 const c=context();c.supabaseClient={auth:{updateUser:async()=>({data:{user:{id:'account-a',email:'old@example.test',user_metadata:{name:'Test'}}}})}};
 load(c,['accountDisplayName','populateAccountSettings','saveAccountProfile','changeAccountPassword']);
 await c.saveAccountProfile();assert.match(c.status,/Check your new email/);assert.equal(c.els.saveProfileButton.disabled,false);
 c.supabaseClient.auth.updateUser=async()=>{throw Error('Network unavailable')};await c.saveAccountProfile();assert.equal(c.status,'Network unavailable');assert.equal(c.els.saveProfileButton.disabled,false);
 c.els.accountPassword.value='abcdefgh';c.els.accountPasswordConfirm.value='abcdefgh';await c.changeAccountPassword();assert.equal(c.status,'Network unavailable');assert.equal(c.els.changePasswordButton.disabled,false);
});
test('a profile response cannot replace the next signed-in account',async()=>{
 const c=context();let resolve;c.supabaseClient={auth:{updateUser:()=>new Promise(r=>resolve=r)}};load(c,['accountDisplayName','populateAccountSettings','saveAccountProfile']);const request=c.saveAccountProfile();c.currentUser={id:'account-b'};resolve({data:{user:{id:'account-a'}}});await request;assert.equal(c.currentUser.id,'account-b');
});
test('notification failures roll back and concurrent changes save only their own column',async()=>{
 const c=context();const updates=[];
 c.supabaseClient={from:()=>({update:payload=>{updates.push(payload);return {eq:()=>({select:()=>({single:async()=>({error:Error('Offline')})})})}}})};
 load(c,['toggleNotificationPreference'],'const notificationPreferenceRequests=new Set();');
 await c.toggleNotificationPreference('price_targets');assert.equal(c.benzaNotificationPrefs.price_targets,false);assert.match(c.els.notificationPrefsStatus.textContent,/try again/);
 let reject;c.supabaseClient={from:()=>({update:payload=>{updates.push(payload);return {eq:()=>({select:()=>({single:()=>new Promise((_,r)=>reject=r)})})}}})};
 const request=c.toggleNotificationPreference('daily_summary');await c.toggleNotificationPreference('daily_summary');assert.equal(updates.length,2);c.currentUser={id:'account-b'};c.benzaNotificationPrefs={daily_summary:true};reject(Error('Offline'));await request;assert.equal(c.benzaNotificationPrefs.daily_summary,true);
 assert.equal('price_targets' in updates[1],false);assert.equal(updates[1].daily_summary,true);
});
function storeContext(){const c=context();c.selectedProPlan='monthly';load(c,['nativeStoreKitPlugin','storeKitPlanCopy','renderStoreKitProducts','refreshStoreKitProducts','pendingPurchaseKey','setPendingPurchase','isStoreKitAccountConflict','storeKitAccountConflictMessage','handlePendingPurchase','replayPendingPurchases'],"const storeKitPlanIds={monthly:'benza_pro_monthly',annual:'benza_pro_annual',founder:'benza_pro_founder_lifetime'};let storeKitProducts={};let storeKitProductsRequest=null;const pendingPurchaseIntents=new Set();const pendingPurchaseVerifications=new Set();");return c}
test('localized prices and trial eligibility drive every plan; failures disable native checkout',async()=>{
 const c=storeContext();c.window.Capacitor.Plugins.BenzaStoreKit={getProducts:async()=>({products:[{productId:'benza_pro_monthly',displayPrice:'€5,99'},{productId:'benza_pro_annual',displayPrice:'€44,99',trialValue:7,trialUnit:'day'},{productId:'benza_pro_founder_lifetime',displayPrice:'€29,99'}]})};
 await c.refreshStoreKitProducts();assert.equal(c.storeKitPlanCopy('monthly').price,'€5,99/month');assert.equal(c.storeKitPlanCopy('monthly').action,'Subscribe');assert.match(c.storeKitPlanCopy('annual').action,/7-day free trial/);assert.equal(c.storeKitPlanCopy('founder').price,'€29,99 one time');assert.equal(c.els.proStartTrialBtn.disabled,false);
 c.window.Capacitor.Plugins.BenzaStoreKit.getProducts=async()=>{throw Error('Offline')};await c.refreshStoreKitProducts();assert.equal(c.els.proStartTrialBtn.disabled,true);assert.doesNotMatch(c.storeKitPlanCopy('monthly').offer,/free trial/);
});
test('pending approvals require intent and matching account; failed verification retries, success clears intent',async()=>{
 const c=storeContext();let verified=0;const tx={productId:'benza_pro_monthly',transactionId:'123',appAccountToken:'account-a',signedTransaction:'signed'};
 c.verifyNativeStoreTransaction=async()=>{verified++};await c.handlePendingPurchase(tx);assert.equal(verified,0);
 c.setPendingPurchase('account-a',tx.productId,true);await c.handlePendingPurchase({...tx,appAccountToken:'account-b'});assert.equal(verified,0);
 c.verifyNativeStoreTransaction=async()=>{verified++;throw Error('Offline')};await c.handlePendingPurchase(tx);assert.equal(verified,1);assert.equal(c.storage.size,1);
 c.verifyNativeStoreTransaction=async()=>{verified++};await c.handlePendingPurchase(tx);assert.equal(verified,2);assert.equal(c.storage.size,0);await c.handlePendingPurchase(tx);assert.equal(verified,2);
});
test('pending approvals survive restart and duplicate events do not verify concurrently',async()=>{
 const c=storeContext();const tx={productId:'benza_pro_annual',transactionId:'99',appAccountToken:'account-a'};c.storage.set(c.pendingPurchaseKey('account-a',tx.productId),'pending');let resolve,count=0;c.verifyNativeStoreTransaction=()=>{count++;return new Promise(r=>resolve=r)};
 const request=c.handlePendingPurchase(tx);await c.handlePendingPurchase(tx);assert.equal(count,1);resolve();await request;assert.equal(c.storage.size,0);
});
test('deletion warns about billing and provides management without blocking immediate deletion',()=>{
 assert.match(fn('deleteBenzaAccount'),/Deleting your account does not cancel Apple subscriptions/);assert.match(html,/onclick="openAppleSubscriptionManagement\(\)"/);assert.doesNotMatch(fn('saveHolding'),/Renew Pro to edit/);
 const support=fs.readFileSync('App/public/support.html','utf8');assert.doesNotMatch(support,/Build 125/);assert.match(support,/billing continues/i);
});

test('pending receipt account conflicts clear retry intent without granting access',async()=>{
 const c=storeContext();const tx={productId:'benza_pro_annual',transactionId:'99',appAccountToken:'account-a'};
 c.setPendingPurchase('account-a',tx.productId,true);let calls=0;
 c.verifyNativeStoreTransaction=async()=>{calls++;throw Error('Purchase is linked to a different Benza Bullion account')};
 await c.handlePendingPurchase(tx);assert.equal(c.storage.size,0);assert.equal(c.messages.length,0);await c.handlePendingPurchase(tx);assert.equal(calls,1);
});
