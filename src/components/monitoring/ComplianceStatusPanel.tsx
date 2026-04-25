import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useComplianceStatus, type ComplianceState } from "@/hooks/use-compliance-status";
import { Link } from "react-router-dom";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  Lock, Unlock, Clock, AlertTriangle, ExternalLink,
  CheckCircle2, XCircle, Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

/* ── Consent Status Card (used in Monitoring overview grid) ── */

export function ConsentStatusIndicator() {
  const { status } = useComplianceStatus();

  const mode = status.consentMode;
  const requireConsent = status.requireConsent;

  let Icon: any;
  let color: string;
  let label: string;
  let bg: string;

  if (!mode) {
    Icon = ShieldOff;
    color = "text-muted-foreground";
    label = "Consent Not Configured";
    bg = "bg-muted/50";
  } else if (mode === "strict" && requireConsent) {
    Icon = ShieldCheck;
    color = "text-success";
    label = "Strict Mode Active";
    bg = "bg-success/10";
  } else {
    Icon = ShieldAlert;
    color = "text-warning";
    label = mode === "relaxed" ? "Relaxed Mode" : "Consent Relaxed";
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
          <span>Pre-tracking consent: {requireConsent ? "Required" : mode ? "Not required" : "N/A"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span>Retention: {status.retentionMonths ? `${status.retentionMonths} months (enforced)` : "Plan-tier default"}</span>
        </div>
        {status.lastTrackingActivity && (
          <div className="flex items-center gap-2">
            <Info className="h-3 w-3" />
            <span>Last activity: {new Date(status.lastTrackingActivity).toLocaleDateString()}</span>
          </div>
        )}
      </div>
      <Link to="/compliance-setup" className="flex items-center gap-1 text-xs text-primary hover:underline mt-3">
        Learn how to fix <ExternalLink className="h-3 w-3" />
      </Link>
      <Link
        to="/compliance-setup#banner-wording"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline mt-1"
      >
        Customize banner wording <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

/* ── Compliance Warnings Banner (shown above monitoring overview) ── */

export function ComplianceWarnings() {
  const { status, isLoading } = useComplianceStatus();

  if (isLoading) return null;

  const warnings: { icon: React.ReactNode; message: string; severity: "warning" | "success" | "info" }[] = [];

  if (status.overallStatus === "misconfigured") {
    warnings.push({
      icon: <ShieldOff className="h-4 w-4 text-destructive" />,
      message: "No consent configuration detected — tracking may not be GDPR compliant.",
      severity: "warning",
    });
  }

  if (status.consentMode === "relaxed") {
    warnings.push({
      icon: <ShieldAlert className="h-4 w-4 text-warning" />,
      message: "Relaxed Mode active — tracking starts before consent, which may not be GDPR-compliant in some regions.",
      severity: "warning",
    });
  }

  if (status.consentMode === "strict" && status.requireConsent) {
    warnings.push({
      icon: <ShieldCheck className="h-4 w-4 text-success" />,
      message: "Strict Mode active — tracking respects user consent before collecting data.",
      severity: "success",
    });
  }

  if (status.consentMode && !status.cmpDetected && status.consentMode !== "strict") {
    warnings.push({
      icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      message: "No consent management platform (CMP) integration detected. Install Complianz or a compatible CMP.",
      severity: "warning",
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
            w.severity === "success"
              ? "bg-success/10 border border-success/20"
              : w.severity === "warning"
              ? "bg-warning/10 border border-warning/20"
              : "bg-muted/50 border border-border"
          }`}
        >
          <span className="mt-0.5 shrink-0">{w.icon}</span>
          <div className="flex-1">
            <span className="text-foreground text-sm">{w.message}</span>
            {(w.severity === "warning" || w.severity === "success") && (
              <Link to="/compliance-setup" className="ml-2 text-xs text-primary hover:underline">
                {w.severity === "success" ? "Update setting →" : "View setup guide →"}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Data Integrity Notice (existing) ── */

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
