import { ShieldAlert, Lock, FileWarning, Info, AlertTriangle, CheckCircle, XCircle, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const severityStyles: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  info: "bg-primary/10 text-primary border-primary/20",
};

const severityIcons: Record<string, typeof AlertTriangle> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Eye,
};

export default function Security() {
  const { orgName, orgId } = useOrg();

  const { data: sites } = useQuery({
    queryKey: ["sites_for_security", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, domain").eq("org_id", orgId);
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["security_events", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("security_events")
        .select("*")
        .eq("org_id", orgId)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    refetchInterval: 30000,
  });

  const hasSites = (sites?.length ?? 0) > 0;

  const loginEvents = events?.filter(e =>
    ["failed_login", "brute_force", "new_ip_login"].includes(e.event_type)
  ) ?? [];

  const fileEvents = events?.filter(e =>
    ["file_changed", "file_added", "file_deleted"].includes(e.event_type)
  ) ?? [];

  const criticalCount = events?.filter(e => e.severity === "critical").length ?? 0;
  const warningCount = events?.filter(e => e.severity === "warning").length ?? 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        WordPress security monitoring for {orgName}
      </p>

      {!hasSites ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Connect a site in Settings to enable security monitoring.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{events?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className={`text-2xl font-bold ${criticalCount > 0 ? "text-destructive" : "text-foreground"}`}>{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className={`text-2xl font-bold ${warningCount > 0 ? "text-warning" : "text-foreground"}`}>{warningCount}</p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Login Alerts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4 text-primary" />
                  Login Attempt Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">
                  Failed login attempts, brute force activity, and new IP logins.
                </p>

                {isLoading ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
                ) : loginEvents.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
                    <CheckCircle className="h-6 w-6 text-success mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground mb-1">No login alerts</p>
                    <p className="text-xs text-muted-foreground">
                      No suspicious login activity detected. The plugin monitors failed attempts automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {loginEvents.slice(0, 20).map(evt => {
                      const Icon = severityIcons[evt.severity] || Eye;
                      const details = (evt.details || {}) as Record<string, any>;
                      return (
                        <div key={evt.id} className={`rounded-md border p-3 ${severityStyles[evt.severity] || severityStyles.info}`}>
                          <div className="flex items-start gap-2">
                            <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{evt.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-[11px] opacity-80">
                                <span>{format(new Date(evt.occurred_at), "MMM d, h:mm a")}</span>
                                {details.ip && <span>IP: {details.ip}</span>}
                                {details.username && <span>User: {details.username}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Alerts trigger after 5+ failed login attempts within 10 minutes</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Successful logins from new IPs are flagged for review</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File Change Detection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileWarning className="h-4 w-4 text-primary" />
                  File Change Detection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">
                  Unexpected file modifications in WordPress core, theme, and plugin files.
                </p>

                {isLoading ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
                ) : fileEvents.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
                    <CheckCircle className="h-6 w-6 text-success mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground mb-1">No file changes detected</p>
                    <p className="text-xs text-muted-foreground">
                      File integrity scans run daily. No unexpected modifications found.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {fileEvents.slice(0, 20).map(evt => {
                      const Icon = severityIcons[evt.severity] || Eye;
                      const details = (evt.details || {}) as Record<string, any>;
                      return (
                        <div key={evt.id} className={`rounded-md border p-3 ${severityStyles[evt.severity] || severityStyles.info}`}>
                          <div className="flex items-start gap-2">
                            <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{evt.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-[11px] opacity-80">
                                <span>{format(new Date(evt.occurred_at), "MMM d, h:mm a")}</span>
                                {details.path && <span className="font-mono truncate">{details.path}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Scans core files, active theme, and plugin directories daily</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Alerts on new, modified, or deleted files outside normal update cycles</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
