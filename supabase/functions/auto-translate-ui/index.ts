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

async function translateBatch(texts: string[], target: string) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: target,
    dt: "t",
  });
  texts.forEach((text) => params.append("q", text));

  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
    method: "GET",
    headers: { "User-Agent": "ACTVTRKR-I18N/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error("Translation upstream failed");

  const payload = await response.json();
  const results: string[] = [];
  if (Array.isArray(payload?.[0])) {
    for (const row of payload[0]) {
      if (Array.isArray(row) && typeof row[0] === "string") {
        results.push(row[0]);
      }
    }
  }
  return results;
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

    for (let i = 0; i < texts.length; i += 40) {
      const chunk = texts.slice(i, i + 40);
      const translatedChunk = await translateBatch(chunk, target);
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