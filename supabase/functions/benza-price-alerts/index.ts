import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
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

const APP_URL = "https://benzabullion.com";
const VAPID_SUBJECT = APP_URL;

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_PRIVATE_KEY = (Deno.env.get("APNS_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.benzabullion.app";
let cachedApnsJwt = "";
let cachedApnsJwtIssuedAt = 0;

const symbols: Record<string, string> = {
  gold: "XAU",
  silver: "XAG",
  platinum: "XPT",
  palladium: "XPD",
  copper: "HG",
};

const metalNames: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
  copper: "Copper",
};

const MILESTONES = [
  1000,
  2500,
  5000,
  10000,
  25000,
  50000,
  100000,
];

const DEFAULT_PREFS = {
  price_targets: true,
  daily_summary: false,
  big_market_moves: true,
  portfolio_milestones: true,
  daily_summary_hour: 8,
  big_move_percent: 3,
  timezone: "America/Chicago",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function recordHealth(component: string, success: boolean, detail: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc("record_system_health", {
    p_component: component,
    p_success: success,
    p_detail: detail,
  });
  if (error) console.error("Health record failed", error);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number) {
  return `${Math.abs(value).toFixed(2)}%`;
}

function localDateAndHour(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";

    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      hour: Number(get("hour")),
    };
  } catch {
    return localDateAndHour("America/Chicago");
  }
}

async function ensureVapidConfig() {
  const { data, error } = await supabase.rpc("get_benza_vapid_config");

  if (error) {
    throw new Error(`Could not read VAPID config: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (row?.public_key && row?.private_key) {
    return {
      publicKey: row.public_key,
      privateKey: row.private_key,
    };
  }

  const keys = webpush.generateVAPIDKeys();

  const { error: saveError } = await supabase.rpc(
    "set_benza_vapid_config",
    {
      p_public_key: keys.publicKey,
      p_private_key: keys.privateKey,
    },
  );

  if (saveError) {
    throw new Error(`Could not save VAPID config: ${saveError.message}`);
  }

  return keys;
}

async function isAuthorizedWorker(req: Request) {
  const token = req.headers.get("x-benza-worker-token");

  if (!token) return false;

  const { data, error } = await supabase.rpc(
    "verify_benza_worker_token",
    { p_token: token },
  );

  return !error && data === true;
}

async function fetchMetalPrice(metal: string) {
  const symbol = symbols[metal];

  if (!symbol) {
    throw new Error(`Unknown metal: ${metal}`);
  }

  const response = await fetch(
    `https://api.gold-api.com/price/${symbol}`,
    { cache: "no-store", signal: AbortSignal.timeout(8000) },
  );

  if (!response.ok) {
    throw new Error(
      `Price request failed for ${metal}: ${response.status}`,
    );
  }

  const data = await response.json();
  let value = Number(data.price);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${metal} price`);
  }

  // Gold API HG = USD / avoirdupois pound.
  // Benza tracks copper by avoirdupois ounce.
  if (metal === "copper") {
    value /= 16;
  }

  return value;
}

async function fetchAllPrices() {
  const prices: Record<string, number> = {};

  await Promise.all(Object.keys(symbols).map(async metal => {
    try { prices[metal] = await fetchMetalPrice(metal); }
    catch (error) { console.error(`Price error for ${metal}`, error); }
  }));

  return prices;
}

async function getPreferences(userId: string) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Preference lookup failed; skipping this account", error);
    return null;
  }

  return {
    ...DEFAULT_PREFS,
    ...(data ?? {}),
  };
}

async function getActiveUserIds() {
  const data = await allRows("notification_subscriptions", "id,user_id", [["enabled",true]]);

  return [
    ...new Set((data ?? []).map((row) => row.user_id)),
  ];
}

async function getApnsJwt() {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    const missing = [
      !APNS_KEY_ID ? "APNS_KEY_ID" : "",
      !APNS_TEAM_ID ? "APNS_TEAM_ID" : "",
      !APNS_PRIVATE_KEY ? "APNS_PRIVATE_KEY" : "",
    ].filter(Boolean).join(", ");
    throw new Error("APNs credentials are not configured. Missing: " + missing);
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && now - cachedApnsJwtIssuedAt < 3000) {
    return cachedApnsJwt;
  }

  const key = await importPKCS8(APNS_PRIVATE_KEY, "ES256");
  cachedApnsJwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: APNS_KEY_ID })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt(now)
    .sign(key);
  cachedApnsJwtIssuedAt = now;
  return cachedApnsJwt;
}

async function sendApns(deviceToken: string, payload: { title: string; body: string; tag: string; url?: string }) {
  const jwt = await getApnsJwt();
  const response = await fetch(`https://api.push.apple.com/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
      },
      benza: {
        tag: payload.tag,
        url: payload.url ?? APP_URL,
      },
    }),
  });

  if (!response.ok) {
    let reason = "";
    try { reason = (await response.json())?.reason ?? ""; } catch {}
    const error: any = new Error(`APNs push failed: ${response.status}${reason ? ` ${reason}` : ""}`);
    error.statusCode = response.status;
    throw error;
  }
}

async function sendPush(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag: string;
    url?: string;
  },
) {
  const subscriptions = await allRows("notification_subscriptions", "id,endpoint,p256dh,auth", [["user_id",userId],["enabled",true]]);

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions ?? []) {
    try {
      if (String(subscription.endpoint).startsWith("apns:")) {
        const deviceToken = String(subscription.endpoint).slice(5);
        if (!deviceToken) throw new Error("Missing APNs device token.");
        await sendApns(deviceToken, payload);
      } else {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            tag: payload.tag,
            url: payload.url ?? APP_URL,
          }),
          {
            TTL: 3600,
            urgency: "high",
          },
        );
      }

      sent++;
    } catch (error: any) {
      failed++;

      console.error("Push failed", error);

      if (
        error?.statusCode === 404 ||
        error?.statusCode === 410
      ) {
        await supabase
          .from("notification_subscriptions")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
      }
    }
  }

  return { sent, failed };
}

async function eventExists(
  userId: string,
  eventType: string,
  eventKey: string,
) {
  const { data, error } = await supabase
    .from("notification_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .eq("event_key", eventKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function recordEvent(
  userId: string,
  eventType: string,
  eventKey: string,
) {
  const { error } = await supabase
    .from("notification_events")
    .insert({
      user_id: userId,
      event_type: eventType,
      event_key: eventKey,
    });

  if (error && error.code !== "23505") {
    throw error;
  }
}

async function getPortfolioValue(
  userId: string,
  prices: Record<string, number>,
) {
  const holdings = await allRows("holdings", "id,metal,quantity,weight_oz,total_oz", [["user_id",userId]]);
  if (holdings.some(holding => !Number.isFinite(Number(prices[holding.metal])) || Number(prices[holding.metal]) <= 0)) return null;

  let total = 0;

  for (const holding of holdings ?? []) {
    const price = Number(prices[holding.metal]);

    if (!Number.isFinite(price) || price <= 0) continue;

    let ounces = Number(holding.total_oz);

    if (!Number.isFinite(ounces) || ounces <= 0) {
      const qty = Number(holding.quantity) || 0;
      const weight = Number(holding.weight_oz) || 0;
      ounces = qty * weight;
    }

    total += ounces * price;
  }

  return total;
}

async function processPriceTargets(
  prices: Record<string, number>,
) {
  const alerts = await allRows("price_alerts", "*", [["enabled",true]]);

  let sent = 0;

  for (const alert of alerts ?? []) {
    const prefs = await getPreferences(alert.user_id);
    if (!prefs) continue;

    if (!prefs.price_targets) continue;

    const current = Number(prices[alert.metal]);

    if (!Number.isFinite(current) || current <= 0) continue;

    const target = Number(alert.target);

    const reached =
      alert.direction === "higher"
        ? current >= target
        : current <= target;

    if (!reached && alert.is_triggered) {
      await supabase
        .from("price_alerts")
        .update({
          is_triggered: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alert.id);

      continue;
    }

    if (!reached || alert.is_triggered) continue;

    const name = metalNames[alert.metal] ?? alert.metal;

    const result = await sendPush(alert.user_id, {
      title: `${name} Price Alert`,
      body:
        `${name} reached your ${alert.direction} target of ` +
        `${money(target)}/oz. Current price: ${money(current)}/oz.`,
      tag: `price-${alert.id}`,
      url: APP_URL,
    });

    /*
     * Only mark the target triggered when at least one
     * notification actually reached a valid subscription.
     */
    if (result.sent > 0) {
      sent += result.sent;

      await supabase
        .from("price_alerts")
        .update({
          is_triggered: true,
          last_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", alert.id);
    }
  }

  return sent;
}

async function processMarketBaselines(
  prices: Record<string, number>,
  marketDate: string,
) {
  for (const [metal, current] of Object.entries(prices)) {
    if (!Number.isFinite(current) || current <= 0) continue;

    const { data } = await supabase
      .from("market_notification_baselines")
      .select("baseline_price")
      .eq("market_date", marketDate)
      .eq("metal", metal)
      .maybeSingle();

    if (!data) {
      await supabase
        .from("market_notification_baselines")
        .insert({
          market_date: marketDate,
          metal,
          baseline_price: current,
        });
    }
  }
}

async function processBigMarketMoves(
  prices: Record<string, number>,
  users: string[],
) {
  let sent = 0;

  /*
   * Use Central Time as the market-day baseline.
   */
  const { date: marketDate } =
    localDateAndHour("America/Chicago");

  await processMarketBaselines(prices, marketDate);

  for (const [metal, current] of Object.entries(prices)) {
    const { data: baseline } = await supabase
      .from("market_notification_baselines")
      .select("baseline_price")
      .eq("market_date", marketDate)
      .eq("metal", metal)
      .maybeSingle();

    const start = Number(baseline?.baseline_price);

    if (!Number.isFinite(start) || start <= 0) continue;

    const change = ((current - start) / start) * 100;

    for (const userId of users) {
      const prefs = await getPreferences(userId);
    if (!prefs) continue;

      if (!prefs.big_market_moves) continue;

      const threshold =
        Number(prefs.big_move_percent) || 3;

      if (Math.abs(change) < threshold) continue;

      const direction = change >= 0 ? "up" : "down";

      const eventKey =
        `${marketDate}:${metal}:${direction}`;

      if (
        await eventExists(
          userId,
          "big_market_move",
          eventKey,
        )
      ) {
        continue;
      }

      const name = metalNames[metal] ?? metal;

      const result = await sendPush(userId, {
        title: `${name} is moving`,
        body:
          `${name} is ${direction} ${percent(change)} today ` +
          `and is now ${money(current)}/oz.`,
        tag: `move-${metal}-${marketDate}-${direction}`,
        url: APP_URL,
      });

      if (result.sent > 0) {
        sent += result.sent;

        await recordEvent(
          userId,
          "big_market_move",
          eventKey,
        );
      }
    }
  }

  return sent;
}

async function processPortfolioMilestones(
  prices: Record<string, number>,
  users: string[],
) {
  let sent = 0;

  for (const userId of users) {
    const prefs = await getPreferences(userId);
    if (!prefs) continue;

    const local =
      localDateAndHour(prefs.timezone);

    const currentValue =
      await getPortfolioValue(userId, prices);
    if (currentValue === null) continue;

    const { data: previousRow } = await supabase
      .from("portfolio_notification_baselines")
      .select("local_date, total_value")
      .eq("user_id", userId)
      .order("local_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousValue =
      previousRow
        ? Number(previousRow.total_value)
        : null;

    /*
     * Don't fire historical milestone alerts on the
     * first ever baseline. Start tracking from here.
     */
    if (
      prefs.portfolio_milestones &&
      previousValue !== null &&
      Number.isFinite(previousValue)
    ) {
      for (const milestone of MILESTONES) {
        if (
          previousValue < milestone &&
          currentValue >= milestone
        ) {
          const eventKey = `milestone:${milestone}`;

          if (
            await eventExists(
              userId,
              "portfolio_milestone",
              eventKey,
            )
          ) {
            continue;
          }

          const result = await sendPush(userId, {
            title: "Portfolio Milestone",
            body:
              `Your Benza Bullion portfolio just crossed ` +
              `${money(milestone)} and is now worth ` +
              `${money(currentValue)}.`,
            tag: `milestone-${milestone}`,
            url: APP_URL,
          });

          if (result.sent > 0) {
            sent += result.sent;

            await recordEvent(
              userId,
              "portfolio_milestone",
              eventKey,
            );
          }
        }
      }
    }

    /*
     * Keep today's value current so future checks can
     * detect an actual crossing.
     */
    await supabase
      .from("portfolio_notification_baselines")
      .upsert(
        {
          user_id: userId,
          local_date: local.date,
          total_value: currentValue,
          captured_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,local_date",
        },
      );
  }

  return sent;
}

async function processDailySummaries(
  prices: Record<string, number>,
  users: string[],
) {
  let sent = 0;

  for (const userId of users) {
    const prefs = await getPreferences(userId);
    if (!prefs) continue;

    if (!prefs.daily_summary) continue;

    const local =
      localDateAndHour(prefs.timezone);

    if (
      local.hour !==
      Number(prefs.daily_summary_hour)
    ) {
      continue;
    }

    const eventKey = local.date;

    if (
      await eventExists(
        userId,
        "daily_summary",
        eventKey,
      )
    ) {
      continue;
    }

    const currentValue =
      await getPortfolioValue(userId, prices);
    if (currentValue === null) continue;

    /*
     * Find the most recent value from a previous day.
     */
    const { data: previousRow } = await supabase
      .from("portfolio_notification_baselines")
      .select("local_date, total_value")
      .eq("user_id", userId)
      .lt("local_date", local.date)
      .order("local_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let body =
      `Your bullion portfolio is worth ${money(currentValue)}.`;

    if (previousRow) {
      const previous =
        Number(previousRow.total_value);

      if (
        Number.isFinite(previous) &&
        previous > 0
      ) {
        const difference =
          currentValue - previous;

        const pct =
          (difference / previous) * 100;

        const direction =
          difference >= 0 ? "up" : "down";

        body =
          `Your portfolio is worth ${money(currentValue)}, ` +
          `${direction} ${money(Math.abs(difference))} ` +
          `(${percent(pct)}) since your previous daily snapshot.`;
      }
    }

    const result = await sendPush(userId, {
      title: "Benza Bullion Daily Summary",
      body,
      tag: `daily-summary-${local.date}`,
      url: APP_URL,
    });

    if (result.sent > 0) {
      sent += result.sent;

      await recordEvent(
        userId,
        "daily_summary",
        eventKey,
      );
    }
  }

  return sent;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders,
      });
    }

    /*
     * GET is used by the app to retrieve ONLY
     * the public VAPID key.
     */
    if (req.method === "GET") {
      const vapid = await ensureVapidConfig();

      return jsonResponse({
        success: true,
        publicKey: vapid.publicKey,
      });
    }

    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error: "Method not allowed",
        },
        405,
      );
    }

    let body: any = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    /*
     * v54/v55 app can request the key through
     * Supabase functions.invoke().
     */
    if (body?.action === "public-key") {
      const vapid = await ensureVapidConfig();

      return jsonResponse({
        success: true,
        public_key: vapid.publicKey,
        publicKey: vapid.publicKey,
      });
    }

    if (body?.action === "register-native-subscription") {
      const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!bearer) return jsonResponse({ success: false, error: "Missing user session" }, 401);

      const { data: userData, error: userError } = await supabase.auth.getUser(bearer);
      const user = userData?.user;
      if (userError || !user) {
        return jsonResponse({ success: false, error: "Invalid user session" }, 401);
      }

      const endpoint = String(body?.endpoint ?? "");
      if (!endpoint.startsWith("apns:") || endpoint.length < 20) {
        return jsonResponse({ success: false, error: "Invalid native notification endpoint" }, 400);
      }

      const { error: upsertError } = await supabase
        .from("notification_subscriptions")
        .upsert({
          user_id: user.id,
          endpoint,
          p256dh: "native-apns",
          auth: "native-apns",
          enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "endpoint" });

      if (upsertError) {
        return jsonResponse({ success: false, error: upsertError.message }, 500);
      }

      return jsonResponse({ success: true });
    }

    if (body?.action === "test-native") {
      const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!bearer) return jsonResponse({ success: false, error: "Missing user session" }, 401);

      const { data: userData, error: userError } = await supabase.auth.getUser(bearer);
      const user = userData?.user;
      if (userError || !user) {
        return jsonResponse({ success: false, error: "Invalid user session" }, 401);
      }

      const { data: subscriptions, error: subError } = await supabase
        .from("notification_subscriptions")
        .select("endpoint")
        .eq("user_id", user.id)
        .eq("enabled", true)
        .like("endpoint", "apns:%");

      if (subError) {
        return jsonResponse({ success: false, error: subError.message }, 500);
      }
      if (!subscriptions?.length) {
        return jsonResponse({ success: false, error: "No native iPhone notification device is registered for this account." }, 404);
      }

      let sent = 0;
      const failures: Array<{ status?: number; error: string }> = [];

      for (const subscription of subscriptions) {
        try {
          const deviceToken = String(subscription.endpoint).slice(5);
          await sendApns(deviceToken, {
            title: "Benza Bullion",
            body: "Your native Benza Bullion push notifications are working.",
            tag: "benza-native-test",
            url: APP_URL,
          });
          sent++;
        } catch (error: any) {
          failures.push({
            status: error?.statusCode,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!sent) {
        console.error("Native APNs test failed", JSON.stringify({
          user_id: user.id,
          failures,
          apns_key_id_present: Boolean(APNS_KEY_ID),
          apns_team_id_present: Boolean(APNS_TEAM_ID),
          apns_private_key_present: Boolean(APNS_PRIVATE_KEY),
          apns_bundle_id: APNS_BUNDLE_ID,
        }));
        return jsonResponse({
          success: false,
          error: failures[0]?.error ?? "Apple did not accept the test push.",
          failures,
        }, 502);
      }

      return jsonResponse({ success: true, sent, failures });
    }

    if (!(await isAuthorizedWorker(req))) {
      return jsonResponse(
        { success: false, error: "Unauthorized worker request" },
        401,
      );
    }

    const vapid = await ensureVapidConfig();

    webpush.setVapidDetails(
      VAPID_SUBJECT,
      vapid.publicKey,
      vapid.privateKey,
    );

    const prices = await fetchAllPrices();

    const users = await getActiveUserIds();

    const results = {
      price_targets: 0,
      big_market_moves: 0,
      portfolio_milestones: 0,
      daily_summaries: 0,
    };

    results.price_targets =
      await processPriceTargets(prices);

    results.big_market_moves =
      await processBigMarketMoves(
        prices,
        users,
      );

    /*
     * Milestones update the rolling portfolio baseline,
     * so run summaries first to preserve yesterday's
     * comparison where available.
     */
    results.daily_summaries =
      await processDailySummaries(
        prices,
        users,
      );

    results.portfolio_milestones =
      await processPortfolioMilestones(
        prices,
        users,
      );

    await recordHealth("price_alert_worker", true, {
      users_checked: users.length,
      notifications_sent:
        results.price_targets +
        results.big_market_moves +
        results.portfolio_milestones +
        results.daily_summaries,
    });

    return jsonResponse({
      success: true,
      users_checked: users.length,
      notifications_sent:
        results.price_targets +
        results.big_market_moves +
        results.portfolio_milestones +
        results.daily_summaries,
      results,
      prices,
    });
  } catch (error) {
    console.error(error);

    await recordHealth("price_alert_worker", false, {
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});