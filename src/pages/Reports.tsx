import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { FileText, Play, Clock, CheckCircle, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function Reports() {
  const { orgId, orgName } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const { data: templates } = useQuery({
    queryKey: ["report_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["report_runs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("report_runs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const generateReport = useMutation({
    mutationFn: async (templateSlug: string) => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const template = templates?.find((t) => t.slug === templateSlug);
      const { error } = await supabase.from("report_runs").insert({
        org_id: orgId,
        template_slug: templateSlug,
        created_by: session.user.id,
        params: template?.default_params || {},
        status: "queued",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_runs"] });
      toast.success("Report queued for generation");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to generate report");
    },
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "running": return <Play className="h-3.5 w-3.5 text-primary" />;
      case "completed": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "error": return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const templateName = (slug: string) =>
    templates?.find((t) => t.slug === slug)?.name || slug;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Generate reports for {orgName}
      </p>

      {/* Generate Report */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Generate a Report
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a report template" />
            </SelectTrigger>
            <SelectContent>
              {(templates || []).map((t) => (
                <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => selectedTemplate && generateReport.mutate(selectedTemplate)}
            disabled={!selectedTemplate || generateReport.isPending}
          >
            {generateReport.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>

      {/* Report History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Report History</h3>
        </div>
        {runsLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading reports…</div>
        ) : !runs || runs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No reports generated yet. Select a template above to create your first report.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {statusIcon(run.status)}
                  <div>
                    <p className="text-sm font-medium text-foreground">{templateName(run.template_slug)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(run.created_at), "MMM d, yyyy 'at' HH:mm")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${
                      run.status === "completed" ? "text-success border-success/20" :
                      run.status === "error" ? "text-destructive border-destructive/20" :
                      "text-muted-foreground"
                    }`}
                  >
                    {run.status}
                  </Badge>
                  {run.status === "completed" && run.file_path && (
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
