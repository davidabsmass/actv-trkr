import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts';
import { safeFetch } from '../_shared/ssrf-guard.ts';
import { logSecurityEvent } from '../_shared/security-audit.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    // Rate limit check
    const rl = await checkUserRateLimit(user.id, "seo-fix-command");
    if (!rl.allowed) return rateLimitResponse(corsHeaders, rl.retryAfterMs);

    const { org_id, site_id, page_url, issue_id, fix_type, fix_value, scan_id } = await req.json();

    if (!org_id || !site_id || !page_url || !issue_id || !fix_type) {
      throw new Error("Missing required fields");
    }

    // Verify org membership
    const { data: membership } = await supabase
      .from("org_users")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (!membership) throw new Error("Not an org member");

    // Auto-generate fix values if not provided
    let finalValue = fix_value || "";

    if (!finalValue && (fix_type === "add_canonical")) {
      finalValue = page_url;
    }

    // For AI-generated values (title, meta desc), generate if not provided
    if (!finalValue && ["set_title", "set_meta_desc", "add_og_tags"].includes(fix_type)) {
      // SSRF GUARD: only fetch page_url if it matches one of the org's connected sites.
      // Resolves H-8 — without this, an authenticated user could probe internal/cloud-metadata IPs.
      const { data: siteRows } = await supabase
        .from("sites")
        .select("domain, allowed_domains")
        .eq("org_id", org_id);
      const allowedHosts: string[] = [];
      for (const s of siteRows ?? []) {
        if (s.domain) allowedHosts.push(s.domain);
        if (Array.isArray(s.allowed_domains)) allowedHosts.push(...s.allowed_domains);
      }

      try {
        const pageResp = await safeFetch(page_url, {
          headers: { "User-Agent": "ACTV-TRKR-SEO/1.0" },
          allowedHosts,
          maxBytes: 256 * 1024,   // 256 KiB cap
          timeoutMs: 10_000,
        });
        const html = pageResp.body;
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
        const pageTitle = titleMatch?.[1]?.trim() || "";
        const h1Text = h1Match?.[1]?.replace(/<[^>]+>/g, "").trim() || "";

        if (fix_type === "set_title") {
          // Generate a better title based on page content
          const base = h1Text || pageTitle || new URL(page_url).pathname.replace(/[/-]/g, " ").trim();
          finalValue = base.length > 60 ? base.substring(0, 57) + "..." : base;
        } else if (fix_type === "set_meta_desc") {
          // Extract first meaningful paragraph
          const pMatch = html.match(/<p[^>]*>(.{50,}?)<\/p>/is);
          const pText = pMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
          finalValue = pText.substring(0, 155);
          if (!finalValue) finalValue = `Learn more about ${h1Text || pageTitle}`;
        } else if (fix_type === "add_og_tags") {
          finalValue = JSON.stringify({
            title: pageTitle,
            description: "",
            url: page_url,
          });
        }
      } catch {
        // Fallback values
        if (fix_type === "set_title") finalValue = new URL(page_url).pathname.replace(/[/-]/g, " ").trim();
        if (fix_type === "set_meta_desc") finalValue = `Visit ${new URL(page_url).hostname} for more information.`;
        if (fix_type === "add_og_tags") finalValue = JSON.stringify({ title: "", description: "", url: page_url });
      }
    }

    // Insert into fix queue
    const { data: fix, error: insertErr } = await supabase
      .from("seo_fix_queue")
      .insert({
        org_id,
        site_id,
        page_url,
        issue_id,
        fix_type,
        fix_value: finalValue,
        status: "pending",
        scan_id: scan_id || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, fix }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
