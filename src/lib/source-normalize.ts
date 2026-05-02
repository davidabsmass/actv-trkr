/**
 * Source / referrer normalization helpers.
 *
 * Two responsibilities:
 *   1. `expandSiteDomains` + `isSelfReferral`: detect when a referrer is
 *      actually the same site (apex vs `www.` vs subdomain) so we don't
 *      report `example.com` as a top traffic source for `example.com`.
 *   2. `canonicalSource`: collapse host variants of the same provider
 *      (`google.com`, `www.google.com`, `cn.bing.com`, `m.facebook.com`,
 *      `l.facebook.com`, `fb`, `ig`, …) into a single canonical label so
 *      the dashboard isn't littered with near-duplicate rows.
 *
 * Used by:
 *   - src/hooks/use-realtime-dashboard.ts
 *   - src/hooks/use-dashboard-overview.ts
 *   - src/components/dashboard/TopPagesAndSources.tsx
 *   - src/components/dashboard/AttributionSection.tsx
 */

/** Strip protocol, leading `www.`, path/query, port — return bare hostname. */
export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "");
}

/**
 * Best-effort registrable root (eTLD+1) extractor.
 *
 * We don't ship a full PSL — for our purposes we just take the last two
 * labels, with a small allowlist of common multi-part public suffixes
 * (.co.uk, .com.au, etc.) where we take the last three. This is good
 * enough to match `blog.example.com` ↔ `example.com`.
 */
const MULTI_PART_TLDS = new Set([
  "co.uk", "ac.uk", "gov.uk", "org.uk", "me.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "co.za", "co.jp", "ne.jp", "or.jp",
  "com.br", "com.mx", "com.ar", "com.tr",
]);

export function registrableRoot(host: string): string {
  const h = normalizeDomain(host);
  if (!h) return "";
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) return lastThree;
  return lastTwo;
}

/**
 * Build the full set of host variants that should be treated as
 * "this site" for self-referral filtering.
 *
 * Given a list of stored site domains, returns a Set containing:
 *   - the normalized apex
 *   - the registrable root (so blog.example.com matches example.com)
 */
export function expandSiteDomains(rawDomains: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const raw of rawDomains) {
    const apex = normalizeDomain(raw);
    if (!apex) continue;
    out.add(apex);
    const root = registrableRoot(apex);
    if (root) out.add(root);
  }
  return out;
}

/**
 * Returns true if `referrer` should be considered the same site as one of
 * the org's owned domains. Matches when the referrer's normalized form OR
 * its registrable root is in the owned set, OR when the owned root is a
 * suffix of the referrer host (so `m.example.com` → matches `example.com`).
 */
export function isSelfReferral(
  referrer: string | null | undefined,
  ownedRoots: Set<string>,
): boolean {
  const host = normalizeDomain(referrer);
  if (!host) return false;
  if (ownedRoots.has(host)) return true;
  const root = registrableRoot(host);
  if (root && ownedRoots.has(root)) return true;
  // Subdomain check: any owned root that is a dot-suffix of the referrer.
  for (const owned of ownedRoots) {
    if (host === owned) return true;
    if (host.endsWith("." + owned)) return true;
  }
  return false;
}

// ─── Canonical source collapsing ─────────────────────────────────────────

/**
 * Map host fragments / utm_source values to a canonical, human-friendly
 * label. Order matters — first match wins.
 */
const CANONICAL_PATTERNS: Array<{ match: RegExp; label: string }> = [
  // Search engines
  { match: /(^|\.)google\.[a-z.]+$|^google$/, label: "Google" },
  { match: /(^|\.)bing\.[a-z.]+$|^bing$/, label: "Bing" },
  { match: /(^|\.)duckduckgo\./, label: "DuckDuckGo" },
  { match: /(^|\.)yahoo\.[a-z.]+$|search\.yahoo|^yahoo$/, label: "Yahoo" },
  { match: /(^|\.)yandex\./, label: "Yandex" },
  { match: /(^|\.)baidu\./, label: "Baidu" },
  { match: /(^|\.)ecosia\./, label: "Ecosia" },
  { match: /(^|\.)brave\.com$|search\.brave/, label: "Brave Search" },
  { match: /(^|\.)naver\./, label: "Naver" },

  // Social
  { match: /(^|\.)facebook\.com$|^fb$|^fb\.com$|facebook\.com$|m\.facebook|l\.facebook/, label: "Facebook" },
  { match: /(^|\.)instagram\.com$|^ig$|l\.instagram/, label: "Instagram" },
  { match: /(^|\.)linkedin\.com$|^li$/, label: "LinkedIn" },
  { match: /(^|\.)twitter\.com$|^t\.co$|(^|\.)x\.com$/, label: "X (Twitter)" },
  { match: /(^|\.)tiktok\.com$|^tt$/, label: "TikTok" },
  { match: /(^|\.)pinterest\./, label: "Pinterest" },
  { match: /(^|\.)reddit\.com$|com\.reddit\./, label: "Reddit" },
  { match: /(^|\.)youtube\.com$|^youtu\.be$/, label: "YouTube" },
  { match: /(^|\.)snapchat\./, label: "Snapchat" },
  { match: /(^|\.)threads\.net$/, label: "Threads" },

  // AI / chat
  { match: /(^|\.)chatgpt\.com$|^chatgpt$/, label: "ChatGPT" },
  { match: /(^|\.)perplexity\.|^perplexity$/, label: "Perplexity" },
  { match: /claude\.ai/, label: "Claude" },
  { match: /^gemini$|gemini\.google/, label: "Gemini" },

  // Email / newsletter platforms
  { match: /^hs_email$|hubspot/, label: "HubSpot Email" },
  { match: /mailchimp/, label: "Mailchimp" },
  { match: /constantcontact/, label: "Constant Contact" },
  { match: /sendgrid/, label: "SendGrid" },
  { match: /mail\.google|outlook\.live|outlook\.office/, label: "Webmail" },

  // Apps surfacing as sources
  { match: /com\.google\.android\.gm/, label: "Gmail App" },
  { match: /com\.google\.android\.googlequicksearchbox/, label: "Google App" },
];

/**
 * Collapse a raw source label (utm_source or referrer hostname) into a
 * single canonical name. Falls back to the normalized hostname (or the
 * raw input if it's not a hostname-like string).
 */
export function canonicalSource(raw: string | null | undefined): string {
  if (!raw) return "Direct";
  const lower = String(raw).toLowerCase().trim();
  if (!lower || lower === "direct" || lower === "(direct)") return "Direct";
  for (const { match, label } of CANONICAL_PATTERNS) {
    if (match.test(lower)) return label;
  }
  // Fallback: return normalized hostname (drops www., port, path).
  const host = normalizeDomain(lower);
  return host || raw;
}
