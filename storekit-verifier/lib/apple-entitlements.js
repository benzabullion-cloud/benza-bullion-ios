import { AppStoreServerAPIClient, SignedDataVerifier, Environment, Status } from '@apple/app-store-server-library';
export const BUNDLE_ID = 'com.benzabullion.app';
export const PRODUCTS = new Set(['benza_pro_monthly','benza_pro_annual','benza_pro_founder_lifetime']);
let rootsPromise;
export function decodePayload(jws) {
  const parts=String(jws||'').split('.');
  if(parts.length!==3)throw new Error('Invalid signed Apple payload');
  return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
}
async function roots(){
  if(!rootsPromise)rootsPromise=Promise.all([
    'https://www.apple.com/appleca/AppleIncRootCertificate.cer',
    'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer',
    'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer'
  ].map(async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Apple certificate unavailable');return Buffer.from(await response.arrayBuffer());})).catch(error=>{rootsPromise=null;throw error;});
  return rootsPromise;
}
export async function appleContext(environmentName){
  if(!['Production','Sandbox'].includes(environmentName))throw new Error('Unsupported Apple environment');
  const environment=environmentName==='Production'?Environment.PRODUCTION:Environment.SANDBOX;
  const appId=Number(process.env.APPLE_APP_ID||'6811639929');
  if(!Number.isSafeInteger(appId)||appId<=0)throw new Error('Apple app ID is not configured');
  const key=(process.env.APPLE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  if(!key||!process.env.APPLE_KEY_ID||!process.env.APPLE_ISSUER_ID)throw new Error('Apple server verification is not configured. Your purchase remains recoverable; contact support.');
  return {
    verifier:new SignedDataVerifier(await roots(),true,environment,BUNDLE_ID,environment===Environment.PRODUCTION?appId:undefined),
    client:new AppStoreServerAPIClient(key,process.env.APPLE_KEY_ID,process.env.APPLE_ISSUER_ID,BUNDLE_ID,environment)
  };
}
export function validateTransaction(tx,environmentName){
  if(tx.bundleId!==BUNDLE_ID||tx.environment!==environmentName||!PRODUCTS.has(tx.productId)||!tx.transactionId||!tx.originalTransactionId)throw new Error('Invalid Benza Bullion transaction');
  if(tx.inAppOwnershipType==='FAMILY_SHARED')throw new Error('Family Sharing is not supported for account-bound Pro access.');
  if(tx.productId!=='benza_pro_founder_lifetime'&&(!Number.isFinite(Number(tx.expiresDate))||Number(tx.expiresDate)<=0))throw new Error('Subscription expiry is missing');
  if(!Number.isFinite(Number(tx.signedDate))||Number(tx.signedDate)<=0)throw new Error('Apple signing date is missing');
}
// Always consult Apple, rather than granting access from an old device payload.
export async function currentAppleState(input,environmentName,{verifier,client},now=Date.now()){
  validateTransaction(input,environmentName);
  const info=await client.getTransactionInfo(String(input.transactionId));
  let tx=await verifier.verifyAndDecodeTransaction(info.signedTransactionInfo);
  validateTransaction(tx,environmentName);
  if(tx.originalTransactionId!==input.originalTransactionId)throw new Error('Apple purchase family mismatch');
  let status=Number(tx.revocationDate)>0?'revoked':tx.productId==='benza_pro_founder_lifetime'||Number(tx.expiresDate)>now?'active':'expired';
  let expiry=tx.productId==='benza_pro_founder_lifetime'?null:Number(tx.expiresDate);
  if(tx.productId!=='benza_pro_founder_lifetime'){
    const response=await client.getAllSubscriptionStatuses(String(tx.transactionId));
    const family=(response.data||[]).flatMap(group=>group.lastTransactions||[]).find(item=>String(item.originalTransactionId)===String(tx.originalTransactionId));
    if(!family?.signedTransactionInfo)throw new Error('Apple subscription status is unavailable');
    tx=await verifier.verifyAndDecodeTransaction(family.signedTransactionInfo);validateTransaction(tx,environmentName);
    if(tx.originalTransactionId!==input.originalTransactionId)throw new Error('Apple subscription family mismatch');
    expiry=Number(tx.expiresDate);
    if(Number(tx.revocationDate)>0||family.status===Status.REVOKED)status='revoked';
    else if(family.status===Status.BILLING_GRACE_PERIOD){
      const renewal=await verifier.verifyAndDecodeRenewalInfo(family.signedRenewalInfo);
      if(renewal.originalTransactionId!==tx.originalTransactionId)throw new Error('Apple renewal family mismatch');
      expiry=Number(renewal.gracePeriodExpiresDate);
      if(!Number.isFinite(expiry)||expiry<=0)throw new Error('Apple grace expiry is unavailable');
      status=expiry>now?'grace':'expired';
    }else status=family.status===Status.ACTIVE&&expiry>now?'active':'expired';
  }
  if(status==='active'&&Number(tx.offerType)===1)status='trial';
  return {tx,status,expiresAt:expiry?new Date(expiry).toISOString():null};
}
export async function applyAppleState(admin,userId,state,environment,observedAt){
  const {tx,status,expiresAt}=state;
  const token=tx.appAccountToken?String(tx.appAccountToken).toLowerCase():null;
  if(token&&token!==String(userId).toLowerCase())throw new Error('Purchase is linked to a different Benza Bullion account');
  const {data,error}=await admin.rpc('benza_apply_apple_entitlement',{
    p_user_id:userId,p_original_transaction_id:String(tx.originalTransactionId),p_product_id:tx.productId,
    p_signed_at:observedAt,p_expires_at:expiresAt,p_status:status,p_environment:environment,p_account_token:token
  });
  if(error)throw error;return data;
}
