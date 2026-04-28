// Record an ACTV TRKR user's marketing-consent decision (signup, onboarding,
// or Email Preferences). Updates `profiles` and upserts into `marketing_contacts`.
// Always JWT-protected — only the signed-in user can record consent for themselves.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Body = {
  optIn: boolean;
  source?:
    | "signup"
    | "trial"
    | "early_access"
    | "demo_request"
    | "manual_import"
    | "team_invite"
    | "report_subscribe_link"
    | "email_preferences"
    | "onboarding"
    | "other";
  consentText?: string;
  consentUrl?: string;
  fullName?: string;
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const rawBody = (await req.json().catch(() => ({}))) as
      | (Body & { email?: string; status?: string; token?: string })
      | Record<string, unknown>;

    // ---- PUBLIC UNSUBSCRIBE-BY-EMAIL BRANCH ----
    // Triggered from the /unsubscribe landing page. No JWT required.
    // Accepts { status: "unsubscribed", email, token? } and marks the
    // marketing_contacts row for that email as unsubscribed. Always returns
    // 200 (does not leak whether the email exists in our list).
    if (
      (rawBody as any)?.status === "unsubscribed" &&
      typeof (rawBody as any)?.email === "string"
    ) {
      const email = ((rawBody as any).email as string).toLowerCase().trim();
      const token = ((rawBody as any).token as string) || null;
      const ip =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null;
      const ipHash = ip ? await sha256Hex(ip) : null;

      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      });

      const now = new Date().toISOString();
      const { data: existing } = await admin
        .from("marketing_contacts")
        .select("id")
        .eq("email_lower", email)
        .maybeSingle();

      if (existing?.id) {
        await admin
          .from("marketing_contacts")
          .update({
            marketing_consent_status: "unsubscribed",
            unsubscribed_at: now,
          })
          .eq("id", existing.id);
        await admin.from("marketing_contact_events").insert({
          contact_id: existing.id,
          email_lower: email,
          event_type: "unsubscribe",
          actor_type: "self_link",
          metadata: { source: "unsubscribe_link", token, ip_hash: ipHash },
        });
      } else {
        // Record an event even if no contact exists, so we can audit attempts.
        await admin.from("marketing_contact_events").insert({
          contact_id: null,
          email_lower: email,
          event_type: "unsubscribe",
          actor_type: "self_link",
          metadata: { source: "unsubscribe_link", token, ip_hash: ipHash, no_contact: true },
        });
      }

      // Also flip the profile flag if a matching ACTV TRKR account exists.
      await admin
        .from("profiles")
        .update({
          marketing_consent_status: "unsubscribed",
          marketing_consent_timestamp: now,
          unsubscribed_at: now,
        })
        .eq("email", email);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- AUTHENTICATED BRANCH (default) ----
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Verify the caller's identity using the user's JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    const email = (user.email || "").toLowerCase().trim();
    if (!email) {
      return new Response(JSON.stringify({ error: "no_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const optIn = !!body.optIn;
    const source = body.source ?? "signup";
    const consentText =
      body.consentText ??
      "Send me ACTV TRKR product updates, launch news, and website performance tips. I can unsubscribe at any time.";
    const consentUrl = body.consentUrl ?? null;

    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ipHash = ip ? await sha256Hex(ip) : null;

    const now = new Date().toISOString();

    // 2) Service-role for the actual writes (bypasses admin-only RLS on
    // marketing_contacts; we've already validated the caller is the user).
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Update profiles (the user's own record)
    await admin
      .from("profiles")
      .update({
        marketing_consent_status: optIn ? "opted_in" : "not_opted_in",
        marketing_consent_timestamp: now,
        marketing_consent_source: source,
        unsubscribed_at: optIn ? null : undefined,
      })
      .eq("user_id", user.id);

    // Look up the user's primary org (optional, for the marketing_contacts row)
    const { data: orgRow } = await admin
      .from("org_users")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    let contactId: string | null = null;

    if (optIn) {
      // Upsert marketing_contacts on email
      const { data: existing } = await admin
        .from("marketing_contacts")
        .select("id")
        .eq("email_lower", email)
        .maybeSingle();

      const fullName = body.fullName?.trim() || (user.user_metadata?.full_name as string) || "";
      const [firstName, ...rest] = fullName.split(/\s+/);
      const lastName = rest.join(" ") || null;

      if (existing?.id) {
        contactId = existing.id;
        await admin
          .from("marketing_contacts")
          .update({
            user_id: user.id,
            org_id: orgRow?.org_id ?? null,
            first_name: firstName || null,
            last_name: lastName,
            source,
            lifecycle_stage: "subscriber",
            marketing_consent_status: "opted_in",
            marketing_consent_source: source,
            marketing_consent_text: consentText,
            marketing_consent_timestamp: now,
            marketing_consent_url: consentUrl,
            consent_ip_hash: ipHash,
            unsubscribed_at: null,
          })
          .eq("id", existing.id);
      } else {
        const { data: ins } = await admin
          .from("marketing_contacts")
          .insert({
            email,
            user_id: user.id,
            org_id: orgRow?.org_id ?? null,
            first_name: firstName || null,
            last_name: lastName,
            source,
            lifecycle_stage: "subscriber",
            marketing_consent_status: "opted_in",
            marketing_consent_source: source,
            marketing_consent_text: consentText,
            marketing_consent_timestamp: now,
            marketing_consent_url: consentUrl,
            consent_ip_hash: ipHash,
          })
          .select("id")
          .single();
        contactId = ins?.id ?? null;
      }

      await admin.from("marketing_contact_events").insert({
        contact_id: contactId,
        email_lower: email,
        event_type: "opt_in",
        actor_user_id: user.id,
        actor_type: "user",
        metadata: { source, consent_url: consentUrl },
      });
    } else {
      // Not opted in: if a contact row exists, mark it unsubscribed
      const { data: existing } = await admin
        .from("marketing_contacts")
        .select("id")
        .eq("email_lower", email)
        .maybeSingle();
      if (existing?.id) {
        await admin
          .from("marketing_contacts")
          .update({
            marketing_consent_status: "unsubscribed",
            unsubscribed_at: now,
          })
          .eq("id", existing.id);
        await admin.from("marketing_contact_events").insert({
          contact_id: existing.id,
          email_lower: email,
          event_type: "unsubscribe",
          actor_user_id: user.id,
          actor_type: "user",
          metadata: { source },
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, opted_in: optIn, contact_id: contactId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("record-marketing-consent error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "internal_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
