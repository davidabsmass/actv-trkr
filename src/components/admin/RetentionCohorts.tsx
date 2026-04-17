import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";

type CohortRow = {
  cohort_week: string;
  cohort_size: number;
  week_offset: number;
  active_count: number;
  retention_pct: number | null;
};

const WEEK_RANGE = 12;

export default function RetentionCohorts() {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_retention_cohorts", { p_weeks: WEEK_RANGE });
    if (!error && data) setRows(data as CohortRow[]);
    setLoading(false);
  };

  const { cohorts, maxOffset } = useMemo(() => {
    const map = new Map<string, { size: number; cells: Map<number, number> }>();
    let maxOff = 0;
    for (const r of rows) {
      const key = r.cohort_week;
      if (!map.has(key)) map.set(key, { size: r.cohort_size, cells: new Map() });
      map.get(key)!.cells.set(r.week_offset, r.retention_pct ?? 0);
      if (r.week_offset > maxOff) maxOff = r.week_offset;
    }
    const sorted = Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([week, v]) => ({ week, size: v.size, cells: v.cells }));
    return { cohorts: sorted, maxOffset: Math.min(maxOff, WEEK_RANGE - 1) };
  }, [rows]);

  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  const heatColor = (pct: number) => {
    // pct 0..100 → use HSL via primary token opacity
    const alpha = Math.min(0.85, Math.max(0.05, pct / 100));
    return `hsl(var(--primary) / ${alpha.toFixed(2)})`;
  };

  const handleExport = () => {
    downloadCsv(
      `retention-cohorts-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
      ["cohort_week", "cohort_size", "week_offset", "active_count", "retention_pct"],
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Cohort Retention</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Weekly signup cohorts vs. login activity by week-since-signup (last {WEEK_RANGE} weeks).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          CSV
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No signup cohort data yet.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-muted-foreground font-medium">Cohort</th>
                <th className="text-left p-2 text-muted-foreground font-medium">Size</th>
                {offsets.map((o) => (
                  <th key={o} className="text-center p-2 text-muted-foreground font-medium">
                    W{o}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.week} className="border-b border-border/50">
                  <td className="p-2 font-medium text-foreground whitespace-nowrap">
                    {new Date(c.week).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </td>
                  <td className="p-2 text-muted-foreground">{c.size}</td>
                  {offsets.map((o) => {
                    const pct = c.cells.get(o);
                    if (pct === undefined) return <td key={o} className="p-2 text-center text-muted-foreground/40">—</td>;
                    return (
                      <td
                        key={o}
                        className="p-2 text-center font-mono"
                        style={{ background: heatColor(pct), color: pct > 50 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))" }}
                      >
                        {pct.toFixed(0)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
