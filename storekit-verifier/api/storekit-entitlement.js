import { createClient } from '@supabase/supabase-js';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';

const BUNDLE_ID = 'com.benzabullion.app';
const PRODUCTS = new Set([
  'benza_pro_monthly',
  'benza_pro_annual',
  'benza_pro_founder_lifetime'
]);

let cachedRoots;

async function getRoots() {
  if (cachedRoots) return cachedRoots;
  const urls = [
    'https://www.apple.com/appleca/AppleIncRootCertificate.cer',
    'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer',
    'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer'
  ];
  const roots = [];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Unable to load Apple root certificate');
    roots.push(Buffer.from(await response.arrayBuffer()));
  }
  cachedRoots = roots;
  return roots;
}

function decodePayload(jws) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid signed transaction');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

function isoFromMillis(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Server configuration is incomplete');

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Missing authentication');

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) throw new Error('Invalid authentication');

    const signedTransaction = String(req.body?.signedTransaction || '');
    if (!signedTransaction) throw new Error('Missing signed transaction');

    const unverified = decodePayload(signedTransaction);
    const envName = String(unverified.environment || '');
    const environment = envName === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;

    let appAppleId;
    if (environment === Environment.PRODUCTION) {
      const configured = Number(process.env.APPLE_APP_ID || '');
      if (!Number.isFinite(configured) || configured <= 0) {
        throw new Error('Production App Store verification is not configured');
      }
      appAppleId = configured;
    }

    const verifier = new SignedDataVerifier(
      await getRoots(),
      true,
      environment,
      BUNDLE_ID,
      appAppleId
    );
    const tx = await verifier.verifyAndDecodeTransaction(signedTransaction);

    const productId = String(tx.productId || '');
    if (!PRODUCTS.has(productId)) throw new Error('Unknown Benza Bullion product');

    const tokenFromApple = String(tx.appAccountToken || '').toLowerCase();
    if (tokenFromApple && tokenFromApple !== String(userData.user.id).toLowerCase()) {
      throw new Error('Purchase is linked to a different Benza Bullion account');
    }

    const revoked = Number(tx.revocationDate || 0) > 0;
    const expiresAt = isoFromMillis(tx.expiresDate);
    const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    const isFounder = productId === 'benza_pro_founder_lifetime';
    const active = !revoked && (isFounder || !expired);
    const introductory = Number(tx.offerType || 0) === 1;

    const record = {
      user_id: userData.user.id,
      tier: active ? 'pro' : 'free',
      status: active ? (introductory ? 'trial' : 'active') : 'inactive',
      product_id: productId,
      original_transaction_id: tx.originalTransactionId ? String(tx.originalTransactionId) : null,
      expires_at: isFounder ? null : expiresAt,
      trial_ends_at: active && introductory ? expiresAt : null,
      last_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error: upsertError } = await admin
      .from('user_entitlements')
      .upsert(record, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;

    return res.status(200).json({
      ok: true,
      entitlement: record,
      environment: envName,
      transactionId: tx.transactionId ? String(tx.transactionId) : null
    });
  } catch (error) {
    console.error('StoreKit verifier error:', error);
    return res.status(400).json({ error: error?.message || String(error) });
  }
}
