// Daily lifecycle manager (Phase 1 + emails).
//
// Responsibilities:
// 1. For orgs in `grace_period`, send cancellation + day-25 warning emails (idempotent).
// 2. After 30 days in grace_period → flip to `archived`.
// 3. For orgs in `archived`, send day-80 final notice email (idempotent).
//
// Phase 1 stops there: no hard-delete cron in this iteration. Archived orgs
// remain read-only with reactivation always available; deletion is manual
// for now.
//
// billing_exempt orgs are skipped entirely — they should never be in
// grace_period or archived in production, but we double-guard here.

import { createClient } from "npm:@supabase/supabase-js@2";

function logStep(step: string, details?: any) {
  console.log(`[BILLING-STATE-MANAGER] ${step}${details ? ` ${JSON.stringify(details)}` : ""}`);
}

async function getRecipientForOrg(
  admin: any,
  orgId: string
): Promise<{ email: string; name: string | null } | null> {
  const { data: members } = await admin
    .from("org_users")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (!members || members.length === 0) return null;
  const ownerOrFirst =
    members.find((m: any) => m.role === "owner") || members[0];
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", ownerOrFirst.user_id)
    .maybeSingle();
  if (!profile?.email) return null;
  return { email: profile.email, name: profile.full_name ?? null };
}

async function sendLifecycleEmail(
  admin: any,
  templateName: string,
  email: string,
  orgId: string,
  templateData: Record<string, any>
) {
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
      logStep("Email invoke error", { templateName, orgId, error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    logStep("Email invoke exception", { templateName, orgId, error: String(e) });
    return false;
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const summary = {
      cancellation_emails: 0,
      day25_emails: 0,
      day80_emails: 0,
      flipped_to_archived: 0,
    };

    // Pull all non-active, non-exempt orgs
    const { data: orgs, error } = await admin
      .from("orgs")
      .select(
        "id, name, status, billing_exempt, grace_period_ends_at, archived_at, cancellation_email_sent_at, day25_email_sent_at, day80_email_sent_at"
      )
      .in("status", ["grace_period", "archived"])
      .or("billing_exempt.is.null,billing_exempt.eq.false");

    if (error) {
      logStep("Failed to load orgs", { error: error.message });
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const now = new Date();
    logStep("Processing orgs", { count: orgs?.length ?? 0 });

    for (const org of orgs ?? []) {
      const recipient = await getRecipientForOrg(admin, org.id);
      if (!recipient) {
        logStep("Skipping — no recipient", { orgId: org.id });
        continue;
      }

      // ── GRACE PERIOD ──
      if (org.status === "grace_period") {
        const graceEnd = org.grace_period_ends_at ? new Date(org.grace_period_ends_at) : null;

        // 1. Initial cancellation email (send once, immediately after entering grace)
        if (!org.cancellation_email_sent_at) {
          const ok = await sendLifecycleEmail(admin, "lifecycle-cancellation", recipient.email, org.id, {
            name: recipient.name ?? undefined,
            graceEndsAt: graceEnd ? fmtDate(graceEnd) : undefined,
          });
          if (ok) {
            await admin.from("orgs").update({ cancellation_email_sent_at: now.toISOString() }).eq("id", org.id);
            summary.cancellation_emails += 1;
          }
        }

        // 2. Day-25 warning (5 days before archive)
        if (graceEnd && !org.day25_email_sent_at) {
          const daysUntilArchive = Math.ceil((graceEnd.getTime() - now.getTime()) / 86_400_000);
          if (daysUntilArchive <= 5 && daysUntilArchive >= 0) {
            const ok = await sendLifecycleEmail(admin, "lifecycle-archive-warning", recipient.email, org.id, {
              name: recipient.name ?? undefined,
              archiveDate: fmtDate(graceEnd),
            });
            if (ok) {
              await admin.from("orgs").update({ day25_email_sent_at: now.toISOString() }).eq("id", org.id);
              summary.day25_emails += 1;
            }
          }
        }

        // 3. Flip to archived if grace expired
        if (graceEnd && now >= graceEnd) {
          const { error: rpcErr } = await admin.rpc("set_org_lifecycle_status", {
            p_org_id: org.id,
            p_status: "archived",
            p_reason: "grace_period_expired",
          });
          if (rpcErr) {
            logStep("Failed to flip to archived", { orgId: org.id, error: rpcErr.message });
          } else {
            summary.flipped_to_archived += 1;
            logStep("Flipped to archived", { orgId: org.id });
          }
        }
      }

      // ── ARCHIVED ──
      if (org.status === "archived") {
        // Day-80 final notice — sent ~50 days into archived state (80 days post-cancel),
        // gives recipient ~10 days advance warning before any future hard-delete.
        if (!org.day80_email_sent_at && org.archived_at) {
          const archivedAt = new Date(org.archived_at);
          const daysArchived = Math.floor((now.getTime() - archivedAt.getTime()) / 86_400_000);
          if (daysArchived >= 50) {
            // Estimate deletion date: archived + 60 days (10 days from now)
            const deletionDate = new Date(archivedAt.getTime() + 60 * 86_400_000);
            const ok = await sendLifecycleEmail(admin, "lifecycle-final-notice", recipient.email, org.id, {
              name: recipient.name ?? undefined,
              deletionDate: fmtDate(deletionDate),
            });
            if (ok) {
              await admin.from("orgs").update({ day80_email_sent_at: now.toISOString() }).eq("id", org.id);
              summary.day80_emails += 1;
            }
          }
        }
      }
    }

    logStep("Done", summary);
    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    logStep("Fatal error", { error: e?.message || String(e) });
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 });
  }
});
