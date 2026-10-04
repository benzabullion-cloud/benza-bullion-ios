const test=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../storekit-verifier/lib/apple-entitlements.js');
function tx(changes={}){return{bundleId:'com.benzabullion.app',environment:'Sandbox',productId:'benza_pro_monthly',transactionId:'tx',originalTransactionId:'family',appAccountToken:'account-a',expiresDate:Date.now()+86400000,signedDate:Date.now(),...changes}}
function apple(current,status=1,renewal={}){return{verifier:{verifyAndDecodeTransaction:async()=>current,verifyAndDecodeRenewalInfo:async()=>renewal},client:{getTransactionInfo:async()=>({signedTransactionInfo:'verified'}),getAllSubscriptionStatuses:async()=>({data:[{lastTransactions:[{originalTransactionId:'family',signedTransactionInfo:'verified',signedRenewalInfo:'renewal',status}]}]})}}}
test('old signed active receipt consults Apple and becomes revoked or expired',async()=>{
 const m=await modulePromise;const old=tx();const revoked=tx({revocationDate:Date.now()});assert.equal((await m.currentAppleState(old,'Sandbox',apple(revoked,5))).status,'revoked');
 const expired=tx({expiresDate:Date.now()-1000});assert.equal((await m.currentAppleState(old,'Sandbox',apple(expired,2))).status,'expired');
});
test('current renewal replaces earlier transaction and grace uses verified grace expiry',async()=>{
 const m=await modulePromise;const renewal=tx({transactionId:'renewed'});assert.equal((await m.currentAppleState(tx(),'Sandbox',apple(renewal))).tx.transactionId,'renewed');
 const expiry=Date.now()+60000;const state=await m.currentAppleState(tx(),'Sandbox',apple(tx({expiresDate:Date.now()-1}),4,{originalTransactionId:'family',gracePeriodExpiresDate:expiry}));assert.equal(state.status,'grace');assert.equal(state.expiresAt,new Date(expiry).toISOString());
});
test('reject wrong bundle/environment, missing expiry, family mismatch and unsupported family sharing',async()=>{
 const m=await modulePromise;for(const change of[{bundleId:'wrong'},{environment:'Production'},{expiresDate:null},{inAppOwnershipType:'FAMILY_SHARED'}])assert.throws(()=>m.validateTransaction(tx(change),'Sandbox'));
 await assert.rejects(m.currentAppleState(tx(),'Sandbox',apple(tx({originalTransactionId:'different'}))),/family mismatch/);
});
test('founder refunds are revoked; another account cannot apply a bound purchase',async()=>{
 const m=await modulePromise;const founder=tx({productId:'benza_pro_founder_lifetime',expiresDate:null,revocationDate:Date.now()});const state=await m.currentAppleState(founder,'Sandbox',apple(founder));assert.equal(state.status,'revoked');assert.equal(state.expiresAt,null);
 await assert.rejects(m.applyAppleState({rpc(){throw Error('must not write')}},'account-b',state,'Sandbox',new Date().toISOString()),/different/);
});
