import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revokeAppleAccess} from '../supabase/functions/benza-delete-account/apple-revocation.mjs';
const user={identities:[{provider:'apple',identity_data:{sub:'apple-owner'}}]};
function options(overrides={}){
 const calls=[];
 return {calls,args:{user,refreshToken:'refresh',clientId:'service-id',clientSecret:'secret',
  verifyIdentity:async(token,audience)=>{assert.equal(token,'signed-id-token');assert.equal(audience,'service-id');return {sub:'apple-owner'};},
  fetcher:async(url,request)=>{calls.push({url,body:new URLSearchParams(request.body)});return url.endsWith('/token')?Response.json({id_token:'signed-id-token'}):new Response(null,{status:200});},...overrides}};
}
test('email-only deletion does not request Apple access',async()=>{
 const {args,calls}=options({user:{identities:[{provider:'email'}]}});
 await revokeAppleAccess(args);assert.equal(calls.length,0);
});
test('Apple identity is verified before its refresh token is revoked',async()=>{
 const {args,calls}=options();await revokeAppleAccess(args);
 assert.deepEqual(calls.map(x=>x.url),['https://appleid.apple.com/auth/token','https://appleid.apple.com/auth/revoke']);
 assert.equal(calls[1].body.get('token'),'refresh');
 assert.equal(calls[1].body.get('token_type_hint'),'refresh_token');
});
test('missing token or configuration fails before calling Apple',async()=>{
 for(const override of [{refreshToken:null},{clientSecret:null}]){
  const {args,calls}=options(override);await assert.rejects(revokeAppleAccess(args));assert.equal(calls.length,0);
 }
});
test('wrong subject and invalid signatures never revoke another Apple account',async()=>{
 for(const verifyIdentity of [async()=>({sub:'other-user'}),async()=>{throw new Error('Invalid signature');}]){
  const {args,calls}=options({verifyIdentity});await assert.rejects(revokeAppleAccess(args));assert.equal(calls.length,1);
 }
});
test('Apple refresh and revocation failures stop deletion',async()=>{
 for(const failAt of ['token','revoke']){
  const {args}=options({fetcher:async url=>url.endsWith('/'+failAt)?new Response(null,{status:400}):Response.json({id_token:'signed-id-token'})});
  await assert.rejects(revokeAppleAccess(args));
 }
});
