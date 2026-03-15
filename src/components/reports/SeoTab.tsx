import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Search, RefreshCw, Shield, AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getScoreGrade, getScoreStatus } from "@/lib/seo-scoring";
import type { SeoIssue } from "@/lib/seo-scoring";

const impactColors: Record<string, string> = {
  Critical: "bg-destructive/10 text-destructive border-destructive/20",
  High: "bg-warning/10 text-warning border-warning/20",
  Medium: "bg-primary/10 text-primary border-primary/20",
  Low: "bg-muted text-muted-foreground border-border",
};

const impactIcons: Record<string, React.ReactNode> = {
  Critical: <AlertCircle className="h-4 w-4 text-destructive" />,
  High: <AlertTriangle className="h-4 w-4 text-warning" />,
  Medium: <Info className="h-4 w-4 text-primary" />,
  Low: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />,
};

export default function SeoTab() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Get sites for this org
  const { data: sites } = useQuery({
    queryKey: ["sites_for_seo", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, domain").eq("org_id", orgId);
      return data || [];
    },
    enabled: !!orgId,
  });

  // Get latest scan
  const { data: latestScan, isLoading: scanLoading } = useQuery({
    queryKey: ["seo_scan", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("seo_scans")
        .select("*")
        .eq("org_id", orgId)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  const runScan = useMutation({
    mutationFn: async () => {
      if (!sites?.length || !orgId) throw new Error("No sites configured");
      const site = sites[0];
      const url = `https://${site.domain}`;
      const { data, error } = await supabase.functions.invoke("scan-site-seo", {
        body: { url, site_id: site.id, org_id: orgId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo_scan", orgId] });
      toast.success("SEO scan completed");
    },
    onError: (err: any) => toast.error(err.message || "Scan failed"),
  });

  const issues = (latestScan?.issues_json as unknown as SeoIssue[] | null) || [];
  const score = latestScan?.score || 0;
  const grade = getScoreGrade(score);
  const status = getScoreStatus(score);

  const statusColors = {
    excellent: "text-success",
    good: "text-primary",
    "needs-work": "text-warning",
    poor: "text-destructive",
  };

  const groupedIssues = {
    Critical: issues.filter(i => i.impact === "Critical"),
    High: issues.filter(i => i.impact === "High"),
    Medium: issues.filter(i => i.impact === "Medium"),
    Low: issues.filter(i => i.impact === "Low"),
  };

  return (
    <div className="space-y-6">
      {/* Scan controls */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">SEO Scanner</h3>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-primary border-primary/30">Beta</Badge>
          </div>
          <Button
            size="sm"
            onClick={() => runScan.mutate()}
            disabled={runScan.isPending || !sites?.length}
            className="gap-1.5"
          >
            {runScan.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {runScan.isPending ? "Scanning…" : "Scan Now"}
          </Button>
        </div>
        {sites && sites.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Scanning: {sites[0].domain}
            {latestScan && ` · Last scan: ${new Date(latestScan.scanned_at).toLocaleDateString()}`}
          </p>
        )}
        {(!sites || sites.length === 0) && (
          <p className="text-xs text-muted-foreground mt-2">Add a site in Settings to enable SEO scanning.</p>
        )}
      </div>

      {/* Score card */}
      {latestScan && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <div className={`text-5xl font-bold ${statusColors[status]}`}>{score}</div>
              <div className="text-xs text-muted-foreground mt-1">SEO Score</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-lg font-bold ${statusColors[status]}`}>Grade: {grade}</span>
                {latestScan.platform && (
                  <Badge variant="outline" className="text-[10px] uppercase">{latestScan.platform}</Badge>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {(["Critical", "High", "Medium", "Low"] as const).map((impact) => (
                  <div key={impact} className="text-center">
                    <div className="text-lg font-bold text-foreground">{groupedIssues[impact].length}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">{impact}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issues */}
      {latestScan && issues.length > 0 && (
        <div className="space-y-3">
          {(["Critical", "High", "Medium", "Low"] as const).map((impact) => {
            const group = groupedIssues[impact];
            if (group.length === 0) return null;
            return (
              <div key={impact}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  {impactIcons[impact]} {impact} ({group.length})
                </h4>
                <div className="space-y-2">
                  {group.map((issue) => (
                    <div
                      key={issue.id}
                      className={`rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/30 ${impactColors[impact]}`}
                      onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-medium text-foreground">{issue.title}</h5>
                          {issue.category && (
                            <Badge variant="outline" className="text-[9px] uppercase">{issue.category}</Badge>
                          )}
                        </div>
                        <Shield className={`h-3.5 w-3.5 transition-transform ${expanded === issue.id ? "rotate-180" : ""}`} />
                      </div>
                      {expanded === issue.id && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{issue.fix}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!latestScan && !scanLoading && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">SEO insights will appear once you run your first scan.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Scan Now" above to get started.</p>
        </div>
      )}
    </div>
  );
}
