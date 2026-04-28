/**
 * Shared observability helper for ingestion edge functions.
 *
 * STRICTLY LOG-ONLY (Phase 1):
 *   - Records last-signal touch into tracking_health
 *   - Optionally logs rate-limit observations (NO blocking decisions made here)
 *   - Optionally emits system_events for ops visibility
 *
 * RULES:
 *   - All calls are fire-and-forget (returns Promise<void>, never throws)
 *   - Failures MUST NEVER break ingestion — every call wraps in try/catch
 *   - All enforcement gates are checked via feature_enabled() but in this phase
 *     callers SHOULD NOT branch on the result for blocking behavior
 *
 * Usage in an edge function:
 *
 *   import { observe } from "../_shared/observability.ts";
 *
 *   // After successful ingestion (or in parallel — doesn't matter, fire-and-forget):
 *   observe(supabase, {
 *     orgId,
 *     siteId,
 *     endpoint: "track-pageview",
 *     status: "ok",
 *   });
 */

type ObserveOptions = {
  orgId: string | null | undefined;
  siteId?: string | null;
  endpoint: string;
  status?: "ok" | "error" | "rejected" | "throttled" | string;
  details?: Record<string, unknown>;
};

/**
 * Fire-and-forget tracking_health touch + (optional) system_events log.
 * Always resolves; never throws.
 */
export function observe(supabase: any, opts: ObserveOptions): void {
  // Bail silently on bad inputs — never break the caller
  if (!supabase || !opts || !opts.orgId || !opts.endpoint) return;

  // Detached promise — do not await, do not return it
  (async () => {
    try {
      await supabase.rpc("touch_tracking_health", {
        p_org_id: opts.orgId,
        p_site_id: opts.siteId ?? null,
        p_endpoint: opts.endpoint,
        p_status: opts.status ?? "ok",
      });
    } catch {
      // swallow — observability must never break ingestion
    }

    // Only emit a system_events row for non-OK statuses, to avoid spam
    if (opts.status && opts.status !== "ok") {
      try {
        await supabase.from("system_events").insert({
          org_id: opts.orgId,
          site_id: opts.siteId ?? null,
          event_type: `ingest_${opts.status}`,
          severity: opts.status === "error" ? "error" : "warn",
          source: opts.endpoint,
          details: opts.details ?? {},
        });
      } catch {
        // swallow
      }
    }
  })();
}

/**
 * Fire-and-forget rate-limit observation logger.
 * Records WHAT WOULD HAVE HAPPENED if limits were enforced.
 * Does NOT make any blocking decision.
 */
export function logRateLimitObservation(
  supabase: any,
  args: {
    orgId: string | null | undefined;
    siteId?: string | null;
    endpoint: string;
    bucketType: "ip" | "site" | "org" | string;
    bucketKey?: string | null;
    observedCount: number;
    threshold?: number | null;
    wouldBlock: boolean;
    details?: Record<string, unknown>;
  },
): void {
  if (!supabase || !args || !args.endpoint) return;

  (async () => {
    try {
      await supabase.rpc("log_rate_limit_observation", {
        p_org_id: args.orgId ?? null,
        p_site_id: args.siteId ?? null,
        p_endpoint: args.endpoint,
        p_bucket_type: args.bucketType,
        p_bucket_key: args.bucketKey ?? null,
        p_observed_count: args.observedCount,
        p_threshold: args.threshold ?? null,
        p_would_block: !!args.wouldBlock,
        p_details: args.details ?? {},
      });
    } catch {
      // swallow
    }
  })();
}

/**
 * Resolves whether a feature flag is enabled for a given (org, site).
 * Returns false on any error so enforcement stays OFF by default.
 *
 * NOTE for Phase 1: callers should NOT branch on this for blocking behavior.
 * It exists so Phase 2+ can wire enforcement behind explicit, opt-in flags.
 */
export async function isFeatureEnabled(
  supabase: any,
  flagKey: string,
  orgId?: string | null,
  siteId?: string | null,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("feature_enabled", {
      p_flag_key: flagKey,
      p_org_id: orgId ?? null,
      p_site_id: siteId ?? null,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
