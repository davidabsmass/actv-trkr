/**
 * Org lifecycle gate for ingest endpoints.
 *
 * Returns null if the org is allowed to ingest (active, billing_exempt,
 * or pending_connection — the very first signal needs to land so the trial
 * can start), or a structured rejection object with HTTP 402 + a payload
 * the WordPress plugin uses to render its "Tracking paused. Reactivate
 * your subscription." notice.
 *
 * Use this in ANY ingest endpoint after resolving an org_id from credentials.
 */
export type LifecycleRejection = {
  status: 402;
  body: {
    status: "inactive";
    org_status: "grace_period" | "archived";
    message: string;
    grace_period_ends_at: string | null;
    archived_at: string | null;
  };
};

export async function gateOrgLifecycle(
  supabase: any,
  orgId: string
): Promise<LifecycleRejection | null> {
  const { data: org } = await supabase
    .from("orgs")
    .select("status, billing_exempt, grace_period_ends_at, archived_at")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) return null; // unknown org — let caller's existing checks handle
  if (org.billing_exempt === true) return null;
  if (org.status === "active") return null;
  // pending_connection orgs MUST be allowed through — the first signal is
  // exactly what flips them to active and starts the 7-day trial.
  if (org.status === "pending_connection") return null;

  const message =
    org.status === "grace_period"
      ? "Subscription inactive. Reactivate to resume tracking."
      : "Account archived. Reactivate to restore access and resume tracking.";

  return {
    status: 402,
    body: {
      status: "inactive",
      org_status: org.status,
      message,
      grace_period_ends_at: org.grace_period_ends_at,
      archived_at: org.archived_at,
    },
  };
}
