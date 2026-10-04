import { createClient } from '@supabase/supabase-js';
import { appleContext,decodePayload,currentAppleState,applyAppleState } from '../lib/apple-entitlements.js';
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','authorization, content-type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  // Capture before network reads so a delayed older request cannot replace a
  // newer authoritative observation of this purchase family.
  const observedAt=new Date().toISOString();
  try{
    const {SUPABASE_URL:url,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service}=process.env;
    if(!url||!anon||!service)throw new Error('Server configuration is incomplete');
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('Missing authentication');
    const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error}=await auth.auth.getUser(token);if(error||!userData?.user)throw new Error('Invalid authentication');
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    if(req.body?.action==='reconcile'){
      const {data:families,error:familyError}=await admin.from('benza_purchase_ownership').select('original_transaction_id,environment').eq('user_id',userData.user.id);
      if(familyError)throw familyError;
      for(const family of families||[]){
        let reconciled=false,lastError;
        for(const environment of family.environment?[family.environment]:['Production','Sandbox']){
          try{
            const apple=await appleContext(environment);
            const info=await apple.client.getTransactionInfo(family.original_transaction_id);
            const input=await apple.verifier.verifyAndDecodeTransaction(info.signedTransactionInfo);
            const state=await currentAppleState(input,environment,apple);
            await applyAppleState(admin,userData.user.id,state,environment,observedAt);
            reconciled=true;break;
          }catch(error){lastError=error;}
        }
        if(!reconciled)throw lastError;
      }
      const {data:entitlement,error:entitlementError}=await admin.from('user_entitlements').select('*').eq('user_id',userData.user.id).maybeSingle();
      if(entitlementError)throw entitlementError;
      return res.status(200).json({ok:true,entitlement});
    }
    const jws=String(req.body?.signedTransaction||'');const environment=decodePayload(jws).environment;
    const apple=await appleContext(environment);const input=await apple.verifier.verifyAndDecodeTransaction(jws);
    const state=await currentAppleState(input,environment,apple);
    const entitlement=await applyAppleState(admin,userData.user.id,state,environment,observedAt);
    return res.status(200).json({ok:true,entitlement,environment,transactionId:String(state.tx.transactionId)});
  }catch(error){console.error('Apple verification failed:',error?.message);return res.status(400).json({error:error?.message||'Purchase verification failed'});}
}
