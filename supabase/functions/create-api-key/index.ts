// create-api-key: generates a secure API key, returns plaintext ONCE,
// stores only sha-256 hash + label in api_keys. Admin-only.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(byteLen = 32): string {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orgId: string | undefined = body.org_id;
    const label: string = String(body.label ?? "").trim().slice(0, 100);
    if (!orgId || !label) {
      return new Response(JSON.stringify({ error: "org_id and label required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Verify caller is admin in this org (server-side, do not trust client)
    const { data: roleRow } = await admin
      .from("org_users")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    let isOrgAdmin = roleRow?.role === "admin";
    if (!isOrgAdmin) {
      const { data: appRoles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      isOrgAdmin = (appRoles ?? []).some((r: any) => r.role === "admin");
    }

    if (!isOrgAdmin) {
      // Audit denial
      await admin.from("security_audit_log").insert({
        org_id: orgId,
        user_id: userData.user.id,
        actor_type: "user",
        event_type: "permission_violation",
        severity: "warn",
        message: "Non-admin attempted to create API key",
      });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate token: prefix + random
    const prefix = "atk_" + randomToken(2); // 8 chars after atk_
    const secret = randomToken(32);
    const fullKey = `${prefix}_${secret}`;
    const hashed = await sha256Hex(fullKey);

    const { data: inserted, error: insertErr } = await admin
      .from("api_keys")
      .insert({ org_id: orgId, label, key_hash: hashed })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Audit
    await admin.from("security_audit_log").insert({
      org_id: orgId,
      user_id: userData.user.id,
      actor_type: "admin",
      event_type: "api_key_created",
      severity: "info",
      metadata: { api_key_id: inserted.id, label, prefix },
    });

    return new Response(JSON.stringify({ key: fullKey, prefix, id: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[create-api-key]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
