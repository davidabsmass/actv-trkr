import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PAGES = 20;
const MAX_LINKS_PER_PAGE = 20;
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

function extractLinks(html: string, baseHost: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    if (href.startsWith("/")) href = `https://${baseHost}${href}`;
    try {
      const u = new URL(href);
      const h = u.hostname.replace(/^www\./, "");
      const b = baseHost.replace(/^www\./, "");
      if (h !== b) continue;
      links.push(u.href);
    } catch { continue; }
  }
  return [...new Set(links)].slice(0, MAX_LINKS_PER_PAGE);
}

function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>(.*?)<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) urls.push(match[1]);
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
        const links = extractLinks(html, domain);
        for (const link of links) {
          if (!linkToSource.has(link)) linkToSource.set(link, pageUrl);
        }
      }

      console.log(`${domain}: collected ${linkToSource.size} unique links from ${pageUrls.length} pages`);

      // Batch check all links
      const allLinks = [...linkToSource.keys()];
      const statuses = await batchCheck(allLinks);

      // Filter broken
      const broken: { source_page: string; broken_url: string; status_code: number }[] = [];
      for (const [url, status] of statuses) {
        if (status >= 400 || status === 0) {
          broken.push({ source_page: linkToSource.get(url)!, broken_url: url, status_code: status });
        }
      }

      // Upsert
      const now = new Date().toISOString();
      for (const bl of broken) {
        const { data: existing } = await supabase
          .from("broken_links")
          .select("id, occurrences")
          .eq("site_id", site.id)
          .eq("broken_url", bl.broken_url)
          .eq("source_page", bl.source_page)
          .maybeSingle();

        if (existing) {
          await supabase.from("broken_links").update({
            last_seen_at: now, occurrences: (existing.occurrences || 1) + 1, status_code: bl.status_code || null,
          }).eq("id", existing.id);
        } else {
          await supabase.from("broken_links").insert({
            site_id: site.id, org_id: site.org_id, source_page: bl.source_page,
            broken_url: bl.broken_url, status_code: bl.status_code || null,
            first_seen_at: now, last_seen_at: now,
          });
        }
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
