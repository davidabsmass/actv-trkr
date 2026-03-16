import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FormRow = {
  id: string;
  name: string;
  provider: string;
  external_form_id: string;
  page_url: string | null;
};

function parseVersion(version: string | null | undefined): [number, number, number] {
  if (!version) return [0, 0, 0];
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isVersionAtLeast(version: string | null | undefined, minimum: string): boolean {
  const [major, minor, patch] = parseVersion(version);
  const [minMajor, minMinor, minPatch] = parseVersion(minimum);

  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

function normalizePageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const noiseParams = ["preview", "preview_id", "preview_nonce", "_thumbnail_id", "ver"];
    for (const key of noiseParams) {
      url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return raw.startsWith("http://") || raw.startsWith("https://") ? raw : null;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectFormInHtml(html: string, provider: string, externalFormId: string): boolean {
  const fid = escapeRegex(externalFormId);

  switch (provider) {
    case "gravity_forms":
      return new RegExp(`gform_wrapper[^"']*_${fid}|id=["']gform_${fid}["']|gform_submit_button_${fid}`, "i").test(html);
    case "cf7":
      return new RegExp(`wpcf7|contact-form-7|id=["']wpcf7-f${fid}`, "i").test(html);
    case "wpforms":
      return new RegExp(`wpforms-form|wpforms-container|data-formid=["']${fid}["']`, "i").test(html);
    case "ninja_forms":
      return /nf-form-cont|ninja-forms-/i.test(html);
    case "fluent_forms":
      return /fluentform|ff-el-group/i.test(html);
    case "avada":
      return /fusion-form|fusion-form-form-wrapper/i.test(html);
    default:
      return /<form[^>]*>/i.test(html);
  }
}

async function hydrateMissingPageUrls(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  siteId: string,
  forms: FormRow[],
): Promise<{ forms: FormRow[]; updatedPageUrls: number }> {
  let updatedPageUrls = 0;
  const hydrated: FormRow[] = [];

  for (const form of forms) {
    let pageUrl = normalizePageUrl(form.page_url);

    if (!pageUrl) {
      const { data: leadUrls } = await supabase
        .from("leads")
        .select("page_url, submitted_at")
        .eq("org_id", orgId)
        .eq("site_id", siteId)
        .eq("form_id", form.id)
        .not("page_url", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(25);

      const candidate = (leadUrls || [])
        .map((row) => normalizePageUrl(row.page_url as string | null))
        .find(Boolean) || null;

      if (candidate) {
        await supabase
          .from("forms")
          .update({ page_url: candidate })
          .eq("id", form.id);
        pageUrl = candidate;
        updatedPageUrls += 1;
      }
    }

    hydrated.push({ ...form, page_url: pageUrl });
  }

  return { forms: hydrated, updatedPageUrls };
}

async function runDirectFormChecks(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  siteId: string,
) {
  const { data: forms, error: formsError } = await supabase
    .from("forms")
    .select("id, name, provider, external_form_id, page_url")
    .eq("org_id", orgId)
    .eq("site_id", siteId)
    .eq("archived", false);

  if (formsError) throw formsError;
  if (!forms?.length) {
    return { checked: 0, updatedPageUrls: 0, alertsCreated: 0 };
  }

  const { forms: hydratedForms, updatedPageUrls } = await hydrateMissingPageUrls(supabase, orgId, siteId, forms as FormRow[]);

  let checked = 0;
  let alertsCreated = 0;

  for (const form of hydratedForms) {
    if (!form.page_url) continue;

    const now = new Date().toISOString();
    let rendered = false;

    try {
      const response = await fetch(form.page_url, {
        method: "GET",
        headers: {
          "User-Agent": "ACTV-TRKR-FormCheck/1.3.2",
        },
      });

      if (response.ok) {
        const html = await response.text();
        rendered = detectFormInHtml(html, form.provider, form.external_form_id);
      }
    } catch {
      rendered = false;
    }

    const { data: existing } = await supabase
      .from("form_health_checks")
      .select("is_rendered")
      .eq("org_id", orgId)
      .eq("site_id", siteId)
      .eq("form_id", form.id)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      org_id: orgId,
      site_id: siteId,
      form_id: form.id,
      is_rendered: rendered,
      page_url: form.page_url,
      last_checked_at: now,
    };

    if (rendered) {
      upsertData.last_rendered_at = now;
    }

    await supabase
      .from("form_health_checks")
      .upsert(upsertData, { onConflict: "org_id,site_id,form_id" });

    if ((existing?.is_rendered ?? true) && !rendered) {
      await supabase.from("monitoring_alerts").insert({
        org_id: orgId,
        site_id: siteId,
        alert_type: "FORM_NOT_RENDERED",
        severity: "critical",
        subject: "Form not found on page",
        message: `The form (${form.name}) was not detected on ${form.page_url}.`,
        status: "queued",
      });
      alertsCreated += 1;
    }

    checked += 1;
  }

  return { checked, updatedPageUrls, alertsCreated };
}

async function triggerWordPressSync(siteUrl: string, keyHash: string): Promise<{ response: Response; endpoint: string }> {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const endpoints = [
    `${normalizedSiteUrl}/wp-json/actv-trkr/v1/sync`,
    `${normalizedSiteUrl}/?rest_route=/actv-trkr/v1/sync`,
  ];

  let lastResponse: Response | null = null;
  let lastEndpoint = endpoints[0];

  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    lastEndpoint = endpoint;
    console.log(`Triggering sync on ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggered_from: "dashboard", key_hash: keyHash }),
    });

    if (response.ok) {
      return { response, endpoint };
    }

    lastResponse = response;
    const bodyPreview = (await response.clone().text()).toLowerCase();
    const isMissingRoute = response.status === 404 && bodyPreview.includes("rest_no_route");

    console.error(`WP sync failed on ${endpoint}: ${response.status} ${bodyPreview}`);

    if (!isMissingRoute || i === endpoints.length - 1) {
      return { response, endpoint };
    }
  }

  return { response: lastResponse!, endpoint: lastEndpoint };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { site_id } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: "Missing site_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: site } = await supabase
      .from("sites").select("id, domain, org_id, url, plugin_version")
      .eq("id", site_id).maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pluginOutdated = !isVersionAtLeast(site.plugin_version, "1.3.4");
    const pluginNeedsAvadaFix = !isVersionAtLeast(site.plugin_version, "1.3.6");

    const { data: membership } = await supabase
      .from("org_users").select("role")
      .eq("org_id", site.org_id).eq("user_id", user.id).maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: apiKeyRow } = await supabase
      .from("api_keys").select("key_hash")
      .eq("org_id", site.org_id).is("revoked_at", null)
      .limit(1).maybeSingle();

    if (!apiKeyRow?.key_hash) {
      return new Response(JSON.stringify({ error: "No API key found for this org. Please generate an API key first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = site.url || `https://${site.domain}`;
    const { response: wpRes, endpoint: wpEndpoint } = await triggerWordPressSync(siteUrl, apiKeyRow.key_hash);

    if (!wpRes.ok) {
      const text = await wpRes.text();
      console.error(`WP sync failed (${wpEndpoint}): ${wpRes.status} ${text}`);

      const fallback = await runDirectFormChecks(supabase, site.org_id, site.id);
      if (fallback.checked > 0 || fallback.updatedPageUrls > 0) {
        return new Response(JSON.stringify({
          ok: true,
          fallback: true,
          reason: `WordPress sync route unavailable (${wpRes.status})`,
          wp_error: text,
          endpoint_attempted: wpEndpoint,
          plugin_warning: pluginOutdated
            ? `Detected ACTV TRKR ${site.plugin_version || "unknown"}. Please install v1.3.4 or newer for reliable entry reconciliation.`
            : null,
          ...fallback,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: `WordPress returned ${wpRes.status}`, details: text, endpoint_attempted: wpEndpoint }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wpRaw = await wpRes.text();
    let wpData: unknown = { raw: wpRaw };
    try {
      wpData = JSON.parse(wpRaw);
    } catch {
      // Keep raw string
    }

    const fallback = await runDirectFormChecks(supabase, site.org_id, site.id);

    return new Response(JSON.stringify({
      ok: true,
      wp_result: wpData,
      plugin_warning: pluginOutdated
        ? `Detected ACTV TRKR ${site.plugin_version || "unknown"}. Please install v1.3.4 or newer for reliable entry reconciliation.`
        : null,
      ...fallback,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("trigger-site-sync error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
