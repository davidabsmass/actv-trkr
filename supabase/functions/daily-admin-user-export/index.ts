// Daily admin user export — generates a CSV of all platform users and emails
// it to system admins. Idempotent per (digest_date, recipient).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECIPIENTS = ["david@absmass.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10);

    const [profilesRes, orgUsersRes, orgsRes, rolesRes, loginsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, email, full_name, created_at"),
      supabase.from("org_users").select("user_id, org_id, role, created_at"),
      supabase.from("orgs").select("id, name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("login_events").select("email, logged_in_at"),
    ]);

    const profiles = profilesRes.data || [];
    const orgUsers = orgUsersRes.data || [];
    const orgs = orgsRes.data || [];
    const roles = rolesRes.data || [];
    const logins = loginsRes.data || [];

    const orgMap = new Map(orgs.map((o: any) => [o.id, o.name]));
    const orgsByUser = new Map<string, string[]>();
    orgUsers.forEach((ou: any) => {
      const label = `${orgMap.get(ou.org_id) || ou.org_id} (${ou.role})`;
      if (!orgsByUser.has(ou.user_id)) orgsByUser.set(ou.user_id, []);
      orgsByUser.get(ou.user_id)!.push(label);
    });
    const sysRoleByUser = new Map<string, string[]>();
    roles.forEach((r: any) => {
      if (!sysRoleByUser.has(r.user_id)) sysRoleByUser.set(r.user_id, []);
      sysRoleByUser.get(r.user_id)!.push(r.role);
    });
    const lastLoginByEmail = new Map<string, string>();
    logins.forEach((l: any) => {
      const e = (l.email || "").toLowerCase();
      if (!e) return;
      const prev = lastLoginByEmail.get(e);
      if (!prev || l.logged_in_at > prev) lastLoginByEmail.set(e, l.logged_in_at);
    });

    const escape = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = ["email", "full_name", "user_id", "system_roles", "organizations", "created_at", "last_login_at"];
    const rows = profiles.map((p: any) => {
      const email = (p.email || "").toLowerCase();
      return [
        p.email || "",
        p.full_name || "",
        p.user_id,
        (sysRoleByUser.get(p.user_id) || []).join("; "),
        (orgsByUser.get(p.user_id) || []).join("; "),
        p.created_at || "",
        lastLoginByEmail.get(email) || "",
      ].map(escape).join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const csvBase64 = btoa(unescape(encodeURIComponent(csv)));

    let sent = 0;
    for (const recipient of RECIPIENTS) {
      // Idempotency: skip if already sent today
      const { data: existing } = await supabase
        .from("admin_digest_log")
        .select("id")
        .eq("digest_type", "user_export_daily")
        .eq("digest_date", today)
        .eq("recipient_email", recipient)
        .maybeSingle();
      if (existing) continue;

      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "admin-user-export",
            recipientEmail: recipient,
            idempotencyKey: `user-export-${today}-${recipient}`,
            templateData: {
              date: today,
              userCount: profiles.length,
              csvBase64,
              csvFilename: `actv-trkr-users-${today}.csv`,
            },
          },
        });
        sent++;
        await supabase.from("admin_digest_log").insert({
          digest_type: "user_export_daily",
          digest_date: today,
          recipient_email: recipient,
          payload: { user_count: profiles.length },
        });
      } catch (err) {
        console.error(`Failed to send user export to ${recipient}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, user_count: profiles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
