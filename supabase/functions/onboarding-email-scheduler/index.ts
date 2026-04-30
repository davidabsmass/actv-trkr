// Onboarding email scheduler — runs daily.
// Sends Day 1, 3, 7, 12 emails to org owners based on signup date.
// - Skips orgs whose subscription is cancelled/churned/past_due (cancellation halts sequence).
// - Day 12 only goes to orgs still in their 14-day Stripe trial.
// - Each email is sent at most once per org via *_sent_at columns + idempotencyKey.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type DayKey = 1 | 3 | 7 | 12;

const TEMPLATE_BY_DAY: Record<DayKey, string> = {
  1: "onboarding-day1-key-action",
  3: "onboarding-day3-ai-leads",
  7: "onboarding-day7-visitor-journeys",
  12: "onboarding-day12-trial-ending",
};

const COLUMN_BY_DAY: Record<DayKey, string> = {
  1: "onboarding_day1_sent_at",
  3: "onboarding_day3_sent_at",
  7: "onboarding_day7_sent_at",
  12: "onboarding_day12_sent_at",
};

// Subscription statuses that mean the user has cancelled / disengaged.
// If detected, we stop the onboarding sequence per product spec.
const CANCELLED_STATUSES = new Set(["cancelled", "canceled", "churned", "past_due"]);

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[onboarding-email-scheduler] ${step}`, details ? JSON.stringify(details) : "");
}

async function getOrgPrimaryRecipient(admin: any, orgId: string): Promise<{ email: string; name?: string } | null> {
  // Prefer the org owner (first admin role for the org).
  const { data: members } = await admin
    .from("org_users")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1);

  const userId = members?.[0]?.user_id;
  if (!userId) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.email) return null;
  return { email: profile.email, name: profile.full_name?.split(" ")?.[0] || undefined };
}

async function isCancelled(admin: any, orgId: string, recipientEmail: string): Promise<boolean> {
  // Check subscription_status for the org
  const { data: subStatus } = await admin
    .from("subscription_status")
    .select("status")
    .eq("org_id", orgId);

  for (const row of subStatus ?? []) {
    if (CANCELLED_STATUSES.has(String(row.status).toLowerCase())) return true;
  }

  // Check subscribers table by email
  const { data: subRows } = await admin
    .from("subscribers")
    .select("status")
    .eq("email", recipientEmail);

  for (const row of subRows ?? []) {
    if (CANCELLED_STATUSES.has(String(row.status).toLowerCase())) return true;
  }

  return false;
}

async function isOnTrial(admin: any, orgId: string, recipientEmail: string): Promise<boolean> {
  // A 14-day trial signup has either:
  //   (a) no stripe_subscription_id yet, OR
  //   (b) a stripe sub but status === 'trialing'
  // Anyone fully active on a paid plan is NOT on trial.
  const { data: subRows } = await admin
    .from("subscribers")
    .select("status, stripe_subscription_id")
    .eq("email", recipientEmail);

  if (!subRows || subRows.length === 0) {
    // No subscriber row at all — treat as still in trial (just signed up via free trial flow).
    return true;
  }

  for (const row of subRows) {
    const status = String(row.status ?? "").toLowerCase();
    if (status === "trialing") return true;
    if (status === "active" && !row.stripe_subscription_id) return true;
  }

  return false;
}

async function sendEmail(
  admin: any,
  templateName: string,
  email: string,
  orgId: string,
  templateData: Record<string, unknown>
): Promise<boolean> {
  try {
    const { error } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: email,
        idempotencyKey: `${templateName}-${orgId}`,
        templateData,
      },
    });
    if (error) {
      logStep("send error", { templateName, orgId, error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    logStep("send exception", { templateName, orgId, error: String(e) });
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: cron secret OR allow manual call with service role
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization") || "";
  const isCron = !!cronSecret && incoming === cronSecret;
  const isService = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "__none__");

  if (!isCron && !isService) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const summary: Record<string, number> = { day1: 0, day3: 0, day7: 0, day12: 0, skipped_cancelled: 0, skipped_not_trial: 0, errors: 0 };

  // Pull all non-archived orgs with their created_at + per-day send markers.
  const { data: orgs, error } = await admin
    .from("orgs")
    .select(
      "id, name, created_at, status, archived_at, onboarding_day1_sent_at, onboarding_day3_sent_at, onboarding_day7_sent_at, onboarding_day12_sent_at"
    )
    .is("archived_at", null);

  if (error) {
    logStep("orgs fetch error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();

  for (const org of orgs ?? []) {
    try {
      const createdAt = new Date(org.created_at).getTime();
      const ageDays = Math.floor((now - createdAt) / 86400000);

      // Quick exit if outside our entire window
      if (ageDays < 1 || ageDays > 13) continue;

      // Determine which day(s) are eligible right now.
      // Sliding window: we send the highest day reached that hasn't been sent yet.
      // (If scheduler missed a day, it will catch up on the next eligible day.)
      const candidates: DayKey[] = [];
      if (ageDays >= 12 && !org.onboarding_day12_sent_at) candidates.push(12);
      if (ageDays >= 7  && ageDays < 12 && !org.onboarding_day7_sent_at) candidates.push(7);
      if (ageDays >= 3  && ageDays < 7  && !org.onboarding_day3_sent_at) candidates.push(3);
      if (ageDays >= 1  && ageDays < 3  && !org.onboarding_day1_sent_at) candidates.push(1);

      // Edge: if scheduler missed earlier days, also catch up earlier untouched ones
      // but only if their window has passed (don't send Day 1 if user is on Day 8).
      // We choose: send each missed email at most once, on the next run after its day arrives.
      if (ageDays >= 1  && !org.onboarding_day1_sent_at  && !candidates.includes(1))  candidates.push(1);
      if (ageDays >= 3  && !org.onboarding_day3_sent_at  && !candidates.includes(3))  candidates.push(3);
      if (ageDays >= 7  && !org.onboarding_day7_sent_at  && !candidates.includes(7))  candidates.push(7);

      if (candidates.length === 0) continue;

      const recipient = await getOrgPrimaryRecipient(admin, org.id);
      if (!recipient) {
        logStep("no recipient", { org_id: org.id });
        continue;
      }

      // Cancellation gate (applies to all four emails).
      if (await isCancelled(admin, org.id, recipient.email)) {
        summary.skipped_cancelled++;
        continue;
      }

      for (const day of candidates) {
        // Day 12 — trial-only gate
        if (day === 12) {
          const onTrial = await isOnTrial(admin, org.id, recipient.email);
          if (!onTrial) {
            summary.skipped_not_trial++;
            // Mark as sent anyway so we don't re-evaluate every day forever.
            await admin.from("orgs").update({ [COLUMN_BY_DAY[12]]: new Date().toISOString() }).eq("id", org.id);
            continue;
          }
        }

        const templateName = TEMPLATE_BY_DAY[day];
        const templateData: Record<string, unknown> = { name: recipient.name };
        if (day === 12) {
          // 14-day trial → days left = max(1, 14 - ageDays)
          templateData.daysLeft = Math.max(1, 14 - ageDays);
        }

        const ok = await sendEmail(admin, templateName, recipient.email, org.id, templateData);
        if (ok) {
          await admin.from("orgs").update({ [COLUMN_BY_DAY[day]]: new Date().toISOString() }).eq("id", org.id);
          summary[`day${day}` as keyof typeof summary] = (summary[`day${day}` as keyof typeof summary] as number) + 1;
        } else {
          summary.errors++;
        }
      }
    } catch (e) {
      summary.errors++;
      logStep("org loop error", { org_id: org?.id, error: String(e) });
    }
  }

  logStep("done", summary);
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
