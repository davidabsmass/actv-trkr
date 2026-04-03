import { appCorsHeaders } from '../_shared/cors.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const { secret } = await req.json();
    const adminSecret = Deno.env.get("ADMIN_SECRET");

    if (!adminSecret || secret !== adminSecret) {
      return new Response(JSON.stringify({ authorized: false }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ authorized: true }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ authorized: false }), {
      status: 400,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
