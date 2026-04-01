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
      const response = await fetchWithTimeout(form.page_url, {
        method: "GET",
        headers: {
          "User-Agent": "ACTV-TRKR-FormCheck/1.3.2",
        },
      }, 6000);

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function triggerWordPressRoute(
  siteUrl: string,
  keyHash: string,
  route: "sync" | "backfill-avada",
  timeoutMs = 8000,
): Promise<{ response: Response; endpoint: string }> {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const endpoints = [
    `${normalizedSiteUrl}/wp-json/actv-trkr/v1/${route}`,
    `${normalizedSiteUrl}/?rest_route=/actv-trkr/v1/${route}`,
  ];
  const body = JSON.stringify({ triggered_from: "dashboard", key_hash: keyHash });

  let lastFailure: { response: Response; endpoint: string } | null = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`Triggering ${route} on ${endpoint}`);
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }, timeoutMs);

      if (response.ok) {
        return { response, endpoint };
      }

      const bodyPreview = await response.clone().text();
      console.error(`WP ${route} failed on ${endpoint}: ${response.status} ${bodyPreview}`);
      lastFailure = { response, endpoint };
    } catch (err) {
      console.error(`WP ${route} request failed on ${endpoint}:`, err);
    }
  }

  if (lastFailure) return lastFailure;

  console.error(`WP ${route} all endpoints failed`);
  return {
    response: new Response("All endpoints timed out", { status: 504 }),
    endpoint: endpoints[0],
  };
}

async function triggerWordPressSync(siteUrl: string, keyHash: string): Promise<{ response: Response; endpoint: string }> {
  return triggerWordPressRoute(siteUrl, keyHash, "sync");
}

async function triggerWordPressAvadaBackfill(siteUrl: string, keyHash: string): Promise<{ response: Response; endpoint: string }> {
  return triggerWordPressRoute(siteUrl, keyHash, "backfill-avada", 60000);
}

async function triggerWordPressEntryBackfill(siteUrl: string, keyHash: string): Promise<{ response: Response; endpoint: string }> {
  return triggerWordPressRoute(siteUrl, keyHash, "backfill-entries", 60000);
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

    const { site_id, force_backfill } = await req.json();
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

    const minimumPluginVersion = "1.3.4";
    const minimumAvadaPluginVersion = "1.3.12";
    const pluginOutdated = !isVersionAtLeast(site.plugin_version, minimumPluginVersion);

    // Check if site has any Avada forms
    const { data: avadaForms, count: avadaFormCount } = await supabase
      .from("forms")
      .select("id", { count: "exact" })
      .eq("org_id", site.org_id)
      .eq("site_id", site.id)
      .eq("provider", "avada")
      .eq("archived", false);
    const avadaFormIds = (avadaForms || []).map((form) => form.id);
    const hasAvadaForms = (avadaFormCount || 0) > 0;

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

    // Skip direct form checks when WP sync succeeded — it already did the work
    const fallback = { checked: 0, updatedPageUrls: 0, alertsCreated: 0 };

    // Extract structured data from WP result
    const wpResult = (wpData as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    const trashed = Number(wpResult?.trashed || 0);
    const restored = Number(wpResult?.restored || 0);
    const wpWarnings = (wpResult?.warnings as string[]) || [];
    const avadaDiagnostics = (wpResult?.avada_diagnostics as unknown[]) || [];
    const runtimePluginVersion = (wpResult?.plugin_version as string) || site.plugin_version || null;
    const runtimePluginOutdated = !isVersionAtLeast(runtimePluginVersion, minimumPluginVersion);
    const runtimeNeedsAvadaFix = hasAvadaForms && !isVersionAtLeast(runtimePluginVersion, minimumAvadaPluginVersion);

    // Detect requires_avada_reset flag from sync-entries response.
    // Backward compatibility: older WP plugin payloads only surfaced warning text.
    const warningImpliesAvadaReset = wpWarnings.some((warning) => {
      const lower = warning.toLowerCase();
      return (
        lower.includes("entries would be trashed with zero matches") ||
        lower.includes("likely a discovery issue")
      );
    });

    const requiresAvadaReset = Boolean(wpResult?.requires_avada_reset) || warningImpliesAvadaReset;
    const blockedReason =
      (wpResult?.blocked_reason as string | null) ||
      (warningImpliesAvadaReset ? "legacy_id_deadlock" : null);

    // Auto-backfill Avada entries when the site has Avada forms but no synchronized data
    let avadaBackfillAttempted = false;
    let avadaBackfillEntries = 0;
    let avadaBackfillError: string | null = null;
    let avadaBackfillRouteMissing = false;

    let avadaActiveLeadCount = 0;
    let avadaRawEventCount = 0;
    let avadaLeadsWithEmptyFields = 0;

    if (hasAvadaForms && avadaFormIds.length > 0) {
      const [{ count: activeLeadCount }, { count: rawEventCount }] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", site.org_id)
          .eq("site_id", site.id)
          .in("form_id", avadaFormIds)
          .neq("status", "trashed"),
        supabase
          .from("lead_events_raw")
          .select("id", { count: "exact", head: true })
          .eq("org_id", site.org_id)
          .eq("site_id", site.id)
          .in("form_id", avadaFormIds),
      ]);

      avadaActiveLeadCount = activeLeadCount || 0;
      avadaRawEventCount = rawEventCount || 0;

      // Count Avada leads that have zero lead_fields_flat rows (empty field data)
      if (avadaActiveLeadCount > 0) {
        const { data: leadsWithFields } = await supabase
          .from("lead_fields_flat")
          .select("lead_id")
          .eq("org_id", site.org_id)
          .in("lead_id", (await supabase
            .from("leads")
            .select("id")
            .eq("org_id", site.org_id)
            .eq("site_id", site.id)
            .in("form_id", avadaFormIds)
            .neq("status", "trashed")
            .limit(500)
          ).data?.map((l: { id: string }) => l.id) || []);

        const leadsWithFieldIds = new Set((leadsWithFields || []).map((r: { lead_id: string }) => r.lead_id));

        const { data: allAvadaLeads } = await supabase
          .from("leads")
          .select("id")
          .eq("org_id", site.org_id)
          .eq("site_id", site.id)
          .in("form_id", avadaFormIds)
          .neq("status", "trashed")
          .limit(500);

        avadaLeadsWithEmptyFields = (allAvadaLeads || []).filter(
          (l: { id: string }) => !leadsWithFieldIds.has(l.id)
        ).length;

        console.log(`Avada leads with empty fields: ${avadaLeadsWithEmptyFields}/${avadaActiveLeadCount}`);
      }
    }

    const shouldAutoBackfillAvada =
      hasAvadaForms &&
      avadaFormIds.length > 0 &&
      (requiresAvadaReset || (avadaActiveLeadCount === 0 && avadaRawEventCount === 0) || avadaLeadsWithEmptyFields > 0);

    if (shouldAutoBackfillAvada) {
      avadaBackfillAttempted = true;
      // Fire-and-forget: don't await the backfill response to avoid edge function timeout.
      // The backfill runs on WordPress and will ingest data via the normal ingest endpoints.
      triggerWordPressAvadaBackfill(siteUrl, apiKeyRow.key_hash)
        .then(async ({ response: backfillRes, endpoint: backfillEndpoint }) => {
          if (!backfillRes.ok) {
            const backfillBody = await backfillRes.text();
            console.error(`WP Avada backfill failed (${backfillEndpoint}): ${backfillRes.status} ${backfillBody}`);
          } else {
            const backfillRaw = await backfillRes.text();
            console.log(`WP Avada backfill succeeded (${backfillEndpoint}): ${backfillRaw.slice(0, 200)}`);
          }
        })
        .catch((err) => {
          console.error("WP Avada backfill fire-and-forget error:", err);
        });
      // Don't set error/entries here — backfill is async now
      console.log("Avada backfill triggered (fire-and-forget)");
    }

    // ── Auto-backfill non-Avada entries (Gravity Forms, WPForms, CF7, etc.) ──
    // If force_backfill is true (manual sync), always trigger backfill for ALL forms.
    // Otherwise, only trigger when forms have zero leads.
    let entryBackfillAttempted = false;

    {
      const nonAvadaFormRows = await supabase
        .from("forms")
        .select("id")
        .eq("org_id", site.org_id)
        .eq("site_id", site.id)
        .neq("provider", "avada")
        .eq("archived", false);

      const nonAvadaFormIds = (nonAvadaFormRows.data || []).map((f: any) => f.id);

      if (nonAvadaFormIds.length > 0) {
        let shouldBackfill = !!force_backfill;

        if (!shouldBackfill) {
          // Check each form individually — backfill if ANY form has zero leads
          const leadCountsByForm = await Promise.all(
            nonAvadaFormIds.map(async (formId: string) => {
              const { count } = await supabase
                .from("leads")
                .select("id", { count: "exact", head: true })
                .eq("form_id", formId)
                .neq("status", "trashed");
              return { formId, count: count || 0 };
            })
          );

          const formsWithZeroLeads = leadCountsByForm.filter((f) => f.count === 0);
          shouldBackfill = formsWithZeroLeads.length > 0;
        }

        if (shouldBackfill) {
          entryBackfillAttempted = true;
          console.log(`Entry backfill triggered (force=${!!force_backfill}): ${nonAvadaFormIds.length} non-Avada forms`);
          triggerWordPressEntryBackfill(siteUrl, apiKeyRow.key_hash)
            .then(async ({ response: bfRes, endpoint: bfEndpoint }) => {
              if (!bfRes.ok) {
                const bfBody = await bfRes.text();
                console.error(`WP entry backfill failed (${bfEndpoint}): ${bfRes.status} ${bfBody}`);
              } else {
                const bfRaw = await bfRes.text();
                console.log(`WP entry backfill succeeded (${bfEndpoint}): ${bfRaw.slice(0, 200)}`);
              }
            })
            .catch((err) => {
              console.error("WP entry backfill fire-and-forget error:", err);
            });
        }
      }
    }

    // Fire-and-forget: check domain/SSL health if no records exist yet
    try {
      const { count: dhCount } = await supabase.from("domain_health").select("id", { count: "exact", head: true }).eq("site_id", site.id);
      if ((dhCount || 0) === 0) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const srvKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/check-domain-ssl`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${srvKey}` },
          body: JSON.stringify({ site_id: site.id }),
        }).then(r => console.log(`Domain/SSL check triggered for site ${site.id}: ${r.status}`))
          .catch(e => console.error("Domain/SSL check failed:", e));
      }
    } catch (e) {
      console.error("Domain/SSL check trigger error:", e);
    }

    // Update site plugin_version if runtime version is newer
    if (runtimePluginVersion && runtimePluginVersion !== site.plugin_version) {
      await supabase.from("sites").update({ plugin_version: runtimePluginVersion }).eq("id", site.id);
    }

    // Classify sync_status with reason codes
    let syncStatus: "ok" | "partial" | "blocked" = "ok";
    const reasonCodes: string[] = [];

    // If sync-entries flagged a deadlock, force blocked
    if (requiresAvadaReset) {
      syncStatus = "blocked";
      reasonCodes.push("legacy_id_deadlock");
    }

    // When backfill was just triggered, count mismatch warnings are expected — filter them out
    const filteredWarnings = (entryBackfillAttempted || avadaBackfillAttempted)
      ? wpWarnings.filter((w) => !w.toLowerCase().includes("count mismatch"))
      : wpWarnings;

    if (filteredWarnings.length > 0) {
      const warningText = filteredWarnings.map((w) => w.toLowerCase()).join("\n");
      const avadaWarnings = filteredWarnings.filter((w) => w.toLowerCase().includes("avada"));
      const hasAllAvadaWarnings = avadaWarnings.length > 0 && avadaWarnings.length === filteredWarnings.length;
      const hasAllEmptyWarning = warningText.includes("reported 0 active entries");
      const hasDuplicateSetWarning = warningText.includes("identical entry lists") || warningText.includes("identical active-entry lists") || warningText.includes("duplicate/overlapping active id sets");

      if (hasAllAvadaWarnings && hasAllEmptyWarning && trashed === 0 && restored === 0) {
        syncStatus = "blocked";
        reasonCodes.push("avada_discovery_empty");
      } else if (hasAllAvadaWarnings && hasDuplicateSetWarning) {
        if (syncStatus !== "blocked") syncStatus = "partial";
        reasonCodes.push("avada_duplicate_sets_safe_mode");
      } else {
        if (syncStatus !== "blocked") syncStatus = "partial";
      }
    }

    // Force blocked/partial when plugin is outdated and site has Avada forms
    if (runtimeNeedsAvadaFix && syncStatus === "ok") {
      syncStatus = "partial";
      reasonCodes.push("plugin_outdated");
    }

    if (avadaBackfillError) {
      if (syncStatus === "ok") syncStatus = "partial";
      reasonCodes.push(avadaBackfillRouteMissing ? "avada_backfill_route_missing" : "avada_backfill_failed");
    }

    if (avadaBackfillAttempted && avadaBackfillEntries > 0) {
      reasonCodes.push("avada_backfill_reimported");
    }

    let pluginWarning: string | null = null;
    if (runtimePluginOutdated) {
      pluginWarning = `Detected ACTV TRKR ${runtimePluginVersion || "unknown"}. Please install v${minimumPluginVersion} or newer for reliable sync.`;
    } else if (runtimeNeedsAvadaFix) {
      pluginWarning = `Plugin v${runtimePluginVersion || "unknown"} cannot read Avada form entries correctly. Download v${minimumAvadaPluginVersion} from Settings → Plugin and re-sync.`;
    }

    return new Response(JSON.stringify({
      ok: true,
      sync_status: syncStatus,
      reason_codes: reasonCodes,
      requires_avada_reset: requiresAvadaReset,
      blocked_reason: blockedReason,
      wp_result: wpData,
      plugin_warning: pluginWarning,
      warnings: filteredWarnings,
      avada_diagnostics: avadaDiagnostics,
      runtime_plugin_version: runtimePluginVersion,
      avada_backfill_attempted: avadaBackfillAttempted,
      avada_backfill_entries: avadaBackfillEntries,
      avada_backfill_error: avadaBackfillError,
      entry_backfill_attempted: entryBackfillAttempted,
      backfill_in_progress: entryBackfillAttempted || avadaBackfillAttempted,
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
