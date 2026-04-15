/**
 * Per-user per-function in-memory rate limiter for authenticated edge functions.
 * Prevents spam by enforcing short-burst and rolling-window limits.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

// Map key: `${userId}:${functionName}`
const buckets = new Map<string, Bucket>();

// Cleanup stale buckets every 2 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now > v.resetAt) buckets.delete(k);
  }
}, 120_000);

/** Default limits per function category */
const FUNCTION_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  // AI features — expensive, limit tightly
  "ai-chatbot":            { maxRequests: 20, windowMs: 60_000 },
  "dashboard-ai-insights": { maxRequests: 5,  windowMs: 60_000 },
  "reports-ai-copy":       { maxRequests: 5,  windowMs: 60_000 },
  "seo-suggest-fix":       { maxRequests: 10, windowMs: 60_000 },
  "seo-fix-command":       { maxRequests: 10, windowMs: 60_000 },

  // Exports & reports — heavy processing
  "process-export":        { maxRequests: 3,  windowMs: 60_000 },
  "process-report":        { maxRequests: 3,  windowMs: 60_000 },

  // Feedback — prevent spam
  "submit-feedback":       { maxRequests: 3,  windowMs: 300_000 },

  // Scans
  "scan-site-seo":         { maxRequests: 2,  windowMs: 300_000 },
  "scan-broken-links":     { maxRequests: 2,  windowMs: 300_000 },

  // Default for any other function
  "_default":              { maxRequests: 30, windowMs: 60_000 },
};

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Check if a user is within their rate limit for a given function.
 * Call this early in every authenticated edge function handler.
 */
export function checkUserRateLimit(
  userId: string,
  functionName: string,
  overrides?: { maxRequests?: number; windowMs?: number },
): RateLimitResult {
  const config = overrides
    ? { ...FUNCTION_LIMITS._default, ...overrides }
    : FUNCTION_LIMITS[functionName] || FUNCTION_LIMITS._default;

  const key = `${userId}:${functionName}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  bucket.count++;

  if (bucket.count > config.maxRequests) {
    return {
      allowed: false,
      retryAfterMs: bucket.resetAt - now,
    };
  }

  return { allowed: true };
}

/**
 * Helper to return a standardized 429 response.
 */
export function rateLimitResponse(
  corsHeaders: Record<string, string>,
  retryAfterMs?: number,
): Response {
  const retryAfterSec = Math.ceil((retryAfterMs || 60_000) / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please wait before trying again.",
      retry_after_seconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
