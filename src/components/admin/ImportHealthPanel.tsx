import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DriftRow {
  id: string;
  form_name: string;
  builder_type: string;
  status: string;
  total_entries_estimated: number;
  total_entries_imported: number;
  site_id: string;
  domain: string | null;
  active_jobs: number;
  stuck: boolean;
}

export default function ImportHealthPanel() {
  const [running, setRunning] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin_import_health"],
    queryFn: async () => {
      const { data: integrations } = await (supabase as any)
        .from("form_integrations")
        .select("id, form_name, builder_type, status, total_entries_estimated, total_entries_imported, site_id, sites(domain), form_import_jobs(id, status, locked_at, heartbeat_at, next_run_at)")
        .order("created_at", { ascending: false })
        .limit(500);

      const rows: DriftRow[] = [];
      const stuckCutoff = Date.now() - 30 * 60 * 1000;
      for (const i of integrations || []) {
        const gap = (i.total_entries_estimated || 0) - (i.total_entries_imported || 0);
        const activeJobs = (i.form_import_jobs || []).filter((j: any) =>
          ["pending", "running", "stalled"].includes(j.status)
        );
        const stuck = activeJobs.some((j: any) => {
          const ts = new Date(j.heartbeat_at || j.locked_at || j.next_run_at || 0).getTime();
          return ts > 0 && ts < stuckCutoff;
        });
        if (gap > 0 || stuck || i.status === "needs_review" || i.status === "error") {
          rows.push({
            id: i.id,
            form_name: i.form_name,
            builder_type: i.builder_type,
            status: i.status,
            total_entries_estimated: i.total_entries_estimated,
            total_entries_imported: i.total_entries_imported,
            site_id: i.site_id,
            domain: i.sites?.domain || null,
            active_jobs: activeJobs.length,
            stuck,
          });
        }
      }
      return rows;
    },
    refetchInterval: 30_000,
  });

  const runQueueNow = async () => {
    setRunning(true);
    try {
      const { error } = await (supabase as any).functions.invoke("process-import-queue", {
        body: {},
      });
      if (error) throw error;
      toast.success("Queue processor triggered.");
      await refetch();
    } catch (e: any) {
      toast.error(`Trigger failed: ${e?.message || "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  };

  const runWatchdog = async () => {
    setRunning(true);
    try {
      const { error } = await (supabase as any).functions.invoke("form-import-watchdog", {
        body: {},
      });
      if (error) throw error;
      toast.success("Watchdog completed.");
      await refetch();
    } catch (e: any) {
      toast.error(`Watchdog failed: ${e?.message || "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Form Import Health</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runQueueNow} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Run queue now
          </Button>
          <Button size="sm" variant="outline" onClick={runWatchdog} disabled={running}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Run watchdog
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !data || data.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>All form integrations are healthy. No drift detected.</span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {data.length} integration{data.length === 1 ? "" : "s"} need attention.
            </p>
            <div className="divide-y divide-border rounded-md border">
              {data.map((row) => {
                const gap = row.total_entries_estimated - row.total_entries_imported;
                return (
                  <div key={row.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{row.form_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.domain || "—"} · {row.builder_type} · {row.total_entries_imported}/{row.total_entries_estimated}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {row.status === "needs_review" && (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-[10px]">Needs review</Badge>
                      )}
                      {row.stuck && (
                        <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Stuck
                        </Badge>
                      )}
                      {gap > 0 && row.status !== "needs_review" && (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-[10px]">
                          {gap} missing
                        </Badge>
                      )}
                      {row.status === "error" && (
                        <Badge variant="destructive" className="text-[10px]">Error</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
