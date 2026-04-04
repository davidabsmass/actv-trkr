/**
 * CORS configuration for edge functions.
 *
 * APP_ORIGINS – locked to our known front-end origins.
 * Use `appCorsHeaders(req)` for functions called from the React app.
 * Use `wildcardCorsHeaders` for functions called from WordPress plugin sites.
 */

const APP_ORIGINS: string[] = [
  "https://actvtrkr.com",
  "https://www.actvtrkr.com",
  "https://mshnctrl.lovable.app",
  "https://id-preview--0015e01c-8e1e-425b-884e-18051bf17654.lovable.app",
  "https://0015e01c-8e1e-425b-884e-18051bf17654.lovableproject.com",
];

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * Returns CORS headers scoped to APP_ORIGINS.
 * If the request origin is not in the allow-list the header is omitted,
 * which causes the browser to block the response.
 */
export function appCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };

  if (APP_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

/** Wildcard CORS for WordPress-plugin-facing endpoints. */
export const wildcardCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
};
