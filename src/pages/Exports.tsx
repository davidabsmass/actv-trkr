import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Download, FileSpreadsheet, Clock, CheckCircle, AlertCircle } from "lucide-react";
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

type ExportFormat = "csv" | "xlsx";

export default function Exports() {
  const { orgId, orgName } = useOrg();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["export_jobs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("export_jobs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const createExport = useMutation({
    mutationFn: async () => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const { error } = await supabase.from("export_jobs").insert({
        org_id: orgId,
        created_by: session.user.id,
        format: exportFormat,
        status: "queued",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["export_jobs"] });
      toast.success(`${exportFormat.toUpperCase()} export queued`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create export");
    },
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "completed": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "error": return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const handleDownload = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("exports")
      .createSignedUrl(filePath, 60);
    if (error) {
      toast.error("Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Exports</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Export data for {orgName}
      </p>

      {/* Create Export */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Export Leads Data
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Export all leads and their field data as a downloadable file.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="xlsx">XLSX</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => createExport.mutate()}
            disabled={createExport.isPending}
          >
            {createExport.isPending ? "Queuing…" : "Export Now"}
          </Button>
        </div>
      </div>

      {/* Export History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Export History</h3>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading exports…</div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No exports yet. Use the form above to create your first export.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {statusIcon(job.status)}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {job.format.toUpperCase()} Export
                      {job.row_count != null && <span className="text-muted-foreground font-normal"> · {job.row_count} rows</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(job.created_at), "MMM d, yyyy 'at' HH:mm")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${
                      job.status === "completed" ? "text-success border-success/20" :
                      job.status === "error" ? "text-destructive border-destructive/20" :
                      "text-muted-foreground"
                    }`}
                  >
                    {job.status}
                  </Badge>
                  {job.status === "completed" && job.file_path && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(job.file_path!)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {job.status === "error" && job.error && (
                    <span className="text-xs text-destructive max-w-[200px] truncate">{job.error}</span>
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
