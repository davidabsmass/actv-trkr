import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";

export type ComplianceState = "compliant" | "needs_attention" | "misconfigured";

export interface ComplianceStatus {
  consentMode: "strict" | "relaxed" | null;
  requireConsent: boolean | null;
  retentionMonths: number | null;
  consentDetected: boolean | null;
  cmpDetected: boolean | null;
  lastTrackingActivity: string | null;
  overallStatus: ComplianceState;
}

export function useComplianceStatus() {
  const { orgId } = useOrg();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["consent_config", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await (supabase as any)
        .from("consent_config")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: sites } = useQuery({
    queryKey: ["compliance_sites", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("id, last_heartbeat_at, status")
        .eq("org_id", orgId)
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Derive last tracking activity from sites
  const lastTrackingActivity = sites?.reduce<string | null>((latest, s) => {
    if (!s.last_heartbeat_at) return latest;
    if (!latest || s.last_heartbeat_at > latest) return s.last_heartbeat_at;
    return latest;
  }, null) ?? null;

  // Derive overall compliance status
  const consentMode = config?.consent_mode as "strict" | "relaxed" | null ?? null;
  const requireConsent = config?.require_consent_before_tracking ?? null;
  const retentionMonths = config?.retention_months ?? null;

  // Consent detection: if strict mode is active, consent is "managed"
  const consentDetected = consentMode === "strict" ? true : consentMode === "relaxed" ? false : null;
  
  // CMP detection: best-effort from config presence
  const cmpDetected = consentMode === "strict" && requireConsent === true ? true : null;

  let overallStatus: ComplianceState = "misconfigured";
  if (config) {
    if (consentMode === "strict" && requireConsent) {
      overallStatus = "compliant";
    } else if (consentMode === "relaxed") {
      overallStatus = "needs_attention";
    } else {
      overallStatus = "needs_attention";
    }
  }

  const status: ComplianceStatus = {
    consentMode,
    requireConsent,
    retentionMonths,
    consentDetected,
    cmpDetected,
    lastTrackingActivity,
    overallStatus,
  };

  return { status, isLoading: configLoading };
}
