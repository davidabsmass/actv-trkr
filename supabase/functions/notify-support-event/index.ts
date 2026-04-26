import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://actvtrkr.com";
const ADMIN_RECIPIENTS = ["david@absmass.com"]; // Annie added later if desired

type EventKind = "created" | "admin_replied" | "customer_replied" | "status_changed" | "shipped" | "customer_resolved";

interface RequestBody {
  ticket_id: string;
  event_kind: EventKind;
  message_preview?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body?.ticket_id || !body?.event_kind) {
      return jsonResponse({ error: "ticket_id and event_kind required" }, 400);
    }

    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, message, status, priority, type, org_id, site_id, current_app_path, website_url, submitted_by_user_id, submitted_by_name, submitted_by_email")
      .eq("id", body.ticket_id)
      .maybeSingle();
    if (tErr || !ticket) return jsonResponse({ error: "Ticket not found" }, 404);

    const { data: org } = await supabase.from("orgs").select("name").eq("id", ticket.org_id).maybeSingle();

    const customerTicketUrl = `${APP_URL}/account?tab=support&ticket=${ticket.id}`;
    const adminTicketUrl = `${APP_URL}/owner-admin?tab=support&ticket=${ticket.id}`;

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sendOne = async (to: string, templateName: string, templateData: Record<string, any>, idemSuffix: string) => {
      const idempotencyKey = `support-${ticket.id}-${body.event_kind}-${idemSuffix}-${Date.now()}`;
      // Forward the caller's JWT so send-transactional-email accepts the request.
      // Falls back to anon key for service-role/internal invocations.
      const forwardAuth = authHeader || `Bearer ${anonKey}`;
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: { templateName, recipientEmail: to, idempotencyKey, templateData },
        headers: { Authorization: forwardAuth, apikey: anonKey },
      });
      if (error) console.error(`notify-support-event send error to ${to}:`, error);
    };

    // Notify CUSTOMER for: created, admin_replied, status_changed, shipped
    if (["created", "admin_replied", "status_changed", "shipped"].includes(body.event_kind)) {
      if (ticket.submitted_by_email) {
        const statusLabel = ticket.status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        await sendOne(ticket.submitted_by_email, "support-ticket-update", {
          recipientName: ticket.submitted_by_name || undefined,
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          eventKind: body.event_kind,
          statusLabel,
          messagePreview: body.message_preview,
          ticketUrl: customerTicketUrl,
        }, "cust");
      }
    }

    // Notify ADMINS for: created, customer_replied, customer_resolved
    if (["created", "customer_replied", "customer_resolved"].includes(body.event_kind)) {
      for (const adminEmail of ADMIN_RECIPIENTS) {
        await sendOne(adminEmail, "admin-new-support-ticket", {
          ticketNumber: ticket.ticket_number,
          type: ticket.type,
          priority: ticket.priority,
          subject: ticket.subject,
          message: body.event_kind === "customer_replied" || body.event_kind === "customer_resolved"
            ? body.message_preview
            : ticket.message,
          customerName: ticket.submitted_by_name,
          customerEmail: ticket.submitted_by_email,
          orgName: org?.name,
          siteUrl: ticket.website_url,
          appPath: ticket.current_app_path,
          ticketUrl: adminTicketUrl,
          eventKind: body.event_kind,
        }, `admin-${adminEmail}`);
      }
    }

    return jsonResponse({ ok: true });
  } catch (e: any) {
    console.error("notify-support-event error:", e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
