import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GOAL_TYPES, type ConversionGoal } from "@/hooks/use-goals";

interface GoalResult {
  id: string;
  name: string;
  goal_type: string;
  count: number;
}

export function GoalConversions({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
  const { t } = useTranslation();

  const { data: results, isLoading } = useQuery({
    queryKey: ["goal_conversions_v2", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      // Fetch active goals
      const { data: goals } = await supabase
        .from("conversion_goals" as any)
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true);

      if (!goals || goals.length === 0) return [];
      const typedGoals = goals as unknown as ConversionGoal[];

      // Fetch completions
      const { data: completions } = await supabase
        .from("goal_completions" as any)
        .select("goal_id")
        .eq("org_id", orgId)
        .gte("completed_at", dayStart)
        .lte("completed_at", dayEnd);

      const countMap: Record<string, number> = {};
      (completions || []).forEach((c: any) => {
        countMap[c.goal_id] = (countMap[c.goal_id] || 0) + 1;
      });

      // Also count form goals from leads
      const formGoals = typedGoals.filter(g => g.goal_type === "form_submission");
      for (const goal of formGoals) {
        const rules = goal.tracking_rules || {};
        let query = supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd);
        if (rules.form_id && rules.form_id !== "all") {
          query = query.eq("form_id", rules.form_id);
        }
        const { count } = await query;
        countMap[goal.id] = (countMap[goal.id] || 0) + (count || 0);
      }

      // Page visit goals from pageviews
      const pvGoals = typedGoals.filter(g => g.goal_type === "page_visit");
      for (const goal of pvGoals) {
        const rules = goal.tracking_rules || {};
        let query = supabase
          .from("pageviews")
          .select("session_id")
          .eq("org_id", orgId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd);
        if (rules.url_contains) query = query.ilike("page_path", `%${rules.url_contains}%`);
        else if (rules.url_exact) query = query.eq("page_path", rules.url_exact);
        else continue;
        const { data: pvData } = await query.limit(1000);
        const uniq = new Set((pvData || []).map((p: any) => p.session_id).filter(Boolean)).size;
        countMap[goal.id] = (countMap[goal.id] || 0) + uniq;
      }

      return typedGoals
        .map((g): GoalResult => ({
          id: g.id,
          name: g.name,
          goal_type: g.goal_type,
          count: countMap[g.id] || 0,
        }))
        .sort((a, b) => b.count - a.count);
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (!results || results.length === 0) return null;

  const total = results.reduce((s, r) => s + r.count, 0);

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t("goals.goalCompletions")}
        </h3>
        <span className="text-xs font-mono-data text-muted-foreground">{total} {t("dashboard.total")}</span>
      </div>

      <div className="space-y-2">
        {results.map((goal) => {
          const typeInfo = GOAL_TYPES.find((gt) => gt.value === goal.goal_type);
          const maxCount = results[0]?.count || 1;
          return (
            <div key={goal.id} className="flex items-center gap-3">
              <span className="text-sm flex-shrink-0">{typeInfo?.icon || "🎯"}</span>
              <span className="text-xs font-medium text-foreground truncate w-[35%]">{goal.name}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary/50" style={{ width: `${(goal.count / maxCount) * 100}%` }} />
              </div>
              <span className="text-xs font-mono-data text-muted-foreground w-8 text-right">{goal.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
