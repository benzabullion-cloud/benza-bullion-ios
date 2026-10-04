import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const userId = user.id;

    // Remove private holding documents before deleting database/auth records.
    // Storage objects do not cascade automatically when an Auth user is deleted.
    const inventoryBucket = admin.storage.from("holding-documents");
    const storagePaths: string[] = [];

    const walkStorage = async (prefix: string) => {
      const limit = 100;
      let offset = 0;
      while (true) {
        const { data: entries, error: listError } = await inventoryBucket.list(prefix, {
          limit,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (listError) {
          console.error("Storage list error:", listError);
          throw new Error("Unable to delete account documents");
        }
        const rows = entries ?? [];
        for (const entry of rows) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id) storagePaths.push(path);
          else await walkStorage(path);
        }
        if (rows.length < limit) break;
        offset += limit;
      }
    };

    const { data: rootEntries, error: rootListError } = await inventoryBucket.list(`${userId}/inventory`, { limit: 1 });
    if (rootListError) {
      console.error("Storage root list error:", rootListError);
      throw new Error("Unable to delete account documents");
    }
    if ((rootEntries ?? []).length > 0) {
      await walkStorage(`${userId}/inventory`);
      for (let i = 0; i < storagePaths.length; i += 100) {
        const { error: removeError } = await inventoryBucket.remove(storagePaths.slice(i, i + 100));
        if (removeError) {
          console.error("Storage remove error:", removeError);
          throw new Error("Unable to delete account documents");
        }
      }
    }

    // Remove user-owned Benza data before deleting Auth user.
    // Each delete is intentionally scoped to this authenticated user's ID.
    const tables = [
  "notification_subscriptions",
  "price_alerts",
  "notification_preferences",
  "notification_events",
  "portfolio_notification_baselines",
  "portfolio_snapshots",
  "transactions",
  "holdings",
];
    for (const table of tables) {
      const { error } = await admin
        .from(table)
        .delete()
        .eq("user_id", userId);

      // Ignore missing-table errors so the deletion flow
      // remains compatible if a table is not present.
      if (error && error.code !== "42P01") {
        console.error(`Delete error in ${table}:`, error);
        throw new Error(`Unable to delete account data`);
      }
    }

    const { error: deleteUserError } =
      await admin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error("Auth deletion error:", deleteUserError);
      throw new Error("Unable to delete user account");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account deleted",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error
          ? error.message
          : "Unexpected error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});