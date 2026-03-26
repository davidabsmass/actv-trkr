import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GoalConfig {
  id: string;
  name: string;
  match_type: string;
  match_value: string;
  event_type: string;
}

interface GoalResult {
  name: string;
  count: number;
  labels: { label: string; count: number }[];
}

export function GoalConversions({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
  const { t } = useTranslation();

  const { data: goals } = useQuery({
    queryKey: ["goals_config", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("goals_config" as any)
        .select("*")
        .eq("org_id", orgId)
        .eq("is_conversion", true);
      return (data || []) as unknown as GoalConfig[];
    },
    enabled: !!orgId,
  });

  const { data: results, isLoading } = useQuery({
    queryKey: ["goal_conversions", orgId, startDate, endDate, goals?.length],
    queryFn: async () => {
      if (!orgId || !goals || goals.length === 0) return [];
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      const { data: events } = await supabase
        .from("events")
        .select("event_type, target_text, meta, page_path")
        .eq("org_id", orgId)
        .gte("occurred_at", dayStart)
        .lte("occurred_at", dayEnd)
        .limit(1000);

      if (!events) return [];

      return goals.map((goal): GoalResult => {
        const matched = events.filter((evt) => {
          if (evt.event_type !== goal.event_type) return false;
          const val = goal.match_value.toLowerCase();
          switch (goal.match_type) {
            case "target_text_contains":
              return (evt.target_text || "").toLowerCase().includes(val);
            case "target_label_exact": {
              const meta = evt.meta as any;
              return meta?.target_label?.toLowerCase() === val;
            }
            case "page_path_contains":
              return (evt.page_path || "").toLowerCase().includes(val);
            default:
              return false;
          }
        });

        // Group by target_label for leaderboard
        const labelMap: Record<string, number> = {};
        matched.forEach((evt) => {
          const meta = evt.meta as any;
          const label = meta?.target_label || evt.target_text || t("goals.unknown");
          labelMap[label] = (labelMap[label] || 0) + 1;
        });

        const labels = Object.entries(labelMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([label, count]) => ({ label, count }));

        return { name: goal.name, count: matched.length, labels };
      }).sort((a, b) => b.count - a.count);
    },
    enabled: !!orgId && !!goals && goals.length > 0,
  });

  if (!goals || goals.length === 0) return null;

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (!results || results.length === 0) return null;

  const totalConversions = results.reduce((s, r) => s + r.count, 0);

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t("goals.conversions")}
        </h3>
        <span className="text-xs font-mono-data text-muted-foreground">{totalConversions} {t("dashboard.total")}</span>
      </div>

      <div className="space-y-4">
        {results.map((goal) => (
          <div key={goal.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">{goal.name}</span>
              <span className="text-sm font-mono-data font-bold text-foreground">{goal.count}</span>
            </div>
            {goal.labels.length > 0 && (
              <div className="pl-4 space-y-1">
                {goal.labels.map((lbl, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[70%]">{lbl.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/50" style={{ width: `${(lbl.count / goal.count) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono-data text-muted-foreground w-6 text-right">{lbl.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
