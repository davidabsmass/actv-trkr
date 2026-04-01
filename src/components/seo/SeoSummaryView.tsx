import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Search, Smartphone, Globe, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SeoIssue } from "@/lib/seo-scoring";

type StatusLevel = "healthy" | "needs_review" | "issue_detected" | "good" | "warning" | "blocked" | "unknown";

/** Map issue IDs / keywords to plain-language fix instructions */
function actionForIssue(issue: SeoIssue): string | null {
  const id = (issue.id || "").toLowerCase();
  const title = (issue.title || "").toLowerCase();

  if (id.includes("title_missing") || title.includes("missing title"))
    return "Add a unique <title> tag to the page. In WordPress, edit the page and set the SEO title in Yoast or RankMath.";
  if (id.includes("title_short") || title.includes("title too short"))
    return "Expand the page title to 30–60 characters so it displays fully in search results.";
  if (id.includes("title_long") || title.includes("title too long"))
    return "Shorten the page title to under 60 characters to avoid truncation in search results.";
  if (id.includes("meta_desc_missing") || title.includes("missing meta"))
    return "Add a meta description (120–155 characters) summarizing the page. In WordPress, set it in your SEO plugin settings.";
  if (id.includes("meta_desc_short") || title.includes("description too short"))
    return "Expand the meta description to at least 120 characters to improve click-through from search results.";
  if (id.includes("meta_desc_long") || title.includes("description too long"))
    return "Shorten the meta description to under 155 characters so it isn't truncated in search results.";
  if (id.includes("h1_missing") || title.includes("missing h1"))
    return "Add a single H1 heading to the page. This is usually the main page title or headline.";
  if (id.includes("h1_multiple") || title.includes("multiple h1"))
    return "Use only one H1 tag per page. Convert extra H1 tags to H2 or H3 headings.";
  if (id.includes("canonical") || title.includes("canonical"))
    return "Set a canonical URL to tell search engines which version of the page is the primary one. Most SEO plugins add this automatically.";
  if (id.includes("robots") || title.includes("noindex"))
    return "Remove the 'noindex' directive so search engines can index the page. Check your SEO plugin's visibility settings and your robots.txt file.";
  if (id.includes("viewport") || title.includes("viewport"))
    return "Ensure the page includes a <meta name=\"viewport\"> tag for proper mobile rendering. Most modern themes include this by default.";
  if (id.includes("mobile") || title.includes("mobile"))
    return "Check that the site uses a responsive theme and fonts/buttons are sized for mobile screens.";
  if (id.includes("og_image") || title.includes("og image") || title.includes("social image"))
    return "Add an Open Graph image (og:image) so the page shows a preview image when shared on social media.";
  if (id.includes("ssl") || title.includes("https") || title.includes("ssl"))
    return "Ensure the site loads over HTTPS. Install an SSL certificate and redirect HTTP traffic to HTTPS.";
  if (id.includes("alt") || title.includes("alt text"))
    return "Add descriptive alt text to images so search engines and screen readers can understand them.";

  // Generic fallback
  return null;
}

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

export default function SeoSummaryView() {
  const { orgId, orgName } = useOrg();
  const queryClient = useQueryClient();

  // Get sites for this org
  const { data: sites } = useQuery({
    queryKey: ["sites_for_seo_summary", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, domain").eq("org_id", orgId);
      return data || [];
    },
    enabled: !!orgId,
  });

  const siteDomain = sites?.[0]?.domain || "";
  const effectiveDomain = siteDomain || (orgName && orgName !== "My Organization" && orgName.includes(".") ? orgName : "");
  const homepageUrl = effectiveDomain ? `https://${effectiveDomain}` : "";

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

  const runScan = useMutation({
    mutationFn: async () => {
      if (!effectiveDomain || !orgId) throw new Error("No domain configured");
      const urlToScan = homepageUrl.trim().replace(/\/+$/, "");
      const siteId = sites?.[0]?.id || null;
      const { data, error } = await supabase.functions.invoke("scan-site-seo", {
        body: { url: urlToScan, site_id: siteId, org_id: orgId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo_summary_scan", orgId] });
      toast.success("SEO scan completed");
    },
    onError: (err: any) => toast.error(err.message || "Scan failed"),
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
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run an initial scan to check search visibility.", reasons: [] as string[] };
    if (score >= 80) return { level: "healthy" as StatusLevel, label: "Healthy", description: "No major visibility issues detected.", reasons: [] as string[] };
    const reasons = issues.filter(i => i.impact === "Critical" || i.impact === "High").map(i => i.title || i.id || "");
    if (score >= 50) return { level: "needs_review" as StatusLevel, label: "Needs Review", description: "Some search visibility items may need attention.", reasons };
    return { level: "issue_detected" as StatusLevel, label: "Issue Detected", description: "Search visibility issues were found that may affect discoverability.", reasons };
  })();

  // 2. Indexing Status
  const indexing = (() => {
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run a scan to check indexing status.", reasons: [] as string[] };
    const robotsIssues = issues.filter(i => i.id?.includes("robots") || i.title?.toLowerCase().includes("noindex"));
    if (robotsIssues.length > 0) return { level: "blocked" as StatusLevel, label: "Blocked", description: "Search engines may be blocked from accessing the site.", reasons: robotsIssues.map(i => i.title || i.id || "") };
    return { level: "good" as StatusLevel, label: "Accessible", description: "Search engines appear able to access the site.", reasons: [] as string[] };
  })();

  // 3. Mobile Readiness
  const mobile = (() => {
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run a scan to check mobile readiness.", reasons: [] as string[] };
    const mobileIssues = issues.filter(i =>
      i.id?.includes("viewport") || i.id?.includes("mobile") || i.title?.toLowerCase().includes("viewport") || i.title?.toLowerCase().includes("mobile")
    );
    if (mobileIssues.length > 0) return { level: "needs_review" as StatusLevel, label: "Needs Review", description: "Some mobile experience issues may need review.", reasons: mobileIssues.map(i => i.title || i.id || "") };
    return { level: "good" as StatusLevel, label: "Good", description: "No mobile readiness issues detected.", reasons: [] as string[] };
  })();

  // 4. Homepage Search Basics
  const homepageBasics = (() => {
    if (score === null) return { level: "unknown" as StatusLevel, label: "No Data", description: "Run a scan to check homepage basics.", reasons: [] as string[] };
    const basicIssues = issues.filter(i =>
      i.id?.includes("title") || i.id?.includes("meta_desc") || i.id?.includes("h1") || i.id?.includes("canonical")
    );
    if (basicIssues.length === 0) return { level: "healthy" as StatusLevel, label: "Present", description: "Homepage search basics are present.", reasons: [] as string[] };
    return { level: "needs_review" as StatusLevel, label: "Needs Review", description: "Some homepage search essentials may be missing or incomplete.", reasons: basicIssues.map(i => i.title || i.id || "") };
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
            {item.issueObjects && item.issueObjects.length > 0 && (
              <ul className="mt-2 space-y-2">
                {item.issueObjects.slice(0, 4).map((issue, idx) => {
                  const action = actionForIssue(issue);
                  return (
                    <li key={idx} className="text-xs">
                      <div className="flex items-start gap-1.5">
                        <span className="text-warning mt-0.5">•</span>
                        <span className="text-foreground font-medium">{issue.title || issue.id || "Issue"}</span>
                      </div>
                      {action && (
                        <p className="text-muted-foreground ml-4 mt-0.5 leading-relaxed">
                          <span className="font-medium text-primary/80">Fix:</span> {action}
                        </p>
                      )}
                    </li>
                  );
                })}
                {item.issueObjects.length > 4 && (
                  <li className="text-xs text-muted-foreground/70 pl-3">
                    +{item.issueObjects.length - 4} more
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Scan button */}
      {effectiveDomain && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Scanning: <span className="font-medium text-foreground">{homepageUrl}</span>
            </p>
            <Button
              size="sm"
              onClick={() => runScan.mutate()}
              disabled={runScan.isPending}
              className="gap-1.5 shrink-0"
            >
              {runScan.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {runScan.isPending ? "Scanning…" : latestScan ? "New Scan" : "Run First Scan"}
            </Button>
          </div>
        </div>
      )}

      {!latestScan && !effectiveDomain && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No scan data available yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Connect your site to enable scanning.</p>
        </div>
      )}
    </div>
  );
}
