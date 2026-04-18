import { supabase } from "@/integrations/supabase/client";

export type DownloadFailureStage =
  | "fetch"
  | "http_error"
  | "blob"
  | "browser_trigger"
  | "unknown";

export interface DownloadFailureContext {
  stage: DownloadFailureStage;
  error: unknown;
  httpStatus?: number | null;
  downloadUrl?: string;
  surface: "settings" | "onboarding";
  orgId?: string | null;
}

/**
 * Best-effort telemetry for plugin download failures.
 * Never throws — we don't want telemetry errors to mask the original failure.
 */
export async function reportDownloadFailure(ctx: DownloadFailureContext) {
  try {
    const errorMessage =
      ctx.error instanceof Error
        ? ctx.error.message
        : typeof ctx.error === "string"
          ? ctx.error
          : "Unknown error";

    await supabase.functions.invoke("report-download-failure", {
      body: {
        failure_stage: ctx.stage,
        error_message: errorMessage,
        http_status: ctx.httpStatus ?? null,
        download_url: ctx.downloadUrl,
        surface: ctx.surface,
        org_id: ctx.orgId ?? null,
      },
    });
  } catch (telemetryError) {
    // Swallow — original error is what matters
    console.warn("Failed to report download failure:", telemetryError);
  }
}
