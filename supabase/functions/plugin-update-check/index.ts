import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Current latest plugin version — bump this when releasing updates
const LATEST_VERSION = "1.2.0";

function getZipUrl(req: Request): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/serve-plugin-zip`;
}

const CHANGELOG = `
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          author: "ACTV TRKR",
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
