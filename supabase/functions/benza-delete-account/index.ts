import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "npm:jose@6.1.0";
import { revokeAppleAccess } from "./apple-revocation.mjs";

const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

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

    if ((user.identities ?? []).some((identity) => identity.provider === "apple")) {
      const body = await req.json().catch(() => ({}));
      const clientId = Deno.env.get("BENZA_APPLE_CLIENT_ID");
      const teamId = Deno.env.get("BENZA_APPLE_TEAM_ID");
      const keyId = Deno.env.get("BENZA_APPLE_KEY_ID");
      const privateKey = Deno.env.get("BENZA_APPLE_PRIVATE_KEY");
      let clientSecret;
      if (clientId && teamId && keyId && privateKey) {
        clientSecret = await new SignJWT({})
          .setProtectedHeader({ alg: "ES256", kid: keyId })
          .setIssuer(teamId).setAudience("https://appleid.apple.com")
          .setSubject(clientId).setIssuedAt().setExpirationTime("5m")
          .sign(await importPKCS8(privateKey, "ES256"));
      }
      await revokeAppleAccess({
        user, refreshToken: body.apple_refresh_token, clientId, clientSecret,
        verifyIdentity: async (token: string, audience: string) => {
          const { payload } = await jwtVerify(token, appleKeys, {
            issuer: "https://appleid.apple.com", audience, algorithms: ["RS256"],
          });
          return payload;
        },
      });
    }

    // Storage objects do not cascade when an Auth user is deleted.
    const removeStorageFolder = async (bucketName: string, root: string) => {
      const bucket = admin.storage.from(bucketName);
      const paths: string[] = [];
      const limit = 100;
      const walk = async (prefix: string) => {
        for (let offset = 0;; offset += limit) {
          const { data, error } = await bucket.list(prefix, {
            limit,
            offset,
            sortBy: { column: "name", order: "asc" },
          });
          if (error) throw error;
          const rows = data ?? [];
          for (const entry of rows) {
            const path = `${prefix}/${entry.name}`;
            if (entry.id) paths.push(path);
            else await walk(path);
          }
          if (rows.length < limit) break;
        }
      };

      await walk(root);
      for (let index = 0; index < paths.length; index += limit) {
        const { error } = await bucket.remove(paths.slice(index, index + limit));
        if (error) throw error;
      }
    };

    try {
      await removeStorageFolder("holding-documents", `${userId}/inventory`);
      // Keep account deletion compatible with deployments that precede Community.
      const { data: buckets, error } = await admin.storage.listBuckets();
      if (error) throw error;
      if (buckets?.some(bucket => bucket.id === "bullion-community")) {
        await removeStorageFolder("bullion-community", userId);
        await removeStorageFolder("bullion-community", `published/${userId}`);
      }
    } catch (error) {
      console.error("Storage cleanup failed:", error);
      throw new Error("Unable to delete account documents");
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
