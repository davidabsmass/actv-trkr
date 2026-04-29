import { createClient } from "npm:@supabase/supabase-js@2";

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

type KnownFormMapping = {
  form_id: string;
  external_form_id: string;
  page_url: string | null;
  page_url_candidates: string[];
  form_title?: string | null;
};

type AvadaLeadPageUrlRow = {
  form_id: string;
  page_url: string | null;
  submitted_at: string;
};

type AvadaRawEventRow = {
  form_id: string;
  payload: unknown;
  context: unknown;
  received_at: string;
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

// Detects third-party JS-embedded form builders. Many sites migrate from
// Gravity/CF7 to embedded providers (HubSpot, Mailchimp, etc.) without
// updating their dashboard registration. Our HTML probe can't execute JS,
// so the embed slot looks empty even though the form renders fine for
// real visitors. Treating these embed scripts as "form present" prevents
// noisy false-positive Form Liveness alerts.
//
// Returns the detected provider name, or null if none found.
function detectThirdPartyEmbed(html: string): string | null {
  const checks: Array<[RegExp, string]> = [
    [/js\.hsforms\.net\/forms\/embed|hsforms\.com\/embed|hbspt\.forms\.create|hs-form-frame/i, "HubSpot"],
    [/mc-embedded-subscribe|mc4wp-form|chimpstatic\.com|list-manage\.com\/subscribe/i, "Mailchimp"],
    [/constantcontact\.com\/signup|ctct-form-embed|ctct_usercontent|ctctcdn\.com\/js\/signup-form-widget|signupScript/i, "Constant Contact"],
    [/form\.jotform\.com|jotfor\.ms|jotform-form/i, "Jotform"],
    [/embed\.typeform\.com|tf-v1-widget|data-tf-widget/i, "Typeform"],
    [/formstack\.com\/forms|fs-frm/i, "Formstack"],
    [/forms\.gle\/|docs\.google\.com\/forms/i, "Google Forms"],
    [/klaviyo\.com\/onsite|klaviyo_subscribe|kl_form/i, "Klaviyo"],
    [/convertkit\.com\/forms|formkit-form|ck-form/i, "ConvertKit"],
    [/mailerlite\.com|ml-form-embed|ml-subscribe-form/i, "MailerLite"],
    [/sendinblue\.com|brevo\.com|sib-form/i, "Brevo"],
    [/aweber\.com\/form|aweber-wp-form/i, "AWeber"],
    [/getresponse\.com|gr-form/i, "GetResponse"],
    [/activecampaign\.com|_form_\d+/i, "ActiveCampaign"],
    [/substack\.com\/embed/i, "Substack"],
    [/beehiiv\.com\/embed/i, "Beehiiv"],
    [/flodesk\.com\/universal\.js|fd-form/i, "Flodesk"],
    [/tinyletter\.com\/embed/i, "TinyLetter"],
    [/sendfox\.com\/embed/i, "SendFox"],
    [/forms\.zoho\.com|zoho.*form/i, "Zoho Forms"],
    [/wufoo\.com\/embed|wufoo\.com\/forms/i, "Wufoo"],
    [/airtable\.com\/embed/i, "Airtable"],
    [/cognitoforms\.com|cognito-form/i, "Cognito Forms"],
    [/paperform\.co\/__embed/i, "Paperform"],
    [/tally\.so\/embed/i, "Tally"],
    [/fillout\.com\/embed/i, "Fillout"],
  ];
  for (const [re, name] of checks) {
    if (re.test(html)) return name;
  }
  // Generic third-party form iframe (catch-all). Recognize an <iframe> that
  // looks like it hosts a form/signup widget from an external host.
  if (/<iframe[^>]+src=["'][^"']*(form|signup|subscribe|newsletter|embed)[^"']*["']/i.test(html)) {
    return "Embedded form";
  }
  return null;
}

function hasThirdPartyFormEmbed(html: string): boolean {
  return detectThirdPartyEmbed(html) !== null;
}

function detectFormInHtml(html: string, provider: string, externalFormId: string): boolean {
  const fid = escapeRegex(externalFormId);

  let strictMatch = false;
  switch (provider) {
    case "gravity_forms": {
      // Strict: require the specific form ID in markup (not just generic GF scaffolding,
      // which many themes include site-wide).
      const strict = new RegExp(
        `gform_wrapper[^"']*_${fid}\\b|id=["']gform_${fid}["']|gform_fields_${fid}\\b|gform_submit_button_${fid}\\b|data-formid=["']${fid}["']`,
        "i",
      );
      if (strict.test(html)) strictMatch = true;
      // Loose fallback: only count if there's an actual <form> with a gform id pattern,
      // not just leftover wrapper/gfield CSS classes from a placeholder.
      else if (/<form[^>]+id=["']gform_\d+["']/i.test(html)) strictMatch = true;
      break;
    }
    case "cf7":
      strictMatch = new RegExp(`id=["']wpcf7-f${fid}|wpcf7-form[^>]*data-id=["']${fid}["']`, "i").test(html)
        || /<form[^>]+class=["'][^"']*wpcf7-form/i.test(html);
      break;
    case "wpforms":
      strictMatch = new RegExp(`data-formid=["']${fid}["']|wpforms-form-${fid}\\b`, "i").test(html)
        || /<form[^>]+class=["'][^"']*wpforms-form/i.test(html);
      break;
    case "ninja_forms":
      strictMatch = new RegExp(`nf-form-${fid}-cont|nf-form-cont[^>]+data-form-id=["']${fid}["']`, "i").test(html)
        || /<form[^>]+id=["']nf-form-/i.test(html);
      break;
    case "fluent_forms":
      strictMatch = new RegExp(`data-form_id=["']${fid}["']|ff_form_instance_${fid}\\b`, "i").test(html)
        || /<form[^>]+class=["'][^"']*frm-fluent-form/i.test(html);
      break;
    case "avada":
      strictMatch = /<form[^>]+class=["'][^"']*fusion-form|fusion-form-form-wrapper/i.test(html);
      break;
    default:
      strictMatch = /<form[^>]*>/i.test(html);
  }

  if (strictMatch) return true;

  // Provider-specific markup not found. Before declaring the form dead,
  // accept the page as "has a form" if it embeds a recognized third-party
  // form builder via JS — the user likely migrated providers without
  // updating their dashboard.
  return hasThirdPartyFormEmbed(html);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function addPageUrlCandidate(
  bucket: Map<string, { score: number; lastSeen: number }>,
  rawUrl: string | null | undefined,
  score: number,
  seenAt?: string | null,
) {
  const normalized = normalizePageUrl(rawUrl);
  if (!normalized) return;

  const existing = bucket.get(normalized);
  const lastSeen = seenAt ? Date.parse(seenAt) || 0 : 0;

  bucket.set(normalized, {
    score: (existing?.score || 0) + score,
    lastSeen: Math.max(existing?.lastSeen || 0, lastSeen),
  });
}

function extractRawEventUrlCandidates(row: Pick<AvadaRawEventRow, "payload" | "context">): string[] {
  const payload = asRecord(row.payload);
  const payloadEntry = asRecord(payload?.entry);
  const payloadContext = asRecord(payload?.context);
  const context = asRecord(row.context);

  const rawCandidates = [
    payloadEntry?.source_url,
    payload?.source_url,
    payloadContext?.page_url,
    payloadContext?.referrer,
    context?.page_url,
    context?.referrer,
  ];

  return Array.from(new Set(
    rawCandidates
      .map((value) => (typeof value === "string" ? normalizePageUrl(value) : null))
      .filter((value): value is string => Boolean(value)),
  ));
}

async function buildKnownAvadaFormMappings(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  siteId: string,
  avadaForms: Array<Pick<FormRow, "id" | "name" | "external_form_id" | "page_url">>,
): Promise<KnownFormMapping[]> {
  if (!avadaForms.length) return [];

  return await Promise.all(avadaForms.map(async (form) => {
    const [leadUrlsResult, rawEventsResult] = await Promise.all([
      supabase
        .from("leads")
        .select("form_id, page_url, submitted_at")
        .eq("org_id", orgId)
        .eq("site_id", siteId)
        .eq("form_id", form.id)
        .not("page_url", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(25),
      supabase
        .from("lead_events_raw")
        .select("form_id, payload, context, received_at")
        .eq("org_id", orgId)
        .eq("site_id", siteId)
        .eq("form_id", form.id)
        .order("received_at", { ascending: false })
        .limit(25),
    ]);

    if (leadUrlsResult.error) throw leadUrlsResult.error;
    if (rawEventsResult.error) throw rawEventsResult.error;

    const candidateScores = new Map<string, { score: number; lastSeen: number }>();

    for (const row of (leadUrlsResult.data || []) as AvadaLeadPageUrlRow[]) {
      addPageUrlCandidate(candidateScores, row.page_url, 5, row.submitted_at);
    }

    for (const row of (rawEventsResult.data || []) as AvadaRawEventRow[]) {
      for (const url of extractRawEventUrlCandidates(row)) {
        addPageUrlCandidate(candidateScores, url, 3, row.received_at);
      }
    }

    addPageUrlCandidate(candidateScores, form.page_url, 1);

    const orderedCandidates = [...candidateScores.entries()]
      .sort((a, b) => {
        const scoreDiff = b[1].score - a[1].score;
        if (scoreDiff !== 0) return scoreDiff;

        const recencyDiff = b[1].lastSeen - a[1].lastSeen;
        if (recencyDiff !== 0) return recencyDiff;

        return a[0].localeCompare(b[0]);
      })
      .map(([url]) => url)
      .slice(0, 10);

    return {
      form_id: form.id,
      external_form_id: form.external_form_id,
      form_title: form.name,
      page_url: orderedCandidates[0] || normalizePageUrl(form.page_url),
      page_url_candidates: orderedCandidates,
    };
  }));
}

async function hydrateMissingPageUrls(
  // deno-lint-ignore no-explicit-any
  supabase: any,
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
        .map((row: any) => normalizePageUrl(row.page_url as string | null))
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
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  siteId: string,
) {
  const { data: forms, error: formsError } = await supabase
    .from("forms")
    .select("id, name, provider, external_form_id, page_url, is_active, health_check_disabled")
    .eq("org_id", orgId)
    .eq("site_id", siteId)
    .eq("archived", false);

  if (formsError) throw formsError;
  if (!forms?.length) {
    return { checked: 0, updatedPageUrls: 0, alertsCreated: 0 };
  }

  // Forms disabled in WP or muted by the user shouldn't be probed and
  // shouldn't carry stale "not rendered" health rows that drive the
  // dashboard "Needs Attention" banner. Clean those up first.
  const muted = (forms as Array<FormRow & { is_active?: boolean | null; health_check_disabled?: boolean | null }>)
    .filter((f) => f.is_active === false || f.health_check_disabled === true);
  if (muted.length > 0) {
    await supabase
      .from("form_health_checks")
      .update({ is_rendered: true, last_failure_reason: null })
      .in("form_id", muted.map((f) => f.id));
  }
  const probeable = (forms as Array<FormRow & { is_active?: boolean | null; health_check_disabled?: boolean | null }>)
    .filter((f) => f.is_active !== false && f.health_check_disabled !== true);
  if (probeable.length === 0) {
    return { checked: 0, updatedPageUrls: 0, alertsCreated: 0 };
  }

  const { forms: hydratedForms, updatedPageUrls } = await hydrateMissingPageUrls(supabase, orgId, siteId, probeable as FormRow[]);

  let checked = 0;
  let alertsCreated = 0;
  let relearnedPageUrls = 0;

  for (const form of hydratedForms) {
    if (!form.page_url) continue;

    const now = new Date().toISOString();

    // Probe the recorded URL first; if it 404s or 410s, try alternate URLs
    // sourced from recent leads / raw events for this form before declaring it dead.
    const probeResult = await probeFormPage(form.page_url, form.provider, form.external_form_id);
    let { status, rendered, error } = probeResult;
    let effectiveUrl = form.page_url;
    let failureReason: string | null = computeFailureReason(status, rendered, error);

    if (!rendered && (status === 404 || status === 410)) {
      const alternates = await collectAlternateFormUrls(supabase, orgId, siteId, form);
      for (const candidate of alternates) {
        if (candidate === form.page_url) continue;
        const altProbe = await probeFormPage(candidate, form.provider, form.external_form_id);
        if (altProbe.rendered) {
          // Found the form at a different URL — relearn it.
          await supabase.from("forms").update({ page_url: candidate }).eq("id", form.id);
          status = altProbe.status;
          rendered = true;
          error = null;
          effectiveUrl = candidate;
          failureReason = null;
          relearnedPageUrls += 1;
          break;
        }
      }
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
      page_url: effectiveUrl,
      last_checked_at: now,
      last_http_status: status,
      last_failure_reason: rendered ? null : failureReason,
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
        message: `${form.name}: ${failureReason || "form markup not detected"} at ${effectiveUrl}.`,
        status: "queued",
      });
      alertsCreated += 1;
    }

    checked += 1;
  }

  return { checked, updatedPageUrls: updatedPageUrls + relearnedPageUrls, alertsCreated };
}

function computeFailureReason(status: number | null, rendered: boolean, error: string | null): string | null {
  if (rendered) return null;
  if (error) return `Could not reach page (${error})`;
  if (status === null) return "Could not reach page";
  if (status === 404 || status === 410) return `Page removed (HTTP ${status})`;
  if (status >= 500) return `Server error (HTTP ${status})`;
  if (status >= 400) return `Page blocked or unavailable (HTTP ${status})`;
  if (status >= 300) return `Page redirected (HTTP ${status})`;
  // Page loads fine but we couldn't see the form markup — almost always an
  // unrecognized third-party embed (iframe/JS widget). Soft message only.
  return "Likely a third-party embed (no warning needed)";
}

async function probeFormPage(
  pageUrl: string,
  provider: string,
  externalFormId: string,
): Promise<{ status: number | null; rendered: boolean; error: string | null }> {
  try {
    const response = await fetchWithTimeout(pageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "ACTV-TRKR-FormCheck/1.4.0",
      },
    }, 6000);

    if (!response.ok) {
      return { status: response.status, rendered: false, error: null };
    }
    const html = await response.text();
    const rendered = detectFormInHtml(html, provider, externalFormId);
    return { status: response.status, rendered, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { status: null, rendered: false, error: message.slice(0, 80) };
  }
}

async function collectAlternateFormUrls(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  siteId: string,
  form: FormRow,
): Promise<string[]> {
  const candidates = new Map<string, number>();

  const [leadsResult, rawEventsResult] = await Promise.all([
    supabase
      .from("leads")
      .select("page_url, submitted_at")
      .eq("org_id", orgId)
      .eq("site_id", siteId)
      .eq("form_id", form.id)
      .not("page_url", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(50),
    supabase
      .from("lead_events_raw")
      .select("payload, context, received_at")
      .eq("org_id", orgId)
      .eq("site_id", siteId)
      .eq("form_id", form.id)
      .order("received_at", { ascending: false })
      .limit(25),
  ]);

  for (const row of (leadsResult.data || []) as Array<{ page_url: string | null }>) {
    const norm = normalizePageUrl(row.page_url);
    if (norm) candidates.set(norm, (candidates.get(norm) || 0) + 5);
  }

  for (const row of (rawEventsResult.data || []) as Array<{ payload: unknown; context: unknown }>) {
    for (const url of extractRawEventUrlCandidates(row as AvadaRawEventRow)) {
      candidates.set(url, (candidates.get(url) || 0) + 3);
    }
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 5);
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
  timeoutMs = 120000,
  extraBody: Record<string, unknown> = {},
): Promise<{ response: Response; endpoint: string }> {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const endpoints = [
    `${normalizedSiteUrl}/wp-json/actv-trkr/v1/${route}`,
    `${normalizedSiteUrl}/?rest_route=/actv-trkr/v1/${route}`,
  ];
  const body = JSON.stringify({ triggered_from: "dashboard", key_hash: keyHash, ...extraBody });

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

async function triggerWordPressSync(
  siteUrl: string,
  keyHash: string,
  knownFormMappings: KnownFormMapping[] = [],
): Promise<{ response: Response; endpoint: string }> {
  return triggerWordPressRoute(siteUrl, keyHash, "sync", 120000, knownFormMappings.length ? { known_form_mappings: knownFormMappings } : {});
}

async function triggerWordPressAvadaBackfill(
  siteUrl: string,
  keyHash: string,
  knownFormMappings: KnownFormMapping[] = [],
): Promise<{ response: Response; endpoint: string }> {
  return triggerWordPressRoute(siteUrl, keyHash, "backfill-avada", 60000, knownFormMappings.length ? { known_form_mappings: knownFormMappings } : {});
}

type EntryBackfillCursor = {
  resume_job_index: number;
  resume_offset: number;
  resume_page: number;
};

type NonAvadaBackfillCandidate = {
  id: string;
  provider: string;
  external_form_id: string;
  activeLeadCount: number;
};

function isEntryBackfillCursor(value: unknown): value is EntryBackfillCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Record<string, unknown>;
  return ["resume_job_index", "resume_offset", "resume_page"].every(
    (key) => typeof cursor[key] === "number" && Number.isFinite(cursor[key] as number),
  );
}

async function triggerWordPressEntryBackfill(
  siteUrl: string,
  keyHash: string,
  knownFormMappings: KnownFormMapping[] = [],
  cursor?: EntryBackfillCursor,
): Promise<{ response: Response; endpoint: string }> {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const endpoints = [
    `${normalizedSiteUrl}/wp-json/actv-trkr/v1/backfill-entries`,
    `${normalizedSiteUrl}/?rest_route=/actv-trkr/v1/backfill-entries`,
  ];
  const payload: Record<string, unknown> = {
    triggered_from: "dashboard",
    key_hash: keyHash,
    max_seconds: 12,
    page_size: 50,
  };
  if (knownFormMappings.length > 0) {
    payload.known_form_mappings = knownFormMappings;
  }
  if (cursor) {
    payload.resume_job_index = cursor.resume_job_index;
    payload.resume_offset = cursor.resume_offset;
    payload.resume_page = cursor.resume_page;
  }
  const body = JSON.stringify(payload);

  let lastFailure: { response: Response; endpoint: string } | null = null;
  for (const endpoint of endpoints) {
    try {
      console.log(`Triggering backfill-entries on ${endpoint}`, cursor ? `(cursor: job=${cursor.resume_job_index} offset=${cursor.resume_offset})` : "(fresh)");
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }, 25000);

      if (response.ok) return { response, endpoint };

      const bodyPreview = await response.clone().text();
      console.error(`WP backfill-entries failed on ${endpoint}: ${response.status} ${bodyPreview}`);
      lastFailure = { response, endpoint };
    } catch (err) {
      console.error(`WP backfill-entries request failed on ${endpoint}:`, err);
    }
  }

  if (lastFailure) return lastFailure;
  return {
    response: new Response("All endpoints timed out", { status: 504 }),
    endpoint: endpoints[0],
  };
}

async function scheduleEntryBackfillContinuation(params: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  siteId: string;
  cursor: EntryBackfillCursor;
  cronSecret?: string | null;
}) {
  const { supabaseUrl, anonKey, authHeader, siteId, cursor, cronSecret } = params;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader,
    apikey: anonKey,
    "x-client-info": "actv-trkr-backfill-continuation",
  };
  if (cronSecret) {
    headers["x-cron-secret"] = cronSecret;
  }
  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/trigger-site-sync`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      site_id: siteId,
      force_backfill: true,
      backfill_cursor: cursor,
      continued_backfill: true,
    }),
  }, 5000);

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Continuation call failed (${response.status}): ${bodyText.slice(0, 300)}`);
  }

  console.log(
    `Scheduled backfill continuation for site ${siteId} at job=${cursor.resume_job_index} offset=${cursor.resume_offset} page=${cursor.resume_page}: ${bodyText.slice(0, 160)}`,
  );
}

function getBackfillProviderOrder(provider: string): number {
  switch (provider) {
    case "gravity_forms":
      return 0;
    case "wpforms":
      return 1;
    default:
      return 99;
  }
}

function compareBackfillFormIds(a: string, b: string): number {
  const aTrimmed = a.trim();
  const bTrimmed = b.trim();
  const aIsNumeric = /^\d+$/.test(aTrimmed);
  const bIsNumeric = /^\d+$/.test(bTrimmed);

  if (aIsNumeric && bIsNumeric) {
    return Number.parseInt(aTrimmed, 10) - Number.parseInt(bTrimmed, 10);
  }

  if (aIsNumeric) return -1;
  if (bIsNumeric) return 1;
  return aTrimmed.localeCompare(bTrimmed);
}

function buildPriorityEntryBackfillCursor(forms: NonAvadaBackfillCandidate[]): EntryBackfillCursor | undefined {
  const orderedForms = [...forms]
    .filter((form) => getBackfillProviderOrder(form.provider) < 99)
    .sort((a, b) => {
      const providerDiff = getBackfillProviderOrder(a.provider) - getBackfillProviderOrder(b.provider);
      if (providerDiff !== 0) return providerDiff;
      return compareBackfillFormIds(a.external_form_id, b.external_form_id);
    });

  if (orderedForms.length < 2) return undefined;

  const lowCountCandidates = orderedForms
    .map((form, index) => ({ form, index }))
    .filter(({ form, index }) => index > 0 && form.activeLeadCount <= 100)
    .sort((a, b) => b.index - a.index || a.form.activeLeadCount - b.form.activeLeadCount);

  for (const candidate of lowCountCandidates) {
    const blockedByEarlierLargeForm = orderedForms
      .slice(0, candidate.index)
      .some((form) => form.activeLeadCount >= 5000);

    if (blockedByEarlierLargeForm) {
      return {
        resume_job_index: candidate.index,
        resume_offset: 0,
        resume_page: 1,
      };
    }
  }

  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let authenticatedUserId: string | null = null;

    // --- Cron-secret OR service-role bypass: allow automated/internal calls ---
    const incomingCronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");
    const isCronCall = !!(incomingCronSecret && expectedCronSecret && incomingCronSecret === expectedCronSecret);
    const isServiceRoleCall = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
    const isInternalCall = isCronCall || isServiceRoleCall;

    if (!isInternalCall) {
      // Standard user-auth path
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      authenticatedUserId = user.id;
    }

    const requestBody = await req.json();
    const { site_id, force_backfill, force_form_probe } = requestBody;
    const initialBackfillCursor = isEntryBackfillCursor(requestBody?.backfill_cursor)
      ? requestBody.backfill_cursor
      : undefined;

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
    const minimumAvadaPluginVersion = "1.8.10";
    const pluginOutdated = !isVersionAtLeast(site.plugin_version, minimumPluginVersion);

    // Check if site has any Avada forms
    const { data: avadaForms, count: avadaFormCount } = await supabase
      .from("forms")
      .select("id, name, external_form_id, page_url", { count: "exact" })
      .eq("org_id", site.org_id)
      .eq("site_id", site.id)
      .eq("provider", "avada")
      .eq("archived", false);
    const avadaFormRows = (avadaForms || []) as Array<Pick<FormRow, "id" | "name" | "external_form_id" | "page_url">>;
    const avadaFormIds = avadaFormRows.map((form) => form.id);
    const hasAvadaForms = (avadaFormCount || 0) > 0;
    const knownAvadaFormMappings = hasAvadaForms
      ? await buildKnownAvadaFormMappings(supabase, site.org_id, site.id, avadaFormRows)
      : [];

    // Skip org membership check for internal (cron / service-role) calls
    if (!isInternalCall) {
      const { data: membership } = await supabase
        .from("org_users").select("role")
        .eq("org_id", site.org_id).eq("user_id", authenticatedUserId).maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
    const { response: wpRes, endpoint: wpEndpoint } = await triggerWordPressSync(siteUrl, apiKeyRow.key_hash, knownAvadaFormMappings);

    let wpSyncFailed = false;
    let wpSyncErrorText: string | null = null;
    let wpSyncStatus: number | null = null;
    let wpData: unknown = null;
    let directFormProbe = { checked: 0, updatedPageUrls: 0, alertsCreated: 0 };

    if (!wpRes.ok) {
      wpSyncFailed = true;
      wpSyncStatus = wpRes.status;
      wpSyncErrorText = await wpRes.text();
      console.error(`WP sync failed (${wpEndpoint}): ${wpRes.status} ${wpSyncErrorText}`);

      directFormProbe = await runDirectFormChecks(supabase, site.org_id, site.id);
      wpData = {
        ok: false,
        status: wpRes.status,
        error: wpSyncErrorText,
        endpoint: wpEndpoint,
      };
    } else {
      const wpRaw = await wpRes.text();
      wpData = { raw: wpRaw };
      try {
        wpData = JSON.parse(wpRaw);
      } catch {
        // Keep raw string
      }

      if (force_form_probe) {
        directFormProbe = await runDirectFormChecks(supabase, site.org_id, site.id);
      }
    }

    // Extract structured data from WP result
    const wpResult = !wpSyncFailed
      ? (wpData as Record<string, unknown>)?.result as Record<string, unknown> | undefined
      : undefined;
    const trashed = Number(wpResult?.trashed || 0);
    const restored = Number(wpResult?.restored || 0);
    const wpWarnings = [
      ...(wpSyncFailed && wpSyncStatus
        ? [`WordPress sync returned ${wpSyncStatus}, so entry backfill is continuing separately in the background.`]
        : []),
      ...((wpResult?.warnings as string[]) || []),
    ];
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
    const avadaBackfillEntries = 0;
    const avadaBackfillError: string | null = null;
    const avadaBackfillRouteMissing = false;

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
      (!!force_backfill || requiresAvadaReset || (avadaActiveLeadCount === 0 && avadaRawEventCount === 0) || avadaLeadsWithEmptyFields > 0);

    if (shouldAutoBackfillAvada) {
      avadaBackfillAttempted = true;
      // Avada forms are now included in the cursor-based backfill-entries flow below
      // instead of the legacy one-shot backfill-avada route which could timeout and stall.
      console.log("Avada backfill will use cursor-based backfill-entries path");
    }

    // ── Auto-backfill non-Avada entries (Gravity Forms, WPForms, CF7, etc.) ──
    // If force_backfill is true (manual sync), always trigger backfill for ALL forms.
    // Otherwise, only trigger when forms have zero leads.
    let entryBackfillAttempted = false;
    let entryBackfillContinuationScheduled = false;

    {
      // Include ALL providers (including Avada) in cursor-based backfill
      const nonAvadaFormRows = await supabase
        .from("forms")
        .select("id, provider, external_form_id")
        .eq("org_id", site.org_id)
        .eq("site_id", site.id)
        .eq("archived", false);

      const nonAvadaForms = (nonAvadaFormRows.data || []) as Array<{
        id: string;
        provider: string;
        external_form_id: string;
      }>;
      const nonAvadaFormIds = nonAvadaForms.map((f) => f.id);

      if (nonAvadaFormIds.length > 0) {
        const leadCountsByForm = await Promise.all(
          nonAvadaForms.map(async (form) => {
            const { count } = await supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("form_id", form.id)
              .neq("status", "trashed");

            return {
              ...form,
              activeLeadCount: count || 0,
            } as NonAvadaBackfillCandidate;
          })
        );

        const formsWithZeroLeads = leadCountsByForm.filter((form) => form.activeLeadCount === 0);
        const shouldBackfill = !!force_backfill || wpSyncFailed || formsWithZeroLeads.length > 0 || shouldAutoBackfillAvada;

        if (shouldBackfill) {
          const minimumBackfillVersion = "1.6.1";
          const backfillVersionOk = isVersionAtLeast(runtimePluginVersion, minimumBackfillVersion);

          if (!backfillVersionOk) {
            console.warn(`Skipping entry backfill — plugin v${runtimePluginVersion || "unknown"} < ${minimumBackfillVersion}`);
            wpWarnings.push(
              `Plugin v${runtimePluginVersion || "unknown"} does not support reliable entry backfill. Please update to v${minimumBackfillVersion}+ from Settings → Plugin, then sync again.`
            );
            entryBackfillAttempted = false;
          } else {
            console.log(`Entry backfill triggered (force=${!!force_backfill}): ${nonAvadaFormIds.length} non-Avada forms`);
            entryBackfillAttempted = true;

            const priorityCursor = !initialBackfillCursor
              ? buildPriorityEntryBackfillCursor(leadCountsByForm)
              : undefined;

            const runBackfillWorker = async (label: string, startingCursor?: EntryBackfillCursor) => {
              const backfillStart = Date.now();
              const maxBackfillMs = 140000;
              let cursor: EntryBackfillCursor | undefined = startingCursor;
              let totalEntries = 0;
              let totalErrors = 0;
              let done = false;
              let aborted = false;

              if (cursor) {
                console.log(
                  `${label}: resuming from cursor job=${cursor.resume_job_index} offset=${cursor.resume_offset} page=${cursor.resume_page}`,
                );
              }

              while (!done && (Date.now() - backfillStart) < maxBackfillMs) {
                try {
                  const { response: bfRes, endpoint: bfEndpoint } = await triggerWordPressEntryBackfill(
                    siteUrl,
                    apiKeyRow.key_hash,
                    knownAvadaFormMappings,
                    cursor,
                  );
                  if (!bfRes.ok) {
                    const bfBody = await bfRes.text();
                    console.error(`WP entry backfill failed (${bfEndpoint}): ${bfRes.status} ${bfBody}`);
                    aborted = true;
                    break;
                  }

                  const bfRaw = await bfRes.text();
                  let bfData: Record<string, unknown> = {};
                  try {
                    bfData = JSON.parse(bfRaw);
                  } catch {
                    // ignore malformed chunk bodies and stop safely
                  }

                  totalEntries += Number(bfData.total_entries || 0);
                  totalErrors += Number(bfData.total_errors || 0);

                  console.log(`${label}: chunk ${bfData.total_entries} entries, done=${bfData.done}, elapsed=${Date.now() - backfillStart}ms`);

                  if (bfData.done === true) {
                    done = true;
                  } else if (isEntryBackfillCursor(bfData.cursor)) {
                    cursor = bfData.cursor;
                  } else {
                    console.warn(`${label}: backfill returned not-done but no valid cursor — breaking`);
                    aborted = true;
                    break;
                  }
                } catch (err) {
                  console.error(`${label}: WP entry backfill chunk error:`, err);
                  aborted = true;
                  break;
                }
              }

              const needsContinuation = !done && !aborted && !!cursor;
              if (needsContinuation && cursor) {
                try {
                  await scheduleEntryBackfillContinuation({
                    supabaseUrl,
                    anonKey,
                    authHeader,
                    siteId: site.id,
                    cursor,
                    cronSecret: isCronCall ? incomingCronSecret : null,
                  });
                  entryBackfillContinuationScheduled = true;
                } catch (err) {
                  console.error(`${label}: failed to schedule entry backfill continuation:`, err);
                }
              }

              console.log(
                `${label}: complete ${totalEntries} entries, ${totalErrors} errors, fully_done=${done}, continuation_scheduled=${entryBackfillContinuationScheduled}, elapsed=${Date.now() - backfillStart}ms`,
              );
            };

            if (priorityCursor) {
              console.log(
                `Priority backfill worker targeting later low-count form at job=${priorityCursor.resume_job_index}`,
              );
            }

            const backfillPromise = Promise.all([
              runBackfillWorker("primary entry backfill", initialBackfillCursor),
              ...(priorityCursor ? [runBackfillWorker("priority entry backfill", priorityCursor)] : []),
            ]);

            try {
              const edgeRuntime = globalThis as typeof globalThis & {
                EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
              };
              edgeRuntime.EdgeRuntime?.waitUntil?.(backfillPromise);
            } catch {
              backfillPromise.catch((e) => console.error("Backfill background error:", e));
            }
          }
        }
      }
    }

    // Fire-and-forget: check domain/SSL health on first sync and periodically refresh stale records
    try {
      const staleBeforeIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: domainHealth }, { data: sslHealth }] = await Promise.all([
        supabase
          .from("domain_health")
          .select("id, last_checked_at")
          .eq("site_id", site.id)
          .maybeSingle(),
        supabase
          .from("ssl_health")
          .select("id, last_checked_at")
          .eq("site_id", site.id)
          .maybeSingle(),
      ]);

      const domainStale = !domainHealth?.last_checked_at || domainHealth.last_checked_at < staleBeforeIso;
      const sslStale = !sslHealth?.last_checked_at || sslHealth.last_checked_at < staleBeforeIso;

      if (domainStale || sslStale) {
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

    if (wpSyncFailed) {
      syncStatus = "partial";
      reasonCodes.push("wp_sync_failed");
      if (entryBackfillAttempted) {
        reasonCodes.push("backfill_started_after_wp_sync_failure");
      }
    }

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
      wp_sync_failed: wpSyncFailed,
      wp_sync_status_code: wpSyncStatus,
      wp_sync_error: wpSyncErrorText,
      endpoint_attempted: wpEndpoint,
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
