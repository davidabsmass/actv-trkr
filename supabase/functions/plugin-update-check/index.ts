import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Current latest plugin version — bump this when releasing updates
// v1.3.23: Fixed Avada discovery — resolves WP post ID to internal form_id via page embedding + post_id matching
const LATEST_VERSION = "1.3.23";

function getZipUrl(req: Request): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/serve-plugin-zip`;
}

const CHANGELOG = `
## 1.3.22
- Fixed Avada backfill parser: now correctly handles CSV format (data/field_types/field_labels columns)
- Fixed real-time Avada handler to parse CSV fields instead of dumping raw metadata keys
- Added avada-debug diagnostic endpoint for troubleshooting field extraction
- Lead enrichment: existing leads with empty fields get populated on re-sync
- Skips metadata keys (submission, field_labels, field_types, etc.) in field output

## 1.3.19
- EMERGENCY: Fixes malformed Avada conditional blocks in class-forms.php that could crash WordPress immediately after plugin update
- Adds packaging safety guard to block publishing a ZIP if malformed PHP tokens are detected

## 1.3.18
- CRITICAL: Fixes PHP syntax error (unexpected 'foreach') in class-forms.php that crashed the WordPress sync endpoint
- Fixes malformed conditional blocks in Avada entry discovery that prevented all entry ingestion
- Adds duplicate-entry guard in ingest-form to prevent repeated backfill from creating duplicate leads

## 1.3.17
- Improves Avada discovery for form_post_id/fusion_form_id markers stored in submission blobs
- Improves title fallback matching for renamed forms (hyphen/underscore/punctuation variations)
- Improves Avada backfill field extraction from JSON and serialized payload columns

## 1.3.16
- Adds Avada title/name fallback discovery in the downloadable plugin package
- Fixes renamed forms (e.g. "Book In-Office") not returning historical entries during sync/backfill

## 1.3.14
- Fixes Avada historical backfill when submissions are discoverable only through URL/blob matching
- Reuses the same multi-strategy Avada discovery used by sync diagnostics before ingesting entries

## 1.3.13
- Adds /backfill-avada REST route for historical Avada reimport after ID-format resets
- Replays Avada submission rows using stable avada_db_* IDs to rebuild lead history cleanly

## 1.3.12
- Expands Avada form-ref discovery across more schema variants (formid, source_form_id, fusion_form)
- Adds URL-centric matching across additional columns (page_url, source_url, referer, request_uri, payload)
- Enables filtered recent-row scanning when direct index lookups fail, improving recovery from strategy "none"

## 1.3.11
- Fixes Avada discovery on sites where submission rows do not store form_id markers
- Adds per-form page URL detection during Sync Forms and uses it for entry scoping
- Resolves blocked syncs showing strategy "none" with 0 active entries on every Avada form

## 1.3.10
- Fixes Avada small-table fallback returning identical entry sets for every form
- Filters fallback rows by per-form markers (form_id, fusion_form_id, form_post_id, post_id)
- Prevents stale deleted entries from persisting due ambiguous global entry lists
- Improves reconciliation safety by skipping unscoped fallback rows

## 1.3.9
- Wildcard table discovery: finds Avada submission tables even with non-standard names
- Small-table fallback: if table has ≤200 rows and no form_ref match, returns all entries
- Enhanced diagnostics: logs table name, columns, and total row count for debugging
- Additional candidate columns: form_ref, source_id, submission_data, form_fields, response, timestamp

## 1.3.8
- Expanded Avada entry discovery with multi-column form-ref matching (form_id, fusion_form_id, post_id, parent_id)
- Searches blob/payload columns (submission, data, fields, form_data) for form_id and URL markers
- Per-form Avada diagnostics (strategy used, row count) returned in sync response
- Plugin runtime version included in sync payload for accurate update gating
- Dashboard surfaces blocked/partial sync status with persistent warnings

## 1.3.7
- CRITICAL: Removed global Avada fallback that caused mass-trashing of all entries
- Each Avada form now only returns entries scoped to its own form_id
- Backend sync guards detect duplicate active-ID sets and full-trash patterns
- Prevents accidental data loss when Avada entry discovery fails

## 1.3.6
- Hardened Avada entry discovery with multi-table lookup
- Added safety guard for all-empty Avada form payloads

## 1.3.5
- Fixed Avada entry reconciliation when form IDs differ across installs
- Improved Avada active-entry lookup with URL + global fallback matching
- Resolves deleted Avada submissions persisting in Forms after sync

## 1.3.4
- Avada/Fusion Forms now included in form discovery and entry sync
- Avada entries use stable DB-backed IDs for reliable delete reconciliation
- All form providers (CF7, Ninja, Fluent, Avada) included in discover_forms_list

## 1.3.3
- Fix Avada handler method structure so the plugin loads correctly
- Restores manual sync route availability for entry reconciliation

## 1.3.2
- Fixed dashboard manual sync route (/wp-json/actv-trkr/v1/sync)
- Restored deleted-entry reconciliation via sync-entries

## 1.3.1
- Reduced heartbeat interval from 10s to 30s for lower resource usage
- Added cache headers to plugin update checks

## 1.3.0
- Active time-on-page tracking with focus-aware heartbeats
- Intent-based click tracking (CTAs, downloads, outbound links)
- Form liveness monitoring (hourly probe for rendered forms)
- Broken link scanning improvements

## 1.2.0
- Added self-hosted auto-update support
- WordPress admin will now show update notifications automatically

## 1.1.0
- Universal form capture (CF7, WPForms, Avada, Ninja, Fluent)
- Retry queue for failed submissions
- Pre-configured API key on download
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // WordPress-style update check
    if (action === "check") {
      const currentVersion = url.searchParams.get("version") || "0.0.0";
      const domain = url.searchParams.get("domain") || "";
      const slug = "actv-trkr";

      const hasUpdate = compareVersions(LATEST_VERSION, currentVersion) > 0;

      // Log the check for analytics (optional)
      if (domain) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, serviceKey);

        // Update the plugin_version on the site record
        await sb
          .from("sites")
          .update({ plugin_version: currentVersion })
          .eq("domain", domain);
      }

      const zipUrl = getZipUrl(req) + (domain ? `?domain=${encodeURIComponent(domain)}` : "");

      return new Response(
        JSON.stringify({
          slug,
          version: LATEST_VERSION,
          has_update: hasUpdate,
          download_url: hasUpdate ? zipUrl : null,
          changelog: CHANGELOG.trim(),
          tested_wp: "6.7",
          requires_wp: "5.8",
          requires_php: "7.4",
          message: hasUpdate
            ? `Version ${LATEST_VERSION} is available. Click "Update Now" in your WordPress admin.`
            : "You are running the latest version.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
        }
      );
    }

    // Info endpoint — returns full plugin metadata
    if (action === "info") {
      return new Response(
        JSON.stringify({
          name: "ACTV TRKR",
          slug: "actv-trkr",
          version: LATEST_VERSION,
          author: "Absolutely Massive",
          homepage: "https://actvtrkr.com",
          requires: "5.8",
          tested: "6.7",
          requires_php: "7.4",
          sections: {
            description:
              "First-party pageview tracking and universal form capture for ACTV TRKR.",
            changelog: CHANGELOG.trim(),
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use ?action=check or ?action=info" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
