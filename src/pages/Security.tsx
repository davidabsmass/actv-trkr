import { ShieldAlert, Lock, FileWarning, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function Security() {
  const { orgName, orgId } = useOrg();

  // Future: these will come from real WP plugin data via edge functions
  // For now, show the UI with empty/placeholder states

  const { data: sites } = useQuery({
    queryKey: ["sites_for_security", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, domain").eq("org_id", orgId);
      return data || [];
    },
    enabled: !!orgId,
  });

  const hasSites = (sites?.length ?? 0) > 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
        <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1.5 py-0 h-4 text-primary border-primary/30">
          Beta
        </Badge>
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
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Login / Brute Force Alerts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-primary" />
                Login Attempt Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Monitor failed login attempts and brute force activity on your WordPress admin.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
                <Lock className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground mb-1">No login alerts</p>
                <p className="text-xs text-muted-foreground">
                  Login monitoring will report failed attempts, lockouts, and suspicious patterns once your plugin is updated to v1.4+.
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Alerts trigger after 5+ failed login attempts within 10 minutes</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Successful logins from new IPs are flagged for review</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Notifications are sent via email and in-app alerts</span>
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
                Detect unexpected file modifications in your WordPress core, theme, and plugin files.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
                <FileWarning className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground mb-1">No file changes detected</p>
                <p className="text-xs text-muted-foreground">
                  File integrity monitoring will track changes to core WordPress files, themes, and plugins once your plugin is updated to v1.4+.
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Scans core files, active theme, and plugin directories daily</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Ignores expected changes from updates you initiate</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Alerts on new, modified, or deleted files outside normal update cycles</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
