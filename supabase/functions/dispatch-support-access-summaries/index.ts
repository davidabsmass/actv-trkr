// Dispatch support-access summary emails.
//
// Triggered by:
//   1. pg_cron every 5 minutes (catches grants that quietly expire).
//   2. Direct calls from the dashboard immediately after revoke (so the
//      customer gets feedback right away instead of waiting up to 5 min).
//
// For each grant that has ended (revoked OR past expires_at) but doesn't yet
// have summary_email_sent_at, we collect the audit-log entries that occurred
// during the window and enqueue ONE transactional email to the user who
// granted access. We mark the grant immediately so a parallel run cannot
// re-send the same email.
//
// Idempotent + safe to call repeatedly.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Grant = {
  id: string;
  org_id: string;
  granted_by_user_id: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (step: string, details?: unknown) => {
    console.log(
      `[dispatch-support-access-summaries] [${requestId}] ${step}${
        details ? " - " + JSON.stringify(details) : ""
      }`,
    );
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Optional: caller can hint a single grant_id (used by the revoke flow)
    // to fast-track that one before falling through to the general scan.
    let hintedGrantId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.grant_id && typeof body.grant_id === "string") {
          hintedGrantId = body.grant_id;
        }
      } catch {
        // empty body is fine
      }
    }

    const nowIso = new Date().toISOString();
    // Look back 24h so we don't email about ancient grants if cron was paused.
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find grants that have ended but haven't been summarized yet.
    // "Ended" = revoked OR past expiry. Recent = within the last 24h.
    let query = admin
      .from("dashboard_access_grants")
      .select(
        "id, org_id, granted_by_user_id, granted_at, expires_at, revoked_at",
      )
      .is("summary_email_sent_at", null);

    if (hintedGrantId) {
      query = query.eq("id", hintedGrantId);
    } else {
      query = query
        .or(
          `and(revoked_at.gte.${cutoffIso}),and(revoked_at.is.null,expires_at.lte.${nowIso},expires_at.gte.${cutoffIso})`,
        )
        .limit(50);
    }

    const { data: grants, error: gErr } = await query;
    if (gErr) {
      log("query_failed", { error: gErr.message });
      return new Response(
        JSON.stringify({ error: "query_failed", detail: gErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!grants || grants.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let processed = 0;
    let skipped = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const grant of grants as Grant[]) {
      try {
        const endedAt = grant.revoked_at ?? grant.expires_at;
        const endedReason: "revoked" | "expired" = grant.revoked_at
          ? "revoked"
          : "expired";

        // Skip grants whose expiry is still in the future and haven't been revoked.
        if (!grant.revoked_at && new Date(grant.expires_at) > new Date()) {
          skipped++;
          continue;
        }

        // CLAIM the grant first to avoid double-sending under concurrent runs.
        const { data: claimed, error: claimErr } = await admin
          .from("dashboard_access_grants")
          .update({ summary_email_sent_at: new Date().toISOString() })
          .eq("id", grant.id)
          .is("summary_email_sent_at", null)
          .select("id")
          .maybeSingle();

        if (claimErr || !claimed) {
          // Either someone else already claimed it or the row is gone.
          skipped++;
          continue;
        }

        // Look up recipient profile (the user who granted access).
        const { data: profile } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", grant.granted_by_user_id)
          .maybeSingle();

        let recipientEmail = profile?.email ?? null;
        let recipientName = profile?.full_name ?? null;

        // Fallback: pull email from auth.users if profile is missing.
        if (!recipientEmail) {
          const { data: authUser } = await admin.auth.admin.getUserById(
            grant.granted_by_user_id,
          );
          recipientEmail = authUser?.user?.email ?? null;
        }

        if (!recipientEmail) {
          log("no_recipient_email", { grant_id: grant.id });
          failures.push({ id: grant.id, error: "no_recipient_email" });
          continue;
        }

        // Pull every audit entry inside the window (granted_at .. endedAt).
        const { data: actions } = await admin
          .from("dashboard_access_audit_log")
          .select("action, resource_type, occurred_at")
          .eq("grant_id", grant.id)
          .order("occurred_at", { ascending: true })
          .limit(200);

        const safeActions = (actions ?? []).map((a) => ({
          action: a.action,
          resource_type: a.resource_type,
          occurred_at: a.occurred_at,
        }));

        const { error: sendErr } = await admin.functions.invoke(
          "send-transactional-email",
          {
            body: {
              templateName: "support-access-summary",
              recipientEmail,
              idempotencyKey: `support-access-summary-${grant.id}`,
              templateData: {
                recipientName,
                endedReason,
                grantedAt: grant.granted_at,
                endedAt,
                actions: safeActions,
                totalActions: safeActions.length,
              },
            },
          },
        );

        if (sendErr) {
          // Roll back the claim so a future run can retry.
          await admin
            .from("dashboard_access_grants")
            .update({ summary_email_sent_at: null })
            .eq("id", grant.id);
          failures.push({ id: grant.id, error: String(sendErr.message ?? sendErr) });
          log("send_failed", { grant_id: grant.id, error: sendErr });
          continue;
        }

        processed++;
      } catch (e) {
        failures.push({ id: grant.id, error: String(e) });
        log("grant_loop_error", { grant_id: grant.id, error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        skipped,
        failures: failures.length,
        failureDetails: failures.slice(0, 10),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[dispatch-support-access-summaries] exception", err);
    return new Response(
      JSON.stringify({ error: "internal", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
