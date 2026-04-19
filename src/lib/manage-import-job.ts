import { supabase } from "@/integrations/supabase/client";

type QueryValue = string | number | boolean | null | undefined;

interface ManageImportJobOptions {
  body?: unknown;
  method?: "GET" | "POST";
  query?: Record<string, QueryValue>;
}

const FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function callManageImportJob<T = any>(
  action: string,
  options: ManageImportJobOptions = {},
): Promise<T> {
  const { body, method = "POST", query } = options;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const url = new URL(`${FUNCTIONS_BASE_URL}/manage-import-job`);
  url.searchParams.set("action", action);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: PUBLISHABLE_KEY,
    },
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string"
      ? payload
      : payload?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    throw new Error(String(payload.error));
  }

  return payload as T;
}