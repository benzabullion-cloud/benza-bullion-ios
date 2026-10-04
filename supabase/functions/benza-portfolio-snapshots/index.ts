import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function allRows(table: string, columns: string, filters: [string, unknown][] = []) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select(columns).order("id", { ascending: true });
    for (const [key, value] of filters) query = query.eq(key, value);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

const metals = ["gold", "silver", "platinum", "palladium", "copper"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isAuthorizedWorker(req: Request) {
  const token = req.headers.get("x-benza-worker-token");
  if (!token) return false;
  const { data, error } = await supabase.rpc("verify_benza_worker_token", { p_token: token });
  return !error && data === true;
}

async function retryPrivateFileCleanup() {
  const { error: discoveryError } = await supabase.rpc("benza_discover_orphan_files");
  if (discoveryError) throw discoveryError;
  const { data, error } = await supabase.from("benza_file_cleanup").select("path,attempts").order("attempts").order("queued_at").order("path").limit(200);
  if (error) throw error;
  for (const item of data ?? []) {
    const { data: referenced, error: referenceError } = await supabase.rpc("benza_file_is_referenced", { p_path: item.path });
    if (referenceError) continue;
    if (!referenced) {
      const { error: removalError } = await supabase.storage.from("holding-documents").remove([item.path]);
      if (removalError) { await supabase.from("benza_file_cleanup").update({attempts:item.attempts+1}).eq("path",item.path); continue; }
    }
    await supabase.from("benza_file_cleanup").delete().eq("path",item.path);
  }
}

function get15MinuteBucket(date = new Date()) {
  const bucket = new Date(date);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0);
  return bucket.toISOString();
}

async function getResilientPrices() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/benza-market-prices`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false || !data?.prices) {
      throw new Error(data?.error || `Market price service HTTP ${response.status}`);
    }

    const prices: Record<string, number> = {};
    for (const metal of metals) {
      const price = Number(data.prices[metal]);
      if (Number.isFinite(price) && price > 0) prices[metal] = price;
    }

    if (!Object.keys(prices).length) throw new Error("No usable market prices returned");
    return { prices, staleMetals: Array.isArray(data.stale_metals) ? data.stale_metals : [] };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    if (!(await isAuthorizedWorker(req))) return jsonResponse({ success: false, error: "Unauthorized worker request" }, 401);

    try { await retryPrivateFileCleanup(); } catch(error) { console.error("Private cleanup will retry next run",error); }
    const { prices, staleMetals } = await getResilientPrices();

    const holdingUsers = await allRows("holdings", "id,user_id");

    const userIds = [...new Set((holdingUsers ?? []).map((row) => row.user_id).filter(Boolean))];
    const capturedAt = new Date().toISOString();
    const bucketStart = get15MinuteBucket();

    let snapshotsWritten = 0;
    let usersSkippedMissingPrice = 0;

    for (const userId of userIds) {
      let holdings;
      try { holdings = await allRows("holdings", "id,metal,quantity,weight_oz,total_oz,cost_basis", [["user_id",userId]]); }
      catch (error) { console.error("Could not load holdings", error); continue; }

      // Never write a partial portfolio value. If a held metal does not have
      // a current or cached quote, skip this user's bucket and recover next run.
      const requiredMetals = [...new Set((holdings ?? []).map((h) => h.metal).filter(Boolean))];
      if (requiredMetals.some((metal) => !Number.isFinite(Number(prices[metal])) || Number(prices[metal]) <= 0)) {
        usersSkippedMissingPrice++;
        console.warn(`Skipping snapshot for ${userId}: missing required metal price`);
        continue;
      }

      let totalValue = 0;
      let totalCost = 0;
      const values: Record<string, number> = { gold: 0, silver: 0, platinum: 0, palladium: 0, copper: 0 };

      for (const holding of holdings ?? []) {
        const metal = holding.metal;
        const price = Number(prices[metal]);
        let ounces = Number(holding.total_oz);
        if (!Number.isFinite(ounces) || ounces <= 0) {
          ounces = (Number(holding.quantity) || 0) * (Number(holding.weight_oz) || 0);
        }

        const value = ounces * price;
        totalValue += value;
        if (values[metal] !== undefined) values[metal] += value;
        totalCost += Number(holding.cost_basis) || 0;
      }

      // A user reaches this worker only because holdings exist. A non-positive
      // calculated value therefore indicates incomplete/corrupt input; do not persist it.
      if ((holdings?.length || 0) > 0 && (!Number.isFinite(totalValue) || totalValue <= 0)) {
        usersSkippedMissingPrice++;
        console.warn(`Skipping snapshot for ${userId}: invalid calculated portfolio value`);
        continue;
      }

      const payload = {
        user_id: userId,
        bucket_start: bucketStart,
        captured_at: capturedAt,
        total_value: totalValue,
        total_cost: totalCost,
        gold_value: values.gold,
        silver_value: values.silver,
        platinum_value: values.platinum,
        palladium_value: values.palladium,
        copper_value: values.copper,
        gold_price: Number(prices.gold) || 0,
        silver_price: Number(prices.silver) || 0,
        platinum_price: Number(prices.platinum) || 0,
        palladium_price: Number(prices.palladium) || 0,
        copper_price: Number(prices.copper) || 0,
      };

      const { error: snapshotError } = await supabase
        .from("portfolio_snapshots")
        .upsert(payload, { onConflict: "user_id,bucket_start" });

      if (snapshotError) {
        console.error(`Snapshot failed for ${userId}`, snapshotError);
        continue;
      }
      snapshotsWritten++;
    }

    return jsonResponse({
      success: true,
      users_found: userIds.length,
      snapshots_written: snapshotsWritten,
      users_skipped_missing_price: usersSkippedMissingPrice,
      stale_metals: staleMetals,
      bucket_start: bucketStart,
      prices,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});