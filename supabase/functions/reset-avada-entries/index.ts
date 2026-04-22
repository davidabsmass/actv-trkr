import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { org_id, site_id } = await req.json();
    if (!org_id || !site_id) {
      return new Response(JSON.stringify({ error: "org_id and site_id are required" }), {
        status: 400,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify user is admin or member of the org
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: membership } = await admin
      .from("org_users")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || !["admin", "member"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Find all Avada forms for this site
    const { data: avadaForms, error: formsErr } = await admin
      .from("forms")
      .select("id")
      .eq("org_id", org_id)
      .eq("site_id", site_id)
      .eq("provider", "avada");

    if (formsErr) throw formsErr;
    if (!avadaForms || avadaForms.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, deleted_leads: 0, deleted_raw_events: 0, deleted_flat_fields: 0, forms_affected: 0, message: "No Avada forms found" }),
        { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const formIds = avadaForms.map((f) => f.id);
    let totalDeletedLeads = 0;
    let totalDeletedRawEvents = 0;
    let totalDeletedFlatFields = 0;
    const errors: string[] = [];

    // 1. Get all lead IDs for these forms — paginate to avoid 1000-row limit
    const allLeadIds: string[] = [];
    const pageSize = 1000;
    for (const formId of formIds) {
      let offset = 0;
      while (true) {
        const { data: leads, error: leadsErr } = await admin
          .from("leads")
          .select("id")
          .eq("org_id", org_id)
          .eq("form_id", formId)
          .range(offset, offset + pageSize - 1);

        if (leadsErr) {
          errors.push(`Failed to query leads for form ${formId}: ${leadsErr.message}`);
          break;
        }
        if (!leads || leads.length === 0) break;
        allLeadIds.push(...leads.map((l) => l.id));
        if (leads.length < pageSize) break;
        offset += pageSize;
      }
    }

    // 2. Delete lead_fields_flat in batches
    if (allLeadIds.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < allLeadIds.length; i += batchSize) {
        const batch = allLeadIds.slice(i, i + batchSize);
        const { error: flatErr, count } = await admin
          .from("lead_fields_flat")
          .delete({ count: "exact" })
          .eq("org_id", org_id)
          .in("lead_id", batch);

        if (flatErr) {
          errors.push(`Failed to delete lead_fields_flat batch at offset ${i}: ${flatErr.message}`);
        } else {
          totalDeletedFlatFields += count || 0;
        }
      }
    }

    // 3. Delete lead_events_raw for these forms
    for (const formId of formIds) {
      const { error: rawErr, count } = await admin
        .from("lead_events_raw")
        .delete({ count: "exact" })
        .eq("org_id", org_id)
        .eq("form_id", formId);

      if (rawErr) {
        errors.push(`Failed to delete lead_events_raw for form ${formId}: ${rawErr.message}`);
      } else {
        totalDeletedRawEvents += count || 0;
      }
    }

    // 4. Delete leads for these forms
    for (const formId of formIds) {
      const { error: leadErr, count } = await admin
        .from("leads")
        .delete({ count: "exact" })
        .eq("org_id", org_id)
        .eq("form_id", formId);

      if (leadErr) {
        errors.push(`Failed to delete leads for form ${formId}: ${leadErr.message}`);
      } else {
        totalDeletedLeads += count || 0;
      }
    }

    if (errors.length > 0) {
      console.error(`[reset-avada-entries] Partial failures: ${errors.join("; ")}`);
    }

    console.log(`[reset-avada-entries] Deleted ${totalDeletedLeads} leads, ${totalDeletedRawEvents} raw events, ${totalDeletedFlatFields} flat fields across ${formIds.length} Avada forms for org=${org_id} site=${site_id}`);

    return new Response(
      JSON.stringify({
        ok: errors.length === 0,
        deleted_leads: totalDeletedLeads,
        deleted_raw_events: totalDeletedRawEvents,
        deleted_flat_fields: totalDeletedFlatFields,
        forms_affected: formIds.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[reset-avada-entries] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
