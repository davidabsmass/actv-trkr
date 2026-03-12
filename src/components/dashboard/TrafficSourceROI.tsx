import { useState, useMemo } from "react";
import { DollarSign, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Source {
  source: string;
  sessions: number;
  leads: number;
  cvr: number;
}

interface TrafficSourceROIProps {
  sources: Source[];
  estimatedValuePerLead?: number | null;
}

type SortKey = "sessions" | "leads" | "cvr" | "estRevenue" | "spend" | "cpl" | "roi";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "desc"
    ? <ChevronDown className="h-3 w-3 text-primary" />
    : <ChevronUp className="h-3 w-3 text-primary" />;
}

export function TrafficSourceROI({ sources, estimatedValuePerLead = null }: TrafficSourceROIProps) {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [spendInput, setSpendInput] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

  const { data: adSpendData } = useQuery({
    queryKey: ["ad_spend", orgId, currentMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("ad_spend")
        .select("*")
        .eq("org_id", orgId)
        .eq("month", currentMonth);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const spendMap = useMemo(() => {
    const m: Record<string, number> = {};
    adSpendData?.forEach((d) => { m[d.source] = Number(d.spend); });
    return m;
  }, [adSpendData]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const enrichedSources = useMemo(() => {
    return sources.slice(0, 10).map((s) => {
      const estRevenue = estimatedValuePerLead !== null ? s.leads * estimatedValuePerLead : null;
      const spend = spendMap[s.source] || 0;
      const cpl = spend > 0 && s.leads > 0 ? spend / s.leads : null;
      const roi = spend > 0 && estRevenue !== null ? ((estRevenue - spend) / spend) * 100 : null;
      return { ...s, estRevenue, spend, cpl, roi };
    });
  }, [sources, spendMap, estimatedValuePerLead]);

  const sorted = useMemo(() => {
    return [...enrichedSources].sort((a, b) => {
      const av = (a as any)[sortKey] ?? -Infinity;
      const bv = (b as any)[sortKey] ?? -Infinity;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [enrichedSources, sortKey, sortDir]);

  const saveMutation = useMutation({
    mutationFn: async ({ source, spend }: { source: string; spend: number }) => {
      if (!orgId) throw new Error("No org");
      const { data: sites } = await supabase.from("sites").select("id").eq("org_id", orgId).limit(1);
      const siteId = sites?.[0]?.id;
      if (!siteId) throw new Error("No site");

      const { error } = await supabase.from("ad_spend").upsert(
        { org_id: orgId, site_id: siteId, month: currentMonth, source, spend },
        { onConflict: "site_id,month,source" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad_spend"] });
      setEditingSource(null);
      setSpendInput("");
    },
  });

  const thClass = "text-right py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Traffic Source ROI
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-xs font-medium text-muted-foreground">Source</th>
              <th className={thClass} onClick={() => handleSort("sessions")}>
                <span className="inline-flex items-center gap-1 justify-end">Sessions <SortIcon active={sortKey === "sessions"} dir={sortDir} /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("leads")}>
                <span className="inline-flex items-center gap-1 justify-end">Leads <SortIcon active={sortKey === "leads"} dir={sortDir} /></span>
              </th>
              <th className={thClass} onClick={() => handleSort("cvr")}>
                <span className="inline-flex items-center gap-1 justify-end">Conv % <SortIcon active={sortKey === "cvr"} dir={sortDir} /></span>
              </th>
              <th className={thClass} onClick={() => estimatedValuePerLead !== null && handleSort("estRevenue")}>
                <span className="inline-flex items-center gap-1 justify-end">
                  {estimatedValuePerLead !== null ? <>Est Revenue <SortIcon active={sortKey === "estRevenue"} dir={sortDir} /></> : ""}
                </span>
              </th>
              <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("spend")}>
                <span className="inline-flex items-center gap-1 justify-end">Ad Spend <SortIcon active={sortKey === "spend"} dir={sortDir} /></span>
              </th>
              <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("cpl")}>
                <span className="inline-flex items-center gap-1 justify-end">CPL <SortIcon active={sortKey === "cpl"} dir={sortDir} /></span>
              </th>
              <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("roi")}>
                <span className="inline-flex items-center gap-1 justify-end">ROI <SortIcon active={sortKey === "roi"} dir={sortDir} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.source} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-2.5 font-medium text-foreground">{s.source}</td>
                <td className="py-2.5 text-right font-mono-data">{s.sessions.toLocaleString()}</td>
                <td className="py-2.5 text-right font-mono-data">{s.leads}</td>
                <td className="py-2.5 text-right font-mono-data">{(s.cvr * 100).toFixed(1)}%</td>
                <td className="py-2.5 text-right font-mono-data">{s.estRevenue !== null ? `$${s.estRevenue.toLocaleString()}` : "—"}</td>
                <td className="py-2.5 text-right hidden md:table-cell">
                  {editingSource === s.source ? (
                    <div className="flex items-center gap-1 justify-end">
                      <Input
                        type="number"
                        value={spendInput}
                        onChange={(e) => setSpendInput(e.target.value)}
                        className="w-20 h-7 text-xs"
                        placeholder="0"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            saveMutation.mutate({ source: s.source, spend: Number(spendInput) || 0 });
                          }
                          if (e.key === "Escape") setEditingSource(null);
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingSource(s.source); setSpendInput(String(s.spend || "")); }}
                      className="text-xs font-mono-data text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s.spend > 0 ? `$${s.spend.toLocaleString()}` : (
                        <span className="flex items-center gap-1 justify-end">
                          <DollarSign className="h-3 w-3" /> Add
                        </span>
                      )}
                    </button>
                  )}
                </td>
                <td className="py-2.5 text-right font-mono-data text-muted-foreground hidden md:table-cell">
                  {s.cpl !== null ? `$${s.cpl.toFixed(0)}` : "—"}
                </td>
                <td className="py-2.5 text-right font-mono-data hidden md:table-cell">
                  {s.roi !== null ? (
                    <span className={s.roi >= 0 ? "kpi-up" : "kpi-down"}>
                      {s.roi >= 0 ? "+" : ""}{s.roi.toFixed(0)}%
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}