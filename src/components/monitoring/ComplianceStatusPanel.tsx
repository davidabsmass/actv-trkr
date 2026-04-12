import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Lock, Unlock, Clock, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ConsentStatusIndicator() {
  const { orgId } = useOrg();

  const { data: config } = useQuery({
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

  const mode = config?.consent_mode || null;
  const requireConsent = config?.require_consent_before_tracking ?? null;

  let status: "enabled" | "required" | "not_configured";
  let Icon: any;
  let color: string;
  let label: string;
  let bg: string;

  if (!config) {
    status = "not_configured";
    Icon = ShieldOff;
    color = "text-muted-foreground";
    label = "Consent Not Configured";
    bg = "bg-muted/50";
  } else if (requireConsent) {
    status = "enabled";
    Icon = ShieldCheck;
    color = "text-success";
    label = `Consent Enabled (${mode})`;
    bg = "bg-success/10";
  } else {
    status = "required";
    Icon = ShieldAlert;
    color = "text-warning";
    label = "Consent Relaxed";
    bg = "bg-warning/10";
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" /> Consent Status
        </div>
        <Badge variant="outline" className={`${color} ${bg} border-0`}>
          <Icon className="h-3 w-3 mr-1" />
          {label}
        </Badge>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {requireConsent ? <Lock className="h-3 w-3 text-success" /> : <Unlock className="h-3 w-3 text-warning" />}
          <span>Pre-tracking consent: {requireConsent ? "Required" : config ? "Not required" : "N/A"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span>Retention: {config?.retention_months ? `${config.retention_months} months (enforced)` : "Plan-tier default"}</span>
        </div>
      </div>
    </div>
  );
}

export function DataIntegrityNotice({ siteId }: { siteId: string }) {
  const { data: interruptions } = useQuery({
    queryKey: ["active_interruptions", siteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tracking_interruptions")
        .select("id, started_at, ended_at")
        .eq("site_id", siteId)
        .is("ended_at", null)
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
    refetchInterval: 60000,
  });

  if (!interruptions || interruptions.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/20 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
      <div>
        <p className="font-medium text-foreground">Data Integrity Notice</p>
        <p className="text-muted-foreground text-xs mt-1">
          Some analytics may be incomplete due to {interruptions.length} active tracking interruption{interruptions.length > 1 ? "s" : ""}. Reports for affected periods may show gaps.
        </p>
      </div>
    </div>
  );
}
