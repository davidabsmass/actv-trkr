import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getZipUrl(req: Request): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/serve-plugin-zip`;
}

const CURRENT_PLUGIN_VERSION = "1.9.7";

const CHANGELOG = `
## 1.9.7
- NEW: Admin warning that ACTV TRKR controls its own analytics only
- NEW: Lightweight detection of Meta Pixel, Google Analytics, GTM on frontend
- NEW: External Tracking Notice section in diagnostics panel
- NEW: Help tooltip near compliance settings

## 1.9.6
- NEW: External consent plugin detection (Complianz, CookieYes, Cookiebot, Real Cookie Banner, etc.)
- NEW: External Consent Plugin Setup section with setup instructions and copy-to-clipboard blocks
- NEW: Ready-to-paste analytics descriptions (short, detailed, technical) for CMP classification
- NEW: Consent signal status diagnostics (signal received, unclear, denied)
- NEW: Double-banner warning when both ACTV TRKR banner and external CMP are active
- NEW: How-to guide for configuring ACTV TRKR in external consent tools
- PRESERVED: Strict mode fail-closed — no tracking without valid consent signal

## 1.9.5
- IMPROVED: Clearer admin settings copy for region-based privacy
- NEW: "What Should Happen Right Now" status summary in diagnostics
- NEW: Quick region testing buttons in admin panel
- NEW: Built-in help section with collapsible how-it-works guides
- NEW: Known limitations section for transparency
- IMPROVED: Polished visitor-facing banner and modal copy
- IMPROVED: Migration guidance for existing installs switching modes
- IMPROVED: Better labels and descriptions for all compliance settings

## 1.9.4
- NEW: Region-based privacy — EU/UK strict opt-in, US opt-out, configurable fallback
- NEW: Server-side region detection via CDN headers (Cloudflare, Vercel, etc.)
- NEW: Client-side timezone fallback for region detection
- NEW: Compliance Mode setting (Global Strict, EU/UK+US, Custom)
- NEW: US Privacy Settings link and non-blocking notice
- NEW: Admin region override for testing (debug mode only)
- NEW: Enhanced diagnostics panel with region info and behavior details
- IMPROVED: Consent banner now region-aware — EU/UK sees full banner, US sees opt-out link
- PRESERVED: Existing strict mode and fail-closed behavior unchanged

## 1.9.3
- HARDENED: Conflict-resistant banner loading with inline bootstrap and fallback mounts
- HARDENED: Fail-closed safety — malformed cookies treated as no consent
- HARDENED: CSS uses !important and high z-index to resist theme/plugin overrides
- NEW: Admin diagnostics panel with conflict hints and verification checklist
- NEW: Debug mode (admin-only) logs banner lifecycle to browser console
- NEW: Frontend self-check with delayed fallback for deferred/delayed JS environments
- NEW: Copy Diagnostics button in admin panel

## 1.9.2
- FIX: Built-in consent banner now defaults to enabled on new installs
- FIX: Consent Banner settings now save correctly in WordPress admin
- FIX: Homepage popup now appears after installing/updating the latest plugin build

## 1.9.1
- NEW: Built-in cookie consent banner — no third-party plugin required
- Preferences modal with Essential (always on) and Analytics (opt-in) categories
- Admin settings for banner text, button labels, policy URLs, position, and expiry
- Footer "Cookie Settings" reopener link
- Consent debug panel in WP admin
- Full integration with existing mmConsent API and strict/relaxed modes

## 1.9.0
- NEW: Background import engine with adaptive batching
- Resumable cursor-based imports for 10k+ entry forms
- Import progress visible in dashboard

## 1.8.13
- FIX: Dashboard downloads now always serve the canonical latest plugin ZIP
- FIX: Keeps the downloadable package in sync with the WordPress updater build

## 1.8.12
- FIX: Avada form entry counts now resolve internal submission form_id from fusion_form post ID
- FIX: Layer 0 pre-lookup checks wp_postmeta and page content to map form_post_id → internal form_id
- FIX: Resolves "Renew You" and other Avada forms showing drastically wrong entry counts

## 1.8.11
- FIX: Prevents WordPress admin crash caused by memory exhaustion during Avada form content scanning
- FIX: Auto-sync on admin_init now wrapped in try/catch so plugin errors never break the admin
- FIX: Heavy Avada builder content scanning skipped during lightweight admin sync (only runs via REST API)
- FIX: content_has_avada_form_reference no longer duplicates large strings 4x in memory

## 1.8.10
- FIX: Avada sync now forwards backend-known page mappings to the WordPress plugin so encoded builder embeds still reconcile correctly
- FIX: Avada entry matching now checks all known page URL candidates, recovering missing Apyx Medical submissions after April 2

## 1.8.9
- FIX: Avada backfill now reads matching entry rows from ALL supported submission tables instead of only the first detected table
- FIX: Prevents missing newer Avada entries on sites where submissions are split across multiple Avada tables

## 1.8.8
- FIX: Avada multi-table discovery now merges entries from ALL candidate tables instead of stopping at first match
- FIX: Backfill REST handler variable scope error ($body undefined) that broke cursor/resume parameters
- FIX: Avada forms (fusion_form post type) now included in historical backfill job queue

## 1.8.7
- FIX: Avada entry discovery scans fusion_form_submissions, fusion_form_db_entries, and fusion_form_submission_data
- FIX: Deduplicates entries across multiple Avada tables to prevent double-counting

## 1.8.6
- FIX: Multi-table Avada scanning with wildcard table discovery
- FIX: Backfill resume parameters properly forwarded

## 1.8.5
- FIX: Avada form sync improvements for sites with non-standard table naming

## 1.8.4
- FIX: Plugin activation no longer interferes with frontend form rendering
- Zero live form hooks — strictly passive data extraction

## 1.8.3
- FIX: REST API permission callback hardened against unauthorized requests
- IP-based rate limiting (10 req/min) via WordPress transients

## 1.8.2
- FIX: Batched extraction engine (100 entries/batch) with extended timeouts
- Backend safety guard for large forms (>=1000 leads)

## 1.8.1
- FIX: First-install cron event for automatic form discovery and backfill

## 1.8.0
- Zero-interference mode: all frontend listeners and live form hooks removed
- Data extraction via REST API only

## 1.7.0
- WooCommerce order tracking support
- Broken link scanner improvements
- SEO fix command relay

## 1.6.2
- Heartbeat now reports full WP environment: active plugins, theme, available updates, WP/PHP versions
- Powers the Plugins & WordPress monitoring tab with real data

## 1.6.1
- FIX: Replaces fire-and-forget chained backfill with synchronous loop — all entries across all pages guaranteed to process
- FIX: Older historical entries (Jan/Feb) no longer silently dropped when chain breaks

## 1.5.9
- FIX: Backfill now uses blocking sends with response verification — entries are confirmed delivered before moving to the next batch
- FIX: Failed sends are automatically queued for retry instead of being silently dropped
- FIX: Smaller batch size (5) prevents PHP timeout during blocking sends

## 1.5.8
- FIX: Backfill chain no longer breaks mid-way — uses non-blocking sends and smaller batches (10/batch) so ALL forms get their entries imported
- FIX: Forms like "Contact Us" that were skipped during backfill now process correctly

## 1.5.7
- FIX: Eliminates false "update available" notices after upgrading by clearing WordPress update caches post-upgrade
- FIX: Update check endpoint no longer returns stale cached responses

## 1.5.6
- FIX: Historical Gravity Forms and WPForms backfill now runs in chained batches so large imports do not timeout mid-run
- FIX: Continues replaying entries automatically until all historical form entries are imported

## 1.5.5
- FIX: Historical Gravity Forms backfill now dispatches asynchronously so large forms do not stall partway through
- FIX: Prevents partial imports where WordPress has hundreds of entries but the app stops far short of parity

## 1.5.4
- FIX: Backfill now paginates through ALL entries (removed 500-entry cap that caused count mismatches)
- FIX: Gravity Forms and WPForms backfill fetches entries in batches of 200 until exhausted

## 1.5.3
- FIX: Adds /backfill-entries REST route for historical Gravity Forms and WPForms sync
- FIX: Improves entry backfill reliability for sites with forms discovered but no imported leads

## 1.5.2
- FIX: CTA click events now include target_href in payload for reliable href-based goal matching
- FIX: Goal matching tolerates legacy events without href when text rules are present

## 1.5.1
- FIX: BOOK NOW / CTA link clicks now classify as cta_click when buttons are anchors or class-based CTAs
- FIX: Event batching uses the same 30-second cadence as the production tracker
- FIX: Event flush uses fetch transport for improved delivery reliability

## 1.3.28
- CRITICAL: Fixes missing Avada field data by adding wp_fusion_form_entries as a secondary data source

## 1.3.25
- EMERGENCY: Fixes PHP syntax error that crashed WordPress sites after updating to 1.3.24

## 1.3.0
- Active time-on-page tracking with focus-aware heartbeats
- Intent-based click tracking (CTAs, downloads, outbound links)
- Form liveness monitoring

## 1.2.0
- Added self-hosted auto-update support

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
    const latestVersion = await resolveLatestVersion(req);

    // WordPress-style update check
    if (action === "check") {
      const currentVersion = url.searchParams.get("version") || "0.0.0";
      const domain = url.searchParams.get("domain") || "";
      const slug = "actv-trkr";

      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

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
          version: latestVersion,
          has_update: hasUpdate,
          download_url: hasUpdate ? zipUrl : null,
          changelog: CHANGELOG.trim(),
          tested_wp: "6.7",
          requires_wp: "5.8",
          requires_php: "7.4",
          message: hasUpdate
            ? `Version ${latestVersion} is available. Click "Update Now" in your WordPress admin.`
            : "You are running the latest version.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache, no-store, must-revalidate" },
        }
      );
    }

    // Info endpoint — returns full plugin metadata
    if (action === "info") {
      return new Response(
        JSON.stringify({
          name: "ACTV TRKR",
          slug: "actv-trkr",
          version: latestVersion,
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
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache, no-store, must-revalidate" },
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

function extractVersionFromContentDisposition(contentDisposition: string | null): string | null {
  return contentDisposition?.match(/actv-trkr-([0-9.]+)\.zip/i)?.[1] ?? null;
}

function extractLatestVersionFromChangelog(changelog: string): string {
  const match = changelog.match(/##\s+([0-9]+\.[0-9]+\.[0-9]+)/);
  if (!match) {
    throw new Error("Unable to determine the latest plugin version from the changelog.");
  }
  return match[1];
}

async function resolveLatestVersion(_req: Request): Promise<string> {
  // Derive version from changelog so it stays in sync automatically.
  // Falls back to the hardcoded constant if parsing fails.
  try {
    return extractLatestVersionFromChangelog(CHANGELOG);
  } catch {
    return CURRENT_PLUGIN_VERSION;
  }
}
