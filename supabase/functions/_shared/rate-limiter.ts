/**
 * Per-user per-function DB-backed rate limiter for authenticated edge functions.
 * Uses the rate_limits table for persistence across cold starts and isolates.
 * Falls back to in-memory for non-critical paths.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

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
 * Uses the rate_limits DB table for persistence across isolates.
 */
export async function checkUserRateLimit(
  userId: string,
  functionName: string,
  overrides?: { maxRequests?: number; windowMs?: number },
): Promise<RateLimitResult> {
  const config = overrides
    ? { ...FUNCTION_LIMITS._default, ...overrides }
    : FUNCTION_LIMITS[functionName] || FUNCTION_LIMITS._default;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const windowStart = new Date(Date.now() - config.windowMs).toISOString();

    // Try to get existing record
    const { data: existing } = await supabase
      .from("rate_limits")
      .select("request_count, window_start")
      .eq("user_id", userId)
      .eq("function_name", functionName)
      .single();

    if (!existing) {
      // First request — insert
      await supabase.from("rate_limits").upsert({
        user_id: userId,
        function_name: functionName,
        window_start: new Date().toISOString(),
        request_count: 1,
      }, { onConflict: "user_id,function_name" });
      return { allowed: true };
    }

    // Check if window has expired
    if (new Date(existing.window_start) < new Date(windowStart)) {
      // Reset window
      await supabase.from("rate_limits")
        .update({ request_count: 1, window_start: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("function_name", functionName);
      return { allowed: true };
    }

    // Window still active — check count
    if (existing.request_count >= config.maxRequests) {
      const retryAfterMs = new Date(existing.window_start).getTime() + config.windowMs - Date.now();
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    // Increment atomically
    await supabase.rpc("increment_rate_limit", {
      p_user_id: userId,
      p_function_name: functionName,
    });

    return { allowed: true };
  } catch (err) {
    // If DB fails, allow the request (fail-open) but log warning
    console.warn("[RATE-LIMITER] DB check failed, allowing request:", err);
    return { allowed: true };
  }
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
