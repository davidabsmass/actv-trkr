/**
 * Shared ingestion security utilities for all tracking/ingestion edge functions.
 * Provides: rate limiting, domain validation, payload size enforcement,
 * anomaly logging, IP hashing, and PII redaction.
 */

// ── Rate Limiting (per-IP + per-site) ───────────────────────────
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const siteBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const IP_RATE_LIMIT = 60;     // per IP per minute
const SITE_RATE_LIMIT = 600;  // per site per minute
const ORG_RATE_LIMIT = 1200;  // per org per minute

// Cleanup stale buckets every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipBuckets) { if (now > v.resetAt) ipBuckets.delete(k); }
  for (const [k, v] of siteBuckets) { if (now > v.resetAt) siteBuckets.delete(k); }
}, 300_000);

function checkBucket(map: Map<string, { count: number; resetAt: number }>, key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || now > bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

export function checkRateLimit(ip: string | null, siteId: string | null, orgId: string): { allowed: boolean; reason?: string } {
  if (ip && !checkBucket(ipBuckets, ip, IP_RATE_LIMIT)) {
    return { allowed: false, reason: "ip_rate_limit" };
  }
  if (siteId && !checkBucket(siteBuckets, siteId, SITE_RATE_LIMIT)) {
    return { allowed: false, reason: "site_rate_limit" };
  }
  if (!checkBucket(siteBuckets, `org:${orgId}`, ORG_RATE_LIMIT)) {
    return { allowed: false, reason: "org_rate_limit" };
  }
  return { allowed: true };
}

// ── Domain Validation ───────────────────────────────────────────
export function validateDomain(
  requestDomain: string,
  siteDomain: string,
  allowedDomains: string[],
  requestOrigin: string | null,
): boolean {
  const normalized = requestDomain.replace(/^www\./i, "").toLowerCase();
  const siteNormalized = siteDomain.replace(/^www\./i, "").toLowerCase();

  // Always allow the site's own domain
  if (normalized === siteNormalized) return true;

  // Check allowed_domains list
  if (allowedDomains && allowedDomains.length > 0) {
    for (const d of allowedDomains) {
      if (d.replace(/^www\./i, "").toLowerCase() === normalized) return true;
    }
  }

  // Validate Origin header if present (CORS-based validation)
  if (requestOrigin) {
    try {
      const originHost = new URL(requestOrigin).hostname.replace(/^www\./i, "").toLowerCase();
      if (originHost === siteNormalized) return true;
      if (allowedDomains?.some(d => d.replace(/^www\./i, "").toLowerCase() === originHost)) return true;
    } catch { /* invalid origin */ }
  }

  return false;
}

// ── IP Extraction & Hashing ─────────────────────────────────────
export function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) { const first = xff.split(",")[0].trim(); if (first) return first; }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "_actv_salt_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ── Payload Size Check ──────────────────────────────────────────
export const MAX_PAYLOAD_BYTES = 51200; // 50KB

export function checkPayloadSize(req: Request, rawBody: string): string | null {
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES || rawBody.length > MAX_PAYLOAD_BYTES) {
    return "Payload too large";
  }
  return null;
}

// ── Event Type Whitelist ────────────────────────────────────────
export const VALID_PAGEVIEW_TYPES = new Set(["pageview", "time_update"]);
export const VALID_EVENT_TYPES = new Set([
  "cta_click", "download_click", "outbound_click",
  "tel_click", "mailto_click", "form_start",
]);

// ── PII Redaction for form fields ───────────────────────────────
const PII_FIELD_PATTERNS = [
  /password/i, /passwd/i, /cc[-_]?num/i, /card[-_]?number/i,
  /cvv/i, /cvc/i, /ssn/i, /social[-_]?security/i,
  /credit[-_]?card/i, /secret/i, /token/i,
];

export function redactSensitiveFields(fields: any[]): any[] {
  if (!Array.isArray(fields)) return fields;
  return fields.map(f => {
    const name = (f.name || f.label || "").toString();
    for (const p of PII_FIELD_PATTERNS) {
      if (p.test(name)) {
        return { ...f, value: "[REDACTED]" };
      }
    }
    return f;
  });
}

// ── Anomaly Logging (fire-and-forget) ───────────────────────────
// Track counters in-memory; flush to DB periodically
const anomalyCounts = new Map<string, { count: number; firstSeen: number; lastDetails: any }>();

export async function logAnomaly(
  supabase: any,
  orgId: string,
  siteId: string | null,
  anomalyType: string,
  details: Record<string, unknown>,
) {
  const key = `${orgId}:${siteId || "none"}:${anomalyType}`;
  const existing = anomalyCounts.get(key);
  const now = Date.now();

  if (existing && now - existing.firstSeen < 60_000) {
    existing.count++;
    existing.lastDetails = details;
    // Only flush if count threshold exceeded (spike detection)
    if (existing.count === 50 || existing.count === 200) {
      try {
        await supabase.from("ingestion_anomalies").insert({
          org_id: orgId,
          site_id: siteId,
          anomaly_type: anomalyType,
          details: { ...details, count_in_window: existing.count },
        });
      } catch { /* non-fatal */ }
    }
    return;
  }

  anomalyCounts.set(key, { count: 1, firstSeen: now, lastDetails: details });
  try {
    await supabase.from("ingestion_anomalies").insert({
      org_id: orgId,
      site_id: siteId,
      anomaly_type: anomalyType,
      details,
    });
  } catch { /* non-fatal */ }
}

// Cleanup anomaly counters
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [k, v] of anomalyCounts) {
    if (v.firstSeen < cutoff) anomalyCounts.delete(k);
  }
}, 60_000);

// ── Sanitization ────────────────────────────────────────────────
export function sanitizeStr(val: unknown, maxLen: number): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s.length === 0) return null;
  return s.slice(0, maxLen);
}
