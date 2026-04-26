// One-shot helper for the a11y scanner to retrieve test credentials.
// Will be deleted immediately after the scan completes.

const ALLOWED_TOKEN = "5cfd11512fd2086c88a0f41d01e01101db0422c2ab4a7a2b";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-scan-token, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const token = req.headers.get("x-scan-token");
  if (token !== ALLOWED_TOKEN) {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }
  const email = Deno.env.get("A11Y_TEST_EMAIL") ?? "";
  const password = Deno.env.get("A11Y_TEST_PASSWORD") ?? "";
  return new Response(JSON.stringify({ email, password }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
