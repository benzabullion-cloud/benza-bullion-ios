// Apple credentials are verified before any account data is removed.
// No provider tokens are persisted or logged.
export async function revokeAppleAccess({user, refreshToken, clientId, clientSecret, verifyIdentity, fetcher=fetch}) {
  const identities=(user.identities||[]).filter(identity=>identity.provider==='apple');
  if(!identities.length)return;
  if(typeof refreshToken!=='string'||!refreshToken||refreshToken.length>8192)
    throw new Error('Please verify your Apple sign-in before deleting this account.');
  if(!clientId||!clientSecret)throw new Error('Apple account deletion is temporarily unavailable. Please try again later.');
  const request=async(path,fields)=>fetcher('https://appleid.apple.com/auth/'+path,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...fields}),
    signal:AbortSignal.timeout(15000)
  });
  const refreshed=await request('token',{grant_type:'refresh_token',refresh_token:refreshToken});
  if(!refreshed.ok)throw new Error('Could not verify Apple access. Please sign in with Apple again and retry deletion.');
  const tokens=await refreshed.json();
  if(typeof tokens.id_token!=='string')throw new Error('Apple did not return a verified identity. Your account has not been deleted.');
  const claims=await verifyIdentity(tokens.id_token,clientId);
  // Compare the immutable provider subject, never the email or user_metadata.
  if(!claims.sub||!identities.some(identity=>identity.identity_data?.sub===claims.sub))
    throw new Error('Use the Apple Account linked to this Benza Bullion account. Your account has not been deleted.');
  const revoked=await request('revoke',{token:refreshToken,token_type_hint:'refresh_token'});
  if(!revoked.ok)throw new Error('Could not revoke Apple access. Your account has not been deleted. Please try again.');
}
