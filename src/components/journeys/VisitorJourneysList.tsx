import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { JourneyRowItem, type JourneyRow } from "./JourneyRow";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

interface Props {
  orgId: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  pageSize?: number;
  initialOutcome?: "all" | "lead" | "engaged" | "bounced";
  compact?: boolean;
}

export function VisitorJourneysList({
  orgId, startDate, endDate, pageSize = 50, initialOutcome = "all", compact = false,
}: Props) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [page, setPage] = useState(0);

  const startTs = `${startDate}T00:00:00Z`;
  const endTs = `${endDate}T23:59:59Z`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["visitor_journeys", orgId, startDate, endDate, outcome, page, pageSize],
    queryFn: async () => {
      if (!orgId) return { rows: [] as JourneyRow[], total: 0 };
      const { data, error } = await supabase.rpc("get_session_journeys", {
        p_org_id: orgId,
        p_start: startTs,
        p_end: endTs,
        p_outcome: outcome,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const rows = (data || []) as Array<JourneyRow & { total_count: number }>;
      const total = rows[0]?.total_count ?? 0;
      return { rows, total: Number(total) };
    },
    enabled: !!orgId,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.rows ?? [];

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Visitor Journeys</h3>
          <span className="text-xs text-muted-foreground">
            {total.toLocaleString()} session{total === 1 ? "" : "s"}
          </span>
        </div>
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
      </div>

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
            Page {page + 1} of {totalPages}
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
