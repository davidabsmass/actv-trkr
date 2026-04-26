// Retention flow dispatcher
// - Recomputes account health for every org
// - Evaluates active flows and enqueues messages into the existing transactional_emails queue
// - Idempotent: enforces one message per (flow_step, org) via uq_rm_dedupe
// Invoked by pg_cron every 15 minutes.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const log = (step: string, details?: unknown) =>
  console.log(`[RETENTION-DISPATCHER] ${step}${details !== undefined ? ` ${JSON.stringify(details)}` : ""}`);

const APP_URL = Deno.env.get("APP_URL") || "https://actvtrkr.com";
const SUPPORT_EMAIL = "david@absmass.com";

interface Flow {
  id: string;
  slug: string;
  name: string;
  trigger_type: string;
  trigger_event: string | null;
  absence_event: string | null;
  absence_window_hours: number | null;
  is_active: boolean;
}

interface Step {
  id: string;
  flow_id: string;
  step_order: number;
  delay_minutes: number;
  template_name: string | null;
  subject: string | null;
  body: string;
}

interface Candidate {
  org_id: string;
  occurred_at: string;
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let enqueued = 0;
  let evaluated = 0;
  const errors: string[] = [];

  try {
    // 1) Recompute health for everyone
    const { error: rpcErr } = await supabase.rpc("recompute_all_account_health");
    if (rpcErr) errors.push(`recompute_all_account_health: ${rpcErr.message}`);

    // 2) Load active flows and their first step
    const { data: flows, error: flowsErr } = await supabase
      .from("retention_flows")
      .select("id, slug, name, trigger_type, trigger_event, absence_event, absence_window_hours, is_active")
      .eq("is_active", true);
    if (flowsErr) throw flowsErr;

    const { data: steps, error: stepsErr } = await supabase
      .from("retention_flow_steps")
      .select("id, flow_id, step_order, delay_minutes, template_name, subject, body")
      .eq("step_order", 1)
      .eq("is_active", true);
    if (stepsErr) throw stepsErr;

    const stepByFlow = new Map<string, Step>();
    for (const s of (steps || []) as Step[]) stepByFlow.set(s.flow_id, s);

    // 3) For each flow, find candidate orgs that haven't received this step yet
    for (const flow of (flows || []) as Flow[]) {
      const step = stepByFlow.get(flow.id);
      if (!step) continue;

      let candidates: Candidate[] = [];

      if (flow.trigger_type === "event" && flow.trigger_event) {
        // Orgs whose earliest occurrence of trigger_event is within last 7 days
        const { data, error } = await supabase
          .from("retention_events")
          .select("org_id, occurred_at")
          .eq("event_name", flow.trigger_event)
          .gte("occurred_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
          .order("occurred_at", { ascending: false })
          .limit(500);
        if (error) { errors.push(`fetch ${flow.slug}: ${error.message}`); continue; }
        const seen = new Set<string>();
        candidates = (data || []).filter((r: any) => { if (seen.has(r.org_id)) return false; seen.add(r.org_id); return true; });
      } else if (flow.trigger_type === "absence" && flow.absence_event && flow.absence_window_hours) {
        // Orgs older than window that DO NOT have the absence_event
        const cutoff = new Date(Date.now() - flow.absence_window_hours * 3600 * 1000).toISOString();
        const { data: olderOrgs, error: orgErr } = await supabase
          .from("orgs")
          .select("id, created_at")
          .lt("created_at", cutoff)
          .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
          .limit(500);
        if (orgErr) { errors.push(`orgs ${flow.slug}: ${orgErr.message}`); continue; }

        const orgIds = (olderOrgs || []).map((o: any) => o.id);
        if (orgIds.length === 0) continue;

        const { data: hasEvents } = await supabase
          .from("retention_events")
          .select("org_id")
          .eq("event_name", flow.absence_event)
          .in("org_id", orgIds);
        const hasSet = new Set((hasEvents || []).map((r: any) => r.org_id));
        candidates = (olderOrgs || [])
          .filter((o: any) => !hasSet.has(o.id))
          .map((o: any) => ({ org_id: o.id, occurred_at: o.created_at }));
      } else {
        // 'schedule' / 'manual' handled elsewhere — skip in MVP dispatcher
        continue;
      }

      evaluated += candidates.length;

      // 4) For each candidate, check dedupe + enqueue email
      for (const cand of candidates) {
        // Skip if a message for this flow_step+org already exists
        const { data: existing } = await supabase
          .from("retention_messages")
          .select("id")
          .eq("flow_step_id", step.id)
          .eq("org_id", cand.org_id)
          .maybeSingle();
        if (existing) continue;

        // Resolve recipient: org admin email
        const { data: adminUsers } = await supabase
          .from("org_users")
          .select("user_id")
          .eq("org_id", cand.org_id)
          .eq("role", "admin")
          .limit(1);
        const userId = adminUsers?.[0]?.user_id;
        if (!userId) continue;

        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", userId)
          .maybeSingle();
        const recipient = profile?.email;
        if (!recipient) continue;

        // Resolve account name
        const { data: orgRow } = await supabase.from("orgs").select("name").eq("id", cand.org_id).maybeSingle();
        const accountName = orgRow?.name || profile?.full_name || "";

        const templateData = {
          account_name: accountName,
          dashboard_url: `${APP_URL}/dashboard`,
          setup_url: `${APP_URL}/get-started`,
          billing_update_url: `${APP_URL}/account`,
          pause_url: `${APP_URL}/account`,
          support_email: SUPPORT_EMAIL,
        };

        // Insert retention_message row first
        const { data: msgRow, error: msgErr } = await supabase
          .from("retention_messages")
          .insert({
            flow_id: flow.id,
            flow_step_id: step.id,
            org_id: cand.org_id,
            user_id: userId,
            recipient_email: recipient,
            channel: "email",
            message_type: "flow",
            subject: step.subject,
            body: step.body,
            status: "queued",
            scheduled_for: new Date().toISOString(),
            metadata: { template_name: step.template_name, flow_slug: flow.slug },
          })
          .select("id")
          .single();
        if (msgErr) { errors.push(`insert msg ${flow.slug}: ${msgErr.message}`); continue; }

        // Enqueue into transactional email queue (reuses existing send-transactional-email infra)
        try {
          const { error: invokeErr } = await supabase.functions.invoke("send-transactional-email", {
            body: {
              template: step.template_name || "retention-welcome",
              to: recipient,
              data: templateData,
              label: `retention-${flow.slug}`,
              idempotency_key: `retention-${step.id}-${cand.org_id}`,
            },
          });
          if (invokeErr) {
            errors.push(`enqueue ${flow.slug}: ${invokeErr.message}`);
            await supabase.from("retention_messages").update({ status: "failed", metadata: { error: invokeErr.message } }).eq("id", msgRow.id);
            continue;
          }
          await supabase.from("retention_messages").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", msgRow.id);
          await supabase.from("retention_message_log").insert({ message_id: msgRow.id, event_type: "queued", details: { template: step.template_name } });
          enqueued++;
        } catch (e) {
          errors.push(`invoke ${flow.slug}: ${String(e)}`);
        }
      }
    }
  } catch (e) {
    log("FATAL", String(e));
    return new Response(JSON.stringify({ ok: false, error: String(e), enqueued, evaluated, errors }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  log("done", { enqueued, evaluated, errors: errors.length });
  return new Response(JSON.stringify({ ok: true, enqueued, evaluated, errors }), { headers: { "Content-Type": "application/json" } });
});
