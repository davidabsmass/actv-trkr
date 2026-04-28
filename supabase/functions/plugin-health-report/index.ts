/**
 * plugin-health-report
 *
 * Receives crash-containment telemetry from the ACTV TRKR WordPress plugin.
 * Used by operators to see which sites are stuck in reduced_mode or
 * migration_locked across the entire fleet.
 *
 * Auth: site API key (x-api-key) — same scheme as other ingestion endpoints.
 * Wildcard CORS so it can be called from any plugin install.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { wildcardCorsHeaders } from "../_shared/cors.ts";
import { observe } from "../_shared/observability.ts";

interface HealthPayload {
  domain?: string;
  plugin_version?: string;
  mode?: string;
  forced_safe_mode?: boolean;
  boot_failure_count?: number;
  in_boot_loop?: boolean;
  migration_version?: number | null;
  migration_lock_held?: boolean;
  disabled_modules?: string[];
  open_breakers?: string[];
  last_error?: string | null;
  blocked_versions?: string[];
  last_healthy_version?: string | null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDomain(d: string | undefined): string {
  if (!d) return "";
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function clampStr(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  return s.slice(0, max);
}

function clampStrArr(arr: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === "string")
    .slice(0, maxItems)
    .map((x) => (x as string).slice(0, maxLen));
}

const ALLOWED_MODES = new Set([
  "healthy",
  "reduced_mode",
  "migration_locked",
  "safe_mode",
  "unknown",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: wildcardCorsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "missing_api_key" }), {
        status: 401,
        headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const keyHash = await sha256Hex(apiKey);
    const { data: keyRow, error: keyErr } = await sb
      .from("api_keys")
      .select("org_id, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr || !keyRow || keyRow.revoked_at) {
      return new Response(JSON.stringify({ error: "invalid_api_key" }), {
        status: 401,
        headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = keyRow.org_id as string;

    let body: HealthPayload;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = normalizeDomain(body.domain);
    if (!domain) {
      return new Response(JSON.stringify({ error: "missing_domain" }), {
        status: 400,
        headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve site by org + normalized domain (ignore www).
    let siteId: string | null = null;
    const { data: site } = await sb
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .maybeSingle();
    if (site?.id) siteId = site.id;

    const mode = typeof body.mode === "string" && ALLOWED_MODES.has(body.mode) ? body.mode : "unknown";

    const row = {
      site_id: siteId,
      org_id: orgId,
      domain,
      plugin_version: clampStr(body.plugin_version, 32),
      mode,
      forced_safe_mode: !!body.forced_safe_mode,
      boot_failure_count: Number.isFinite(body.boot_failure_count) ? Math.max(0, Math.min(9999, body.boot_failure_count as number)) : 0,
      in_boot_loop: !!body.in_boot_loop,
      migration_version: Number.isFinite(body.migration_version) ? (body.migration_version as number) : null,
      migration_lock_held: !!body.migration_lock_held,
      disabled_modules: clampStrArr(body.disabled_modules, 50, 64),
      open_breakers: clampStrArr(body.open_breakers, 50, 64),
      last_error: clampStr(body.last_error, 1000),
      blocked_versions: clampStrArr(body.blocked_versions, 20, 32),
      last_healthy_version: clampStr(body.last_healthy_version, 32),
      reported_at: new Date().toISOString(),
    };

    const { error: insErr } = await sb.from("plugin_health_reports").insert(row);
    if (insErr) {
      return new Response(JSON.stringify({ error: "insert_failed", detail: insErr.message }), {
        status: 500,
        headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
      });
    }

    observe(supabase, { orgId, siteId, endpoint: "plugin-health-report", status: "ok" });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "server_error", detail: String(e) }), {
      status: 500,
      headers: { ...wildcardCorsHeaders, "Content-Type": "application/json" },
    });
  }
});
