import { useState, useMemo } from "react";
import { DollarSign, TrendingUp } from "lucide-react";
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
  estimatedValuePerLead?: number;
}

export function TrafficSourceROI({ sources, estimatedValuePerLead = 150 }: TrafficSourceROIProps) {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [spendInput, setSpendInput] = useState("");

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

  const saveMutation = useMutation({
    mutationFn: async ({ source, spend }: { source: string; spend: number }) => {
      if (!orgId) throw new Error("No org");
      // Get first site for this org
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
              <th className="text-right py-2 text-xs font-medium text-muted-foreground">Sessions</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground">Leads</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground">Conv %</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground">Est Revenue</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Ad Spend</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">CPL</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">ROI</th>
            </tr>
          </thead>
          <tbody>
            {sources.slice(0, 10).map((s) => {
              const estRevenue = s.leads * estimatedValuePerLead;
              const spend = spendMap[s.source] || 0;
              const cpl = spend > 0 && s.leads > 0 ? spend / s.leads : null;
              const roi = spend > 0 ? ((estRevenue - spend) / spend) * 100 : null;

              return (
                <tr key={s.source} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 font-medium text-foreground">{s.source}</td>
                  <td className="py-2.5 text-right font-mono-data">{s.sessions.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-mono-data">{s.leads}</td>
                  <td className="py-2.5 text-right font-mono-data">{(s.cvr * 100).toFixed(1)}%</td>
                  <td className="py-2.5 text-right font-mono-data">${estRevenue.toLocaleString()}</td>
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
                        onClick={() => { setEditingSource(s.source); setSpendInput(String(spend || "")); }}
                        className="text-xs font-mono-data text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {spend > 0 ? `$${spend.toLocaleString()}` : (
                          <span className="flex items-center gap-1 justify-end">
                            <DollarSign className="h-3 w-3" /> Add
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono-data text-muted-foreground hidden md:table-cell">
                    {cpl !== null ? `$${cpl.toFixed(0)}` : "—"}
                  </td>
                  <td className="py-2.5 text-right font-mono-data hidden md:table-cell">
                    {roi !== null ? (
                      <span className={roi >= 0 ? "kpi-up" : "kpi-down"}>
                        {roi >= 0 ? "+" : ""}{roi.toFixed(0)}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
