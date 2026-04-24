// One-off helper to upload the "OTHERS" email header banner into the
// email-assets bucket. Reads the file content from the inlined base64
// string in the request body (kept out of the repo). Service-role key
// bypasses storage RLS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);

    const { path, base64 } = await req.json();
    if (!path || !base64) {
      return new Response(JSON.stringify({ error: "path and base64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from("email-assets")
      .upload(path, binary, { contentType: "image/jpeg", upsert: true });

    if (error) throw error;

    const { data } = supabase.storage.from("email-assets").getPublicUrl(path);
    return new Response(JSON.stringify({ ok: true, url: data.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
