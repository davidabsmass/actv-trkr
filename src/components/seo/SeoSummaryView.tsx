import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Search, Smartphone, Globe, FileText } from "lucide-react";
import type { SeoIssue } from "@/lib/seo-scoring";

type StatusLevel = "healthy" | "needs_review" | "issue_detected" | "good" | "warning" | "blocked" | "unknown";

interface StatusBadgeProps {
  level: StatusLevel;
  label: string;
}

function StatusBadge({ level, label }: StatusBadgeProps) {
  const styles: Record<StatusLevel, string> = {
    healthy: "bg-success/10 text-success border-success/20",
    good: "bg-success/10 text-success border-success/20",
    needs_review: "bg-warning/10 text-warning border-warning/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    issue_detected: "bg-destructive/10 text-destructive border-destructive/20",
    blocked: "bg-destructive/10 text-destructive border-destructive/20",
    unknown: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[level]}`}>
      {label}
    </span>
  );
}

function deriveStatus(value: boolean | null | undefined, goodLabel = "Healthy", badLabel = "Issue Detected"): { level: StatusLevel; label: string } {
  if (value === null || value === undefined) return { level: "unknown", label: "No Data" };
  return value ? { level: "healthy", label: goodLabel } : { level: "issue_detected", label: badLabel };
}

export default function SeoSummaryView() {
  const { orgId } = useOrg();

  // Get latest scan for this org
  const { data: latestScan, isLoading } = useQuery({
    queryKey: ["seo_summary_scan", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("seo_scans")
        .select("id, score, issues_json, signals_json, scanned_at, url")
        .eq("org_id", orgId)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-3" />
            <div className="h-6 bg-muted rounded w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  // Derive statuses from scan data
  const issues = (latestScan?.issues_json as unknown as SeoIssue[] | null) || [];
  const signals = (latestScan?.signals_json as Record<string, unknown> | null) || {};
  const score = latestScan?.score ?? null;

  // 1. Search Visibility Status
  const searchVisibility = (() => {
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run an initial scan to check search visibility." };
    if (score >= 80) return { level: "healthy" as StatusLevel, label: "Healthy", description: "No major visibility issues detected." };
    if (score >= 50) return { level: "needs_review" as StatusLevel, label: "Needs Review", description: "Some search visibility items may need attention." };
    return { level: "issue_detected" as StatusLevel, label: "Issue Detected", description: "Search visibility issues were found that may affect discoverability." };
  })();

  // 2. Indexing Status
  const indexing = (() => {
    const robotsBlocked = issues.some(i => i.id?.includes("robots") || i.title?.toLowerCase().includes("noindex"));
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run a scan to check indexing status." };
    if (robotsBlocked) return { level: "blocked" as StatusLevel, label: "Blocked", description: "Search engines may be blocked from accessing the site." };
    return { level: "good" as StatusLevel, label: "Accessible", description: "Search engines appear able to access the site." };
  })();

  // 3. Mobile Readiness
  const mobile = (() => {
    const mobileIssue = issues.some(i =>
      i.id?.includes("viewport") || i.id?.includes("mobile") || i.title?.toLowerCase().includes("viewport") || i.title?.toLowerCase().includes("mobile")
    );
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run a scan to check mobile readiness." };
    if (mobileIssue) return { level: "needs_review" as StatusLevel, label: "Needs Review", description: "Some mobile experience issues may need review." };
    return { level: "good" as StatusLevel, label: "Good", description: "No mobile readiness issues detected." };
  })();

  // 4. Homepage Search Basics
  const homepageBasics = (() => {
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run a scan to check homepage basics." };
    const hasTitle = !issues.some(i => i.id?.includes("title") && i.impact === "Critical");
    const hasMeta = !issues.some(i => i.id?.includes("meta_desc") && i.impact === "Critical");
    const hasH1 = !issues.some(i => i.id?.includes("h1") && (i.impact === "Critical" || i.impact === "High"));
    const hasCanonical = !issues.some(i => i.id?.includes("canonical"));
    const allGood = hasTitle && hasMeta && hasH1 && hasCanonical;
    if (allGood) return { level: "healthy" as StatusLevel, label: "Present", description: "Homepage search basics are present." };
    return { level: "needs_review" as StatusLevel, label: "Needs Review", description: "Some homepage search essentials may be missing or incomplete." };
  })();

  const items = [
    { icon: Search, title: "Search Visibility Status", ...searchVisibility },
    { icon: Globe, title: "Indexing Status", ...indexing },
    { icon: Smartphone, title: "Mobile Readiness", ...mobile },
    { icon: FileText, title: "Homepage Search Basics", ...homepageBasics },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.title} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <item.icon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
            </div>
            <StatusBadge level={item.level} label={item.label} />
            <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
          </div>
        ))}
      </div>

      {!latestScan && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No scan data available yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Your team will run an initial scan to populate these statuses.</p>
        </div>
      )}
    </div>
  );
}
