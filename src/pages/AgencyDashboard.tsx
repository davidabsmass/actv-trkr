import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { Navigate } from "react-router-dom";
import { Building2, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface OrgMetrics {
  orgId: string;
  orgName: string;
  sessions: number;
  leads: number;
  cvr: number;
  estRevenue: number;
  trend: "up" | "down" | "flat";
}

export default function AgencyDashboard() {
  const { isAdmin, loading: roleLoading } = useUserRole();

  const { data: orgMetrics, isLoading } = useQuery({
    queryKey: ["agency_dashboard"],
    queryFn: async () => {
      // Get all orgs the admin has access to
      const { data: orgs, error: orgErr } = await supabase
        .from("orgs")
        .select("id, name")
        .order("name");
      if (orgErr) throw orgErr;
      if (!orgs || orgs.length === 0) return [];

      const now = new Date();
      const endDate = now.toISOString();
      const startDate = new Date(now.getTime() - 30 * 86400000).toISOString();

      // Get session & lead counts per org for last 30 days
      const metrics: OrgMetrics[] = [];

      for (const org of orgs) {
        const [sessRes, leadRes] = await Promise.all([
          supabase.from("sessions")
            .select("*", { count: "exact", head: true })
            .eq("org_id", org.id)
            .gte("started_at", startDate)
            .lte("started_at", endDate),
          supabase.from("leads")
            .select("*", { count: "exact", head: true })
            .eq("org_id", org.id)
            .gte("submitted_at", startDate)
            .lte("submitted_at", endDate),
        ]);

        const sessions = sessRes.count || 0;
        const leads = leadRes.count || 0;
        const cvr = sessions > 0 ? leads / sessions : 0;

        metrics.push({
          orgId: org.id,
          orgName: org.name,
          sessions,
          leads,
          cvr,
          estRevenue: leads * 150,
          trend: cvr > 0.03 ? "up" : cvr > 0.01 ? "flat" : "down",
        });
      }

      return metrics.sort((a, b) => b.estRevenue - a.estRevenue);
    },
    enabled: isAdmin,
  });

  if (roleLoading) return <div className="p-12 text-center text-muted-foreground text-sm">Loading…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agency Overview</h1>
          <p className="text-sm text-muted-foreground">Cross-client performance comparison (last 30 days)</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">{orgMetrics?.length || 0} Clients</span>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Client</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Sessions</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Leads</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Conv %</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Est Revenue</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Trend</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading metrics…</td>
                </tr>
              ) : !orgMetrics || orgMetrics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No client data yet.</td>
                </tr>
              ) : (
                orgMetrics.map((m) => (
                  <tr key={m.orgId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-foreground">{m.orgName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono-data">{m.sessions.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-mono-data">{m.leads}</td>
                    <td className="px-5 py-3 text-right font-mono-data">{(m.cvr * 100).toFixed(1)}%</td>
                    <td className="px-5 py-3 text-right font-mono-data">${m.estRevenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      {m.trend === "up" ? (
                        <span className="inline-flex items-center gap-1 kpi-up text-xs font-medium">
                          <TrendingUp className="h-3.5 w-3.5" /> Growing
                        </span>
                      ) : m.trend === "down" ? (
                        <span className="inline-flex items-center gap-1 kpi-down text-xs font-medium">
                          <TrendingDown className="h-3.5 w-3.5" /> Declining
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 kpi-neutral text-xs font-medium">
                          — Flat
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
