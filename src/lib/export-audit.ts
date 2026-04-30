import { supabase } from "@/integrations/supabase/client";

/**
 * Log a single export action to `export_audit_log`.
 *
 * Best-effort — never blocks or fails the export. RLS allows any authenticated
 * org member to insert their own row; only org admins can read the table back.
 */
export async function logExportAudit(args: {
  orgId: string;
  userId: string;
  roleAtExport: string; // 'admin' | 'manager' | 'actv_support' | 'platform_admin' | 'unknown'
  exportType: string;
  exportScope?: string | null;
  siteId?: string | null;
  exportJobId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from("export_audit_log").insert({
      org_id: args.orgId,
      user_id: args.userId,
      role_at_export: args.roleAtExport,
      export_type: args.exportType,
      export_scope: args.exportScope ?? null,
      site_id: args.siteId ?? null,
      export_job_id: args.exportJobId ?? null,
      metadata: (args.metadata ?? {}) as never,
    } as never);
  } catch (err) {
    // Never throw from audit. Just log.
    // eslint-disable-next-line no-console
    console.warn("[export-audit] insert failed", err);
  }
}

export function resolveExportRole(opts: {
  orgRole: string | null;
  isPlatformAdmin: boolean;
}): string {
  if (opts.orgRole) return opts.orgRole;
  if (opts.isPlatformAdmin) return "platform_admin";
  return "unknown";
}
