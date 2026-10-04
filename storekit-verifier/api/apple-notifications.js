import { createClient } from '@supabase/supabase-js';
import { appleContext,decodePayload,currentAppleState,applyAppleState } from '../lib/apple-entitlements.js';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  const observedAt=new Date().toISOString();
  try{
    const payload=String(req.body?.signedPayload||'');
    const environment=decodePayload(payload).data?.environment;
    const apple=await appleContext(environment);
    const notification=await apple.verifier.verifyAndDecodeNotification(payload);
    if(notification.notificationType==='TEST')return res.status(200).json({ok:true});
    if(!notification.data?.signedTransactionInfo)return res.status(200).json({ok:true});
    const input=await apple.verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:owner,error}=await admin.from('benza_purchase_ownership').select('user_id').eq('original_transaction_id',String(input.originalTransactionId)).maybeSingle();
    if(error)throw error;
    // Never resurrect a deleted account or create an entitlement from an
    // unsolicited notification before that account's initial purchase claim.
    if(!owner?.user_id)return res.status(200).json({ok:true});
    const state=await currentAppleState(input,environment,apple);
    await applyAppleState(admin,owner.user_id,state,environment,observedAt);
    return res.status(200).json({ok:true});
  }catch(error){console.error('Apple notification retry needed:',error?.message);return res.status(503).json({error:'Unable to reconcile notification; retry required'});}
}
