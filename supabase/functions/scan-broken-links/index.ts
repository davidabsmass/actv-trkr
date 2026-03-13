import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PAGES = 20;
const MAX_LINKS_PER_PAGE = 50;
const CONCURRENCY = 10;

async function fetchPage(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
      headers: { "User-Agent": "ACTVTRKR-LinkChecker/1.0" },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/xml") && !ct.includes("application/xml")) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function resolveUrl(href: string, pageUrl: string): string | null {
  try {
    // Use the page URL as base to correctly resolve relative URLs
    const resolved = new URL(href, pageUrl);
    return resolved.href;
  } catch {
    return null;
  }
}

function extractLinks(html: string, baseHost: string, pageUrl: string): string[] {
  const links: string[] = [];
  // Match href in <a>, <link>, and src in <img>, <script>
  const regex = /(?:href|src)=["']([^"'#\s]+)["']/gi;
  let match;
  const normalizedBase = baseHost.replace(/^www\./, "");

  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();

    // Skip non-HTTP protocols
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:") || href.startsWith("data:")) continue;

    // Skip XML stylesheet processing instructions and non-link refs
    if (href.endsWith(".xsl")) continue;

    // Skip font files and other non-navigable resources
    const lowerHref = href.toLowerCase();
    if (lowerHref.endsWith(".woff") || lowerHref.endsWith(".woff2") || lowerHref.endsWith(".ttf") || 
        lowerHref.endsWith(".eot") || lowerHref.endsWith(".svg") && lowerHref.includes("font")) continue;

    // Resolve the URL properly using the page URL as base
    const resolved = resolveUrl(href, pageUrl);
    if (!resolved) continue;

    try {
      const u = new URL(resolved);
      // Only check internal links
      const h = u.hostname.replace(/^www\./, "");
      if (h !== normalizedBase) continue;

      // Skip anchors-only, skip common non-page resources
      if (u.pathname === "" || u.pathname === "/") continue;

      links.push(u.href);
    } catch { continue; }
  }
  return [...new Set(links)].slice(0, MAX_LINKS_PER_PAGE);
}

function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>(.*?)<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) urls.push(match[1].trim());
  return urls;
}

async function checkLink(url: string): Promise<number> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
      headers: { "User-Agent": "ACTVTRKR-LinkChecker/1.0" },
    });
    // Some servers don't support HEAD, fall back to GET for 405
    if (resp.status === 405) {
      const getResp = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
        headers: { "User-Agent": "ACTVTRKR-LinkChecker/1.0" },
      });
      return getResp.status;
    }
    return resp.status;
  } catch {
    return 0;
  }
}

async function batchCheck(urls: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const statuses = await Promise.all(batch.map(u => checkLink(u)));
    batch.forEach((u, idx) => results.set(u, statuses[idx]));
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let targetSiteId: string | null = null;
    try { const body = await req.json(); targetSiteId = body.site_id || null; } catch { /* no body */ }

    const query = supabase.from("sites").select("id, org_id, domain");
    if (targetSiteId) query.eq("id", targetSiteId);
    const { data: sites } = await query;

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0, broken_found: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalBroken = 0;

    for (const site of sites.slice(0, 3)) {
      const domain = site.domain;
      const baseUrl = `https://${domain}`;

      // Clear previous broken links for this site before re-scanning
      await supabase.from("broken_links").delete().eq("site_id", site.id);

      // Get page URLs from sitemap
      let pageUrls: string[] = [];
      const sitemapXml = await fetchPage(`${baseUrl}/sitemap.xml`);
      if (sitemapXml) {
        if (sitemapXml.includes("<sitemapindex")) {
          const subUrls = extractSitemapUrls(sitemapXml).slice(0, 3);
          for (const subUrl of subUrls) {
            const subXml = await fetchPage(subUrl);
            if (subXml) pageUrls.push(...extractSitemapUrls(subXml));
          }
        } else {
          pageUrls = extractSitemapUrls(sitemapXml);
        }
      }
      if (pageUrls.length === 0) pageUrls = [baseUrl];
      pageUrls = pageUrls.slice(0, MAX_PAGES);

      // Collect all unique links from all pages
      const linkToSource: Map<string, string> = new Map();
      for (const pageUrl of pageUrls) {
        const html = await fetchPage(pageUrl);
        if (!html) continue;
        const links = extractLinks(html, domain, pageUrl);
        for (const link of links) {
          if (!linkToSource.has(link)) linkToSource.set(link, pageUrl);
        }
      }

      console.log(`${domain}: collected ${linkToSource.size} unique links from ${pageUrls.length} pages`);

      // Batch check all links
      const allLinks = [...linkToSource.keys()];
      const statuses = await batchCheck(allLinks);

      // Filter broken (only 4xx and 5xx, not connection failures which may be transient)
      const broken: { source_page: string; broken_url: string; status_code: number }[] = [];
      for (const [url, status] of statuses) {
        if (status >= 400 && status < 600) {
          broken.push({ source_page: linkToSource.get(url)!, broken_url: url, status_code: status });
        }
      }

      // Insert broken links
      const now = new Date().toISOString();
      for (const bl of broken) {
        await supabase.from("broken_links").insert({
          site_id: site.id, org_id: site.org_id, source_page: bl.source_page,
          broken_url: bl.broken_url, status_code: bl.status_code,
          first_seen_at: now, last_seen_at: now,
        });
      }

      totalBroken += broken.length;
      console.log(`${domain}: found ${broken.length} broken links`);
    }

    return new Response(JSON.stringify({ status: "ok", sites_checked: sites.length, broken_found: totalBroken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Broken link scan error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
