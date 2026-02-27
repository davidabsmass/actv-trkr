import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Lock } from "lucide-react";

const SnapshotView = () => {
  const { id } = useParams<{ id: string }>();

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ["snapshot", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("dashboard_snapshots")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!snapshot || error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-sm">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Snapshot Not Found</h2>
          <p className="text-sm text-muted-foreground">This link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const isExpired = new Date(snapshot.expires_at) < new Date();
  if (isExpired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-sm">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Snapshot Expired</h2>
          <p className="text-sm text-muted-foreground">This snapshot expired on {new Date(snapshot.expires_at).toLocaleDateString()}.</p>
        </div>
      </div>
    );
  }

  const data = snapshot.snapshot_data as any;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Performance Snapshot</h1>
          <span className="text-xs text-muted-foreground ml-auto">
            {snapshot.date_range_start} → {snapshot.date_range_end}
          </span>
        </div>

        {data?.orgName && (
          <p className="text-sm text-muted-foreground mb-4">{data.orgName}</p>
        )}

        {data?.kpis && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Object.entries(data.kpis).map(([key, kpi]: [string, any]) => (
              <div key={key} className="glass-card p-5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                <p className="text-2xl font-semibold font-mono-data text-foreground mt-1">
                  {key === "cvr" ? `${(kpi.value * 100).toFixed(1)}%` : kpi.value?.toLocaleString?.() || kpi.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {data?.wowData && (
          <div className="glass-card p-4 mb-6">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-primary mb-2">This Week vs Last</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Sessions</p>
                <p className="text-sm font-semibold font-mono-data text-foreground">{data.wowData.sessions.current}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Leads</p>
                <p className="text-sm font-semibold font-mono-data text-foreground">{data.wowData.leads.current}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CVR</p>
                <p className="text-sm font-semibold font-mono-data text-foreground">{(data.wowData.cvr.current * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        <div className="text-center py-8 text-xs text-muted-foreground">
          <p>Read-only snapshot • Generated {new Date(data?.generatedAt || snapshot.created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export default SnapshotView;
