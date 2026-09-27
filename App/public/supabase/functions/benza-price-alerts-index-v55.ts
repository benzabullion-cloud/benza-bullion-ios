import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VAPID_SUBJECT = "mailto:benzabullion@gmail.com";
const metals = ["gold", "silver", "platinum", "palladium", "copper"] as const;
type Metal = typeof metals[number];

const symbols: Record<Metal, string> = {
  gold: "XAU", silver: "XAG", platinum: "XPT", palladium: "XPD", copper: "HG",
};
const metalNames: Record<Metal, string> = {
  gold: "Gold", silver: "Silver", platinum: "Platinum", palladium: "Palladium", copper: "Copper",
};
const MILESTONES = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function money(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

async function ensureVapidKeys() {
  const { data, error } = await supabase.from("push_vapid_config")
    .select("public_key,private_key").eq("id", true).maybeSingle();
  if (error) throw new Error(`Could not read VAPID configuration: ${error.message}`);
  if (data?.public_key && data?.private_key) return { publicKey: data.public_key, privateKey: data.private_key };

  const keys = webpush.generateVAPIDKeys();
  const { error: saveError } = await supabase.from("push_vapid_config").upsert({
    id: true, public_key: keys.publicKey, private_key: keys.privateKey,
  }, { onConflict: "id" });
  if (saveError) throw new Error(`Could not save VAPID configuration: ${saveError.message}`);
  return keys;
}

async function getPrices(): Promise<Record<Metal, number>> {
  const out = {} as Record<Metal, number>;
  await Promise.all(metals.map(async metal => {
    const r = await fetch(`https://api.gold-api.com/price/${symbols[metal]}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Price request failed for ${metal}: ${r.status}`);
    const d = await r.json();
    let price = Number(d.price);
    if (!Number.isFinite(price)) throw new Error(`Invalid price returned for ${metal}`);
    if (metal === "copper") price /= 16;
    out[metal] = price;
  }));
  return out;
}

async function sendPush(userId: string, payload: Record<string, unknown>) {
  const { data: subs, error } = await supabase.from("notification_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("user_id", userId).eq("enabled", true);
  if (error) throw new Error(`Could not load push subscriptions: ${error.message}`);
  let sent = 0, failed = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e: any) {
      failed++;
      console.error("Push delivery failed", s.id, e?.statusCode, e?.message || e);
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from("notification_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", s.id);
      }
    }
  }
  return { sent, failed };
}

async function eventExists(userId: string, type: string, key: string) {
  const { data, error } = await supabase.from("notification_events").select("id").eq("user_id", userId).eq("event_type", type).eq("event_key", key).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function recordEvent(userId: string, type: string, key: string) {
  const { error } = await supabase.from("notification_events").insert({ user_id: userId, event_type: type, event_key: key });
  if (error && error.code !== "23505") throw error;
}

function localParts(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  } catch {
    return localParts("America/Chicago");
  }
}

function previousDate(dateString: string) {
  const d = new Date(`${dateString}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async req => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const vapid = await ensureVapidKeys();
    if (req.method === "GET") return reply({ success: true, publicKey: vapid.publicKey });
    if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405);

    let body: any = {};
    try { body = await req.json(); } catch { /* scheduled calls may have no body */ }
    if (body?.action === "public-key") return reply({ success: true, publicKey: vapid.publicKey });

    webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);
    const prices = await getPrices();
    const utcDate = new Date().toISOString().slice(0, 10);

    // Create/read today's global market baselines.
    const marketBaselines: Record<string, number> = {};
    for (const metal of metals) {
      const { data } = await supabase.from("market_notification_baselines").select("baseline_price")
        .eq("market_date", utcDate).eq("metal", metal).maybeSingle();
      if (data?.baseline_price != null) marketBaselines[metal] = Number(data.baseline_price);
      else {
        marketBaselines[metal] = prices[metal];
        await supabase.from("market_notification_baselines").upsert({ market_date: utcDate, metal, baseline_price: prices[metal] }, { onConflict: "market_date,metal" });
      }
    }

    const { data: prefs, error: prefsError } = await supabase.from("notification_preferences").select("*");
    if (prefsError) throw new Error(`Could not load notification preferences: ${prefsError.message}`);
    const prefMap = new Map((prefs || []).map((p: any) => [p.user_id, p]));

    const { data: holdings, error: holdingsError } = await supabase.from("holdings").select("user_id,metal,total_oz,cost_basis");
    if (holdingsError) throw new Error(`Could not load holdings: ${holdingsError.message}`);
    const portfolios = new Map<string, { totalValue: number; totalCost: number }>();
    for (const h of holdings || []) {
      const metal = h.metal as Metal;
      if (!prices[metal]) continue;
      const p = portfolios.get(h.user_id) || { totalValue: 0, totalCost: 0 };
      p.totalValue += (Number(h.total_oz) || 0) * prices[metal];
      p.totalCost += Number(h.cost_basis) || 0;
      portfolios.set(h.user_id, p);
    }

    let sent = 0, failed = 0;
    const results: any[] = [];

    // 1) Price-target alerts.
    const { data: alerts, error: alertError } = await supabase.from("price_alerts").select("*").eq("enabled", true);
    if (alertError) throw new Error(`Could not load price alerts: ${alertError.message}`);
    for (const alert of alerts || []) {
      const pref: any = prefMap.get(alert.user_id);
      const current = prices[alert.metal as Metal];
      if (!Number.isFinite(current)) continue;
      const target = Number(alert.target);
      const reached = alert.direction === "higher" ? current >= target : current <= target;
      if (!reached && alert.is_triggered) {
        await supabase.from("price_alerts").update({ is_triggered: false, updated_at: new Date().toISOString() }).eq("id", alert.id);
        continue;
      }
      if (!reached || alert.is_triggered || pref?.price_targets === false) continue;
      const name = metalNames[alert.metal as Metal];
      const r = await sendPush(alert.user_id, {
        title: `${name} Price Alert`,
        body: `${name} reached your ${alert.direction === "higher" ? "higher" : "lower"} target of ${money(target)}/oz. Current price: ${money(current)}/oz.`,
        tag: `benza-target-${alert.id}`, url: "https://imaginative-dasik-a59d9a.netlify.app/",
      });
      sent += r.sent; failed += r.failed;
      if (r.sent > 0) {
        await supabase.from("price_alerts").update({ is_triggered: true, last_notified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", alert.id);
        results.push({ type: "price_target", user_id: alert.user_id, metal: alert.metal });
      }
    }

    // 2) Big market moves (once per metal/direction/day per user).
    for (const pref of prefs || []) {
      if (!pref.big_market_moves) continue;
      const threshold = Number(pref.big_move_percent) || 3;
      for (const metal of metals) {
        const baseline = marketBaselines[metal];
        if (!baseline) continue;
        const pct = ((prices[metal] - baseline) / baseline) * 100;
        if (Math.abs(pct) < threshold) continue;
        const direction = pct >= 0 ? "up" : "down";
        const key = `${utcDate}:${metal}:${direction}:${threshold}`;
        if (await eventExists(pref.user_id, "big_market_move", key)) continue;
        const r = await sendPush(pref.user_id, {
          title: `${metalNames[metal]} is moving`,
          body: `${metalNames[metal]} is ${direction} ${Math.abs(pct).toFixed(1)}% today and is now ${money(prices[metal])}/oz.`,
          tag: `benza-market-${key}`, url: "https://imaginative-dasik-a59d9a.netlify.app/",
        });
        sent += r.sent; failed += r.failed;
        if (r.sent > 0) { await recordEvent(pref.user_id, "big_market_move", key); results.push({ type: "big_market_move", user_id: pref.user_id, metal, pct }); }
      }
    }

    // 3) Portfolio milestones.
    for (const pref of prefs || []) {
      if (!pref.portfolio_milestones) continue;
      const portfolio = portfolios.get(pref.user_id);
      if (!portfolio || portfolio.totalValue <= 0) continue;
      const reached = MILESTONES.filter(x => portfolio.totalValue >= x);
      if (!reached.length) continue;
      const milestone = reached[reached.length - 1];
      const key = `value:${milestone}`;
      if (await eventExists(pref.user_id, "portfolio_milestone", key)) continue;
      const r = await sendPush(pref.user_id, {
        title: "Portfolio Milestone",
        body: `Your bullion portfolio reached ${money(milestone)}. Current tracked value: ${money(portfolio.totalValue)}.`,
        tag: `benza-milestone-${milestone}`, url: "https://imaginative-dasik-a59d9a.netlify.app/",
      });
      sent += r.sent; failed += r.failed;
      if (r.sent > 0) { await recordEvent(pref.user_id, "portfolio_milestone", key); results.push({ type: "portfolio_milestone", user_id: pref.user_id, milestone }); }
    }

    // 4) Daily portfolio summary at the user's chosen local hour (default 8 AM).
    for (const pref of prefs || []) {
      if (!pref.daily_summary) continue;
      const local = localParts(pref.timezone || "America/Chicago");
      if (local.hour !== (Number(pref.daily_summary_hour) || 8)) continue;
      const key = local.date;
      if (await eventExists(pref.user_id, "daily_summary", key)) continue;
      const portfolio = portfolios.get(pref.user_id) || { totalValue: 0, totalCost: 0 };
      const yesterday = previousDate(local.date);
      const { data: prior } = await supabase.from("portfolio_notification_baselines").select("total_value")
        .eq("user_id", pref.user_id).eq("local_date", yesterday).maybeSingle();
      const priorValue = prior ? Number(prior.total_value) : NaN;
      const delta = Number.isFinite(priorValue) ? portfolio.totalValue - priorValue : NaN;
      const pct = Number.isFinite(priorValue) && priorValue !== 0 ? (delta / priorValue) * 100 : NaN;
      const changeText = Number.isFinite(delta)
        ? ` ${delta >= 0 ? "Up" : "Down"} ${money(Math.abs(delta))}${Number.isFinite(pct) ? ` (${Math.abs(pct).toFixed(2)}%)` : ""} from yesterday.`
        : "";
      const r = await sendPush(pref.user_id, {
        title: "Daily Portfolio Summary",
        body: `Your bullion portfolio is worth ${money(portfolio.totalValue)}.${changeText}`,
        tag: `benza-daily-${local.date}`, url: "https://imaginative-dasik-a59d9a.netlify.app/",
      });
      sent += r.sent; failed += r.failed;
      if (r.sent > 0) { await recordEvent(pref.user_id, "daily_summary", key); results.push({ type: "daily_summary", user_id: pref.user_id, value: portfolio.totalValue }); }
    }

    // Record today's portfolio value for every preference row once per local date.
    for (const pref of prefs || []) {
      const local = localParts(pref.timezone || "America/Chicago");
      const portfolio = portfolios.get(pref.user_id) || { totalValue: 0, totalCost: 0 };
      await supabase.from("portfolio_notification_baselines").upsert({
        user_id: pref.user_id, local_date: local.date, total_value: portfolio.totalValue, captured_at: new Date().toISOString(),
      }, { onConflict: "user_id,local_date", ignoreDuplicates: true });
    }

    return reply({ success: true, checked_users: (prefs || []).length, notifications_sent: sent, notifications_failed: failed, events: results, prices });
  } catch (error) {
    console.error(error);
    return reply({ success: false, error: error instanceof Error ? error.message : JSON.stringify(error) }, 500);
  }
});
