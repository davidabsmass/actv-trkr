import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { LogOut, ArrowUpDown, Info } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ExitPageRow {
  page_path: string;
  page_url: string | null;
  title: string | null;
  total_exits: number;
  total_pageviews_on_page: number;
  exit_rate: number;
}

type SortKey = "total_exits" | "exit_rate";

export function TopExitPages({
  orgId,
  startDate,
  endDate,
}: {
  orgId: string | null;
  startDate: string;
  endDate: string;
}) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortKey>("total_exits");

  const { data, isLoading } = useQuery({
    queryKey: ["top_exit_pages", orgId, startDate, endDate],
    queryFn: async (): Promise<ExitPageRow[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc("get_top_exit_pages", {
        p_org_id: orgId,
        p_start_date: `${startDate}T00:00:00Z`,
        p_end_date: `${endDate}T23:59:59.999Z`,
        p_limit: 10,
      });
      if (error) throw error;
      return (data as ExitPageRow[]) || [];
    },
    enabled: !!orgId,
  });

  const sorted = data
    ? [...data].sort((a, b) => b[sortBy] - a[sortBy])
    : [];

  const toggleSort = (key: SortKey) =>
    setSortBy((prev) => (prev === key ? prev : key));

  const highestExitRate = sorted.length > 0
    ? sorted.reduce((max, row) => (row.exit_rate > max.exit_rate ? row : max), sorted[0])
    : null;

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-40 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <LogOut className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">
          Where Visitors Drop Off
        </h3>
        <IconTooltip label="Exit pages are the final page visited before a session ended. Exit rate shows the percentage of pageviews on that page that were the last in a session.">
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
        </IconTooltip>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Not enough session data yet to show exit-page trends.
        </div>
      ) : (
        <>
          {highestExitRate && highestExitRate.exit_rate >= 60 && highestExitRate.total_exits >= 3 && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <strong>{highestExitRate.title || highestExitRate.page_path}</strong> has a {highestExitRate.exit_rate}% exit rate — visitors frequently leave from this page.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Page</TableHead>
                  <TableHead>
                    <button
                      onClick={() => toggleSort("total_exits")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Exits
                      <ArrowUpDown className={`h-3.5 w-3.5 ${sortBy === "total_exits" ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => toggleSort("exit_rate")}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Exit Rate
                      <ArrowUpDown className={`h-3.5 w-3.5 ${sortBy === "exit_rate" ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, i) => (
                  <TableRow key={row.page_path || i}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {row.title ? (
                          <>
                            <span className="font-medium text-foreground text-sm truncate max-w-[300px]">
                              {row.title}
                            </span>
                            <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {row.page_path}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium text-foreground text-sm truncate max-w-[300px]">
                            {row.page_path}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.total_exits.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              row.exit_rate >= 70
                                ? "bg-destructive"
                                : row.exit_rate >= 40
                                ? "bg-yellow-500"
                                : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(row.exit_rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono">{row.exit_rate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
