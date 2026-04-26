import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import {
  Archive, Download, CalendarIcon, FileText, Users,
  Activity, Clock, CheckCircle, AlertCircle, Info, ChevronDown,
  ChevronRight, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";

const ARCHIVE_CATEGORIES: Record<string, { label: string; description: string; icon: typeof Activity }> = {
  pageviews: { label: "Activity Archive", description: "Pageview and session activity records", icon: Activity },
  sessions: { label: "Session Archive", description: "Visitor session records with attribution", icon: Users },
  form_submissions: { label: "Lead Archive", description: "Form submission and lead records", icon: FileText },
  events: { label: "Event Archive", description: "Click, download, and interaction events", icon: Layers },
  lead_events: { label: "Lead Events Archive", description: "Raw lead event payloads", icon: FileText },
  form_events: { label: "Form Events Archive", description: "Form render, error, and health events", icon: Activity },
};

interface ManifestRow {
  id: string;
  table_name: string;
  start_date: string;
  end_date: string;
  row_count: number;
  size_bytes: number;
  object_path: string;
  archived_at: string;
}

interface MonthGroup {
  month: string;
  label: string;
  categories: Record<string, { rows: ManifestRow[]; totalRecords: number; totalSize: number }>;
}

export default function ArchivesContent() {
  const { orgId, orgName } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const { data: manifests, isLoading } = useQuery({
    queryKey: ["archive_manifest", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("archive_manifest")
        .select("*")
        .eq("org_id", orgId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as ManifestRow[];
    },
    enabled: !!orgId,
  });

  const { data: archiveJobs } = useQuery({
    queryKey: ["archive_export_jobs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("export_jobs")
        .select("*")
        .eq("org_id", orgId)
        .eq("request_type", "archive_export")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      return data?.some((j) => j.status === "queued" || j.status === "running") ? 3000 : false;
    },
  });

  const monthGroups: MonthGroup[] = (() => {
    if (!manifests || manifests.length === 0) return [];
    const groups: Record<string, MonthGroup> = {};
    for (const m of manifests) {
      const monthKey = m.start_date.substring(0, 7);
      if (!groups[monthKey]) {
        const d = parseISO(m.start_date + "T00:00:00");
        groups[monthKey] = { month: monthKey, label: format(d, "MMMM yyyy"), categories: {} };
      }
      const cat = m.table_name;
      if (!groups[monthKey].categories[cat]) {
        groups[monthKey].categories[cat] = { rows: [], totalRecords: 0, totalSize: 0 };
      }
      groups[monthKey].categories[cat].rows.push(m);
      groups[monthKey].categories[cat].totalRecords += m.row_count;
      groups[monthKey].categories[cat].totalSize += m.size_bytes;
    }
    return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
  })();

  const exportArchive = useMutation({
    mutationFn: async ({ month, tableName }: { month: string; tableName: string }) => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const monthDate = parseISO(month + "-01T00:00:00");
      const start = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const end = format(endOfMonth(monthDate), "yyyy-MM-dd");
      const { data: inserted, error } = await supabase.from("export_jobs").insert({
        org_id: orgId, created_by: session.user.id, format: "csv", status: "queued",
        request_type: "archive_export", table_name: tableName, start_date: start, end_date: end,
      }).select("id").single();
      if (error) throw error;
      const { error: fnError } = await supabase.functions.invoke("process-archive-export", { body: { job_id: inserted.id } });
      if (fnError) throw new Error("Archive export failed");
      const { data: job } = await supabase.from("export_jobs").select("file_path, status, row_count").eq("id", inserted.id).single();
      return job;
    },
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["archive_export_jobs"] });
      if (job?.file_path) {
        toast.success(`Archive export ready — ${job.row_count ?? 0} records. Downloading…`);
        handleDownload(job.file_path);
      } else {
        toast.info("No archived data found for the selected period.");
      }
    },
    onError: (err: any) => toast.error(err.message || "Failed to export archive"),
  });

  const handleDownload = async (filePath: string) => {
    const { data, error } = await supabase.storage.from("exports").createSignedUrl(filePath, 60);
    if (error) { toast.error("Failed to generate download link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const toggleMonth = (month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div>
      {/* Retention messaging */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">How data retention works</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• <strong>12 months</strong> of reporting history — powers charts, reports, and summaries</li>
              <li>• <strong>60 days</strong> of recent detailed activity — available in the dashboard for drilldowns</li>
              <li>• <strong>Older detailed records</strong> are archived here and can be exported at any time</li>
            </ul>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Your data is never deleted. Older granular records are moved to the archive to keep the dashboard fast.
            </p>
          </div>
        </div>
      </div>

      {/* Archive list */}
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground text-sm">Loading archives…</div>
      ) : monthGroups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Archive className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No archived data yet</p>
          <p className="text-xs text-muted-foreground">
            Records older than 60 days are automatically archived each night. Check back once your account has been active for more than 60 days.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {monthGroups.map((group) => {
            const isExpanded = expandedMonths.has(group.month);
            const totalRecords = Object.values(group.categories).reduce((s, c) => s + c.totalRecords, 0);
            const totalSize = Object.values(group.categories).reduce((s, c) => s + c.totalSize, 0);
            const categoryCount = Object.keys(group.categories).length;
            return (
              <Collapsible key={group.month} open={isExpanded} onOpenChange={() => toggleMonth(group.month)}>
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <CalendarIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{group.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {totalRecords.toLocaleString()} records · {categoryCount} {categoryCount === 1 ? "category" : "categories"} · {formatBytes(totalSize)}
                          </p>
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border divide-y divide-border">
                      {Object.entries(group.categories).map(([catKey, catData]) => {
                        const catConfig = ARCHIVE_CATEGORIES[catKey] || { label: catKey, description: "", icon: FileText };
                        const CatIcon = catConfig.icon;
                        return (
                          <div key={catKey} className="flex items-center justify-between px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <CatIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-foreground">{group.label} — {catConfig.label}</p>
                                <p className="text-xs text-muted-foreground">{catData.totalRecords.toLocaleString()} records · {formatBytes(catData.totalSize)}</p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => exportArchive.mutate({ month: group.month, tableName: catKey })} disabled={exportArchive.isPending} className="flex items-center gap-1.5">
                              <Download className="h-3.5 w-3.5" /> Export CSV
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Recent archive export jobs */}
      {archiveJobs && archiveJobs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">Recent Archive Exports</h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
            {archiveJobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {job.status === "queued" || job.status === "running" ? (
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : job.status === "complete" || job.status === "succeeded" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {ARCHIVE_CATEGORIES[job.table_name]?.label || job.table_name || "Archive"} Export
                      {job.row_count != null && <span className="text-muted-foreground font-normal"> · {job.row_count} rows</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(job.created_at), "MMM d, yyyy 'at' HH:mm")}
                      {job.start_date && job.end_date && <> · {job.start_date} to {job.end_date}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs uppercase ${job.status === "complete" || job.status === "succeeded" ? "text-success border-success/20" : job.status === "failed" ? "text-destructive border-destructive/20" : "text-muted-foreground"}`}>
                    {job.status}
                  </Badge>
                  {(job.status === "complete" || job.status === "succeeded") && job.file_path && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Download archive" onClick={() => handleDownload(job.file_path!)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
