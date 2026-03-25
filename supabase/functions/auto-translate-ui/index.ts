const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED = new Set(["es", "fr", "pt", "de", "it", "zh", "ja", "ko", "ar"]);

const sanitize = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 220) return null;
  return text;
};

async function translateText(text: string, target: string) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: target,
    dt: "t",
    q: text,
  });

  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
    method: "GET",
    headers: { "User-Agent": "ACTVTRKR-I18N/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error("Translation upstream failed");
  const payload = await response.json();
  return typeof payload?.[0]?.[0]?.[0] === "string" ? payload[0][0][0] : text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const target = sanitize(body?.target)?.toLowerCase() || "";
    if (!SUPPORTED.has(target)) {
      return new Response(JSON.stringify({ error: "Unsupported language" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawTexts = Array.isArray(body?.texts) ? body.texts : [];
    const texts = [...new Set(rawTexts.map(sanitize).filter(Boolean) as string[])].slice(0, 300);
    if (texts.length === 0) {
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const translations: Record<string, string> = {};

    for (let i = 0; i < texts.length; i += 10) {
      const chunk = texts.slice(i, i + 10);
      const translatedChunk = await Promise.all(chunk.map((text) => translateText(text, target).catch(() => text)));
      chunk.forEach((original, idx) => {
        translations[original] = translatedChunk[idx] || original;
      });
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("auto-translate-ui error", error);
    return new Response(JSON.stringify({ error: "Translation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});