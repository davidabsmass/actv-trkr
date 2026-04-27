import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getZipUrl(req: Request): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/serve-plugin-zip`;
}

const CURRENT_PLUGIN_VERSION = "1.21.1";
const CURRENT_PLUGIN_SHA256 = "80e6a8951cc75b05ded3a67d324ac6a1b8137d8775236569cfb4ce703c63bc96";

const CHANGELOG = `
## 1.21.1
- COSMETIC: "Test Connection" button on Settings → General is now labelled "Confirm Connection". After a successful connection check the page now points users back to their ACTV TRKR dashboard to finish setup.

## 1.21.0
- NEW: Temporary Support Access. Dashboard admins can now grant time-limited (1h / 24h / 72h) troubleshooting access to ACTV TRKR support staff. The plugin creates a disposable WordPress admin user, issues a one-time magic-login URL, auto-deletes the user on revoke or expiry, and logs every event.

## 1.20.12
- FIX (CRITICAL): Restored real-time pageviews, sessions, and click tracking for sites using ingest tokens. The tracker no longer sends the token in a custom fetch header that browsers block during CORS preflight; credentials now stay in the request body so Overview data can flow again.

## 1.20.11
- FIX: Normal pageviews and click events now use fetch as the primary transport instead of relying on sendBeacon, so interactive tracking no longer fails silently when the browser accepts a beacon but the ingestion request never lands.

## 1.20.9
- NEW (Optional): "Limited Pre-Consent Tracking" toggle in Privacy/Consent tab. OFF by default. When enabled, allows anonymous pageview metadata (path, timestamp, referrer domain, coarse device) to be sent before consent — never visitor IDs, sessions, cookies, or journey stitching. Strict mode behavior is unchanged unless this is explicitly turned on. Backend ingestion strips identifying fields server-side as defense-in-depth.

## 1.20.8
- FIX: Built-in consent banner state now persists correctly in WordPress admin. Saving now respects the selected consent source server-side, preserves existing banner fields on partial saves, and no longer appears to revert when the built-in banner is already enabled.

## 1.20.7
- FIX (CRITICAL): Pageviews were silently rejected with 401 because the tracker's pageview send was missing the ingest token in the request body (sendBeacon can't carry custom headers, so credentials must ride in the body). Affected ALL sites running v1.20.x — no real pageviews/sessions were being recorded. Heartbeats, click events, and form submissions were unaffected.

## 1.20.6
- FIX: Removed the persistent "Switch to Recommended Mode" admin nudge. Global Strict is a deliberate, valid choice — admins who selected it will no longer see a banner asking them to switch to EU/UK + US Opt-Out.

## 1.20.5
- COSMETIC: Settings tab "Privacy" renamed to "Privacy / Consent" for clarity.

## 1.20.4
- FIX: Tracking, Gravity Forms, and Uptime Signal checkboxes now default to ON for both new and upgraded installs. Legacy installs with missing or empty values will be self-healed to enabled on next page load.

## 1.20.3
- FIX (CRITICAL): Saving settings from the Privacy/Banner tab no longer wipes out the API Key. The sanitize callback now preserves any field that isn't part of the submitted form, and refuses to overwrite a saved API key with an empty value.
- IMPROVED: Once an API key is saved, the General tab shows it as locked (•••• + last 4) with a "Replace key" button. The only way to change the key is to explicitly paste a new one.

## 1.20.2
- FIX: "Switch to Recommended Mode" button in the WP admin compliance nudge now actually saves the setting (one-click apply via AJAX, then auto-reload) instead of just changing the dropdown without persisting.

## 1.20.1
- IMPROVED: Settings → General now shows the **Save Changes** button above **Test Connection** so users save their license key first, then verify the connection (more intuitive ordering).

## 1.18.1
- SECURITY (C-2): HMAC-signed backend↔plugin requests. New \`MM_Hmac\` class verifies X-Actv-Timestamp/Nonce/Signature headers; legacy hash credential still accepted during this rollout window so existing sites keep working. v1.19.0 will enforce signed-only.
- New REST route \`/bootstrap-signing-secret\` accepts the per-org signing key from the dashboard (one-time, idempotent).

## 1.18.0
- SECURITY (C-1): Magic-login from the dashboard now logs in as the **specific** dashboard user who initiated the login (matched by email), instead of always logging in as the first administrator on the site. If no matching WP admin exists, the login is refused and audited.

## 1.17.1
- FIX: /sync REST endpoint now responds with 202 immediately and runs the form scan in the background, eliminating dashboard timeouts on slow hosts (no more "Edge Function returned a non-2xx status code" on large sites)

## 1.17.0
- NEW: Import adapters now accept a \`direction\` parameter (ASC/DESC), enabling newest-first imports for capped backfills
- NEW: Oversized form imports (50k+) capped at 8,000 most-recent entries — gives a representative recent sample without ingesting six-figure spam tables

## 1.16.1
- FIX: Repaired a malformed docblock in the WP-CLI recovery class that prevented \`wp actv-trkr log\` from registering on some PHP versions
- DOCS: Shipped RECOVERY.md operator runbook covering safe-mode override, every \`wp actv-trkr\` command, and symptom-driven recipes

## 1.16.0
- NEW: Settings page redesigned with 4 tabs (General, Privacy, Tools, Advanced) and a status summary bar
- NEW: Privacy Policy and Consent Tool copy now live in modals — no more giant inline text blocks
- IMPROVED: Conditional fields hide irrelevant settings (banner content only when built-in banner is active, US controls only when needed)
- IMPROVED: Tools tab consolidates Sync Forms, Broken Link Scan, and copy helpers into one task-focused screen

## 1.15.0
- NEW: Daily fleet-health beacon — plugin reports its mode, boot loop state, migration status, disabled modules, and blocked versions to the dashboard so operators can see crash-contained sites at a glance
- NEW: Dashboard widget surfaces sites in reduced_mode or migration_locked across the entire fleet (admin-only)
- FIX: Repaired a malformed docblock in the recovery class that was preventing the recovery layer from loading on some PHP versions

## 1.9.18
- FIX: Plugin ZIP now ships with the correct main file name so WordPress updates no longer break wp-admin
- FIX: Dashboard downloads now inject the real API key you copied, not its stored hash
- FIX: Prevents canceled customers from bouncing between protected pages by forcing a clean logout to the login screen
- FIX: Tracking health no longer flags no-traffic sites as stalled when the verifier confirms the tracker is still installed

## 1.9.16
- SECURITY: Magic-login tokens now bound to dashboard requestor (atomic single-use, server-verified)
- SECURITY: Plugin update payloads now signed (HMAC-SHA256) and verified on install

## 1.9.15
- NEW: Auto-recovery banner in WP admin — appears when ACTV TRKR detects tracking has stopped
- NEW: One-click "Reconnect Now" button re-fires the connection check from inside WordPress
- NEW: Polls our /check-site-status endpoint every 15 minutes from the admin dashboard

## 1.9.13
- FIX: Cursor-based Avada re-backfill now receives backend-known page mappings for the correct form page
- FIX: Avada re-backfill now reuses the same authoritative multi-table discovery path as sync counting, preventing 46/38 mismatches

## 1.9.9
- FIX: Avada forms were silently skipped during cursor-based entry backfill (backfill-entries route)
- FIX: Resolves "Renew You, Near You" and similar Avada forms stalling at partial entry counts
- NEW: Full Avada entry pagination with secondary field enrichment in backfill-entries

## 1.9.8
- FIX: Avada import adapter now uses full multi-layer form ID resolution (postmeta, page content scan, source_url reverse-match)
- FIX: Resolves Avada forms like "Renew You" showing drastically wrong entry counts during import
- Renamed "Heartbeat" to "Signal" across all user-facing surfaces

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

## 1.8.11
- FIX: Prevents WordPress admin crash caused by memory exhaustion during Avada form content scanning
`;

// ── C-4 FIX: Plugin update signing ─────────────────────────────────
// We sign the (version, download_url, timestamp) tuple with HMAC-SHA256
// using PLUGIN_RELEASE_SIGNING_SECRET. WordPress verifies this signature
// before trusting the download URL. The signing secret is shipped baked
// into the plugin source (compromise of one site DOES expose it, so this
// is defense-in-depth — a real upgrade path would use Ed25519 with the
// public key embedded in plugin source. HMAC is the maximum we can do
// without shipping per-key code. See SECURITY_AUDIT.md for follow-up.).

const SIGNING_ALG = "HMAC-SHA256";

async function signUpdatePayload(
  version: string,
  downloadUrl: string,
  issuedAt: string
): Promise<{ signature: string; alg: string } | null> {
  const secret = Deno.env.get("PLUGIN_RELEASE_SIGNING_SECRET");
  if (!secret) return null;
  const message = `${version}\n${downloadUrl}\n${issuedAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { signature: hex, alg: SIGNING_ALG };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const latestVersion = await resolveLatestVersion(req);

    if (action === "check") {
      const currentVersion = url.searchParams.get("version") || "0.0.0";
      const domain = url.searchParams.get("domain") || "";
      const slug = "actv-trkr";

      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      });

      // Update plugin_version on the site record
      if (domain) {
        const normalizedDomain = domain.replace(/^www\./i, "");
        await sb
          .from("sites")
          .update({ plugin_version: currentVersion })
          .eq("domain", normalizedDomain);
      }

      const zipUrl =
        getZipUrl(req) +
        (domain ? `?domain=${encodeURIComponent(domain)}` : "");
      const issuedAt = new Date().toISOString();
      const sig = hasUpdate
        ? await signUpdatePayload(latestVersion, zipUrl, issuedAt)
        : null;

      // Audit log (non-blocking)
      try {
        const ip = extractIp(req);
        const ipHash = ip ? await sha256Hex(`actv-trkr-ip-salt:${ip}`) : null;
        await sb.from("plugin_update_fetches").insert({
          domain: domain || null,
          current_version: currentVersion,
          served_version: latestVersion,
          signature_issued: !!sig,
          signature_alg: sig?.alg || null,
          ip_hash: ipHash,
          user_agent: req.headers.get("user-agent")?.slice(0, 500) || null,
        });
      } catch {
        // ignore audit failure
      }

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
          // C-4: signed tuple — plugin must verify before trusting download_url
          signature: sig?.signature || null,
          signature_alg: sig?.alg || null,
          signed_at: sig ? issuedAt : null,
          // C-4: SHA-256 of the canonical plugin ZIP. The plugin updater
          // recomputes this after download and refuses to install on mismatch.
          sha256: typeof CURRENT_PLUGIN_SHA256 === "string" ? CURRENT_PLUGIN_SHA256 : null,
          message: hasUpdate
            ? `Version ${latestVersion} is available. Click "Update Now" in your WordPress admin.`
            : "You are running the latest version.",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

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
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use ?action=check or ?action=info" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

function extractLatestVersionFromChangelog(changelog: string): string {
  const match = changelog.match(/##\s+([0-9]+\.[0-9]+\.[0-9]+)/);
  if (!match) {
    throw new Error("Unable to determine the latest plugin version from the changelog.");
  }
  return match[1];
}

async function resolveLatestVersion(_req: Request): Promise<string> {
  try {
    return extractLatestVersionFromChangelog(CHANGELOG);
  } catch {
    return CURRENT_PLUGIN_VERSION;
  }
}
