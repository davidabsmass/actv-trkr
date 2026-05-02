import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JourneyRowItem, type JourneyRow } from "./JourneyRow";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users, Download, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  orgId: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  pageSize?: number;
  initialOutcome?: "all" | "lead" | "engaged" | "bounced";
  compact?: boolean;
}

type SortMode = "recent" | "relevance";

interface JourneyResp {
  rows: JourneyRow[];
  total: number | null; // null when capped (very large set)
  capHit: boolean;
}

export function VisitorJourneysList({
  orgId, startDate, endDate, pageSize = 50, initialOutcome = "all", compact = false,
}: Props) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [sort, setSort] = useState<SortMode>("recent");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const startTs = `${startDate}T00:00:00Z`;
  const endTs = `${endDate}T23:59:59Z`;

  const { data, isLoading, error } = useQuery<JourneyResp>({
    queryKey: ["visitor_journeys", orgId, startDate, endDate, outcome, sort, page, pageSize],
    queryFn: async () => {
      if (!orgId) return { rows: [], total: 0, capHit: false };
      const { data, error } = await supabase.rpc("get_session_journeys", {
        p_org_id: orgId,
        p_start: startTs,
        p_end: endTs,
        p_outcome: outcome,
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_sort: sort,
      } as any);
      if (error) throw error;
      const rows = (data || []) as Array<JourneyRow & { total_count: number | null; cap_hit?: boolean }>;
      const rawTotal = rows[0]?.total_count;
      const capHit = !!rows[0]?.cap_hit;
      return {
        rows,
        total: rawTotal == null ? null : Number(rawTotal),
        capHit,
      };
    },
    enabled: !!orgId,
  });

  const total = data?.total ?? null;
  const capHit = !!data?.capHit;
  const rows = data?.rows ?? [];
  // When capped (large dataset), pagination is bounded by the 500-row cap.
  // When uncapped, by the actual filtered total.
  const effectiveTotal = total ?? Math.min(rows.length + page * pageSize, 500);
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  async function handleExport() {
    if (!orgId || exporting) return;
    setExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
      const url = `https://${projectId}.supabase.co/functions/v1/export-visitor-journeys`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          org_id: orgId,
          start: startTs,
          end: endTs,
          outcome,
          sort,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `Export failed (${resp.status})`);
      }

      const blob = await resp.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `visitor-journeys-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);

      toast({ title: "Export ready", description: "Your visitor journeys CSV has been downloaded." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast({ title: "Export failed", description: msg, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const showLabel = total != null
    ? `${total.toLocaleString()} session${total === 1 ? "" : "s"}`
    : `500+ sessions`;

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border/60 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Visitor Journeys</h3>
          <span className="text-xs text-muted-foreground">{showLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v: SortMode) => { setSort(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent first</SelectItem>
              <SelectItem value="relevance">Most relevant first</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={(v: typeof outcome) => { setOutcome(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All visitors</SelectItem>
              <SelectItem value="lead">Leads only</SelectItem>
              <SelectItem value="engaged">Engaged</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
            </SelectContent>
          </Select>
          {!compact && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={exporting || !orgId || rows.length === 0}
              className="h-8 text-xs gap-1"
            >
              <Download className="h-3 w-3" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          )}
        </div>
      </div>

      {capHit && !compact && (
        <div className="flex items-start gap-2 px-3 py-2 bg-primary/5 border-b border-primary/20 text-xs text-foreground">
          <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            Showing the most recent 500 sessions in this range. Narrow the date range or switch to <strong>Most relevant first</strong> to focus on leads and engaged visitors — or export to CSV for the full set.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-4 h-4 rounded bg-muted mt-1" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-2 bg-muted rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-center text-sm text-destructive">
          Failed to load journeys.
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No visitor sessions yet for the selected range.
        </div>
      ) : (
        <div>
          {(compact ? rows.slice(0, 5) : rows).map((j) => (
            <JourneyRowItem key={j.session_id} j={j} orgId={orgId} />
          ))}
        </div>
      )}

      {!compact && totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-border/60 text-xs">
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}{capHit ? " (capped)" : ""}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm" variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
