import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ─── */

export interface ConversionGoal {
  id: string;
  org_id: string;
  name: string;
  description: string;
  goal_type: GoalType;
  tracking_rules: Record<string, any>;
  is_active: boolean;
  is_conversion: boolean;
  conversion_value: number | null;
  priority_level: string | null;
  created_at: string;
  updated_at: string;
}

export type GoalType =
  | "form_submission"
  | "cta_click"
  | "tel_click"
  | "mailto_click"
  | "outbound_click"
  | "page_visit"
  | "custom_event";

export const GOAL_TYPES: { value: GoalType; labelKey: string; icon: string }[] = [
  { value: "form_submission", labelKey: "goals.type.formSubmission", icon: "📝" },
  { value: "cta_click", labelKey: "goals.type.ctaClick", icon: "🖱️" },
  { value: "tel_click", labelKey: "goals.type.telClick", icon: "📞" },
  { value: "mailto_click", labelKey: "goals.type.mailtoClick", icon: "✉️" },
  { value: "outbound_click", labelKey: "goals.type.outboundClick", icon: "🔗" },
  { value: "page_visit", labelKey: "goals.type.pageVisit", icon: "📄" },
  { value: "custom_event", labelKey: "goals.type.customEvent", icon: "⚡" },
];

export interface ConversionMetrics {
  conversionRate: number;
  formCvr: number;
  goalCvr: number;
  totalConversions: number;
  formConversions: number;
  goalConversions: number;
  sessions: number;
  hasCustomGoals: boolean;
  goalBreakdown: { goalId: string; goalName: string; goalType: string; count: number }[];
  typeBreakdown: { type: string; count: number }[];
}

/* ─── CRUD Hooks ─── */

export function useGoals(orgId: string | null) {
  return useQuery({
    queryKey: ["conversion_goals", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("conversion_goals" as any)
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ConversionGoal[];
    },
    enabled: !!orgId,
  });
}

export function useCreateGoal(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: Partial<ConversionGoal>) => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("conversion_goals" as any).insert({
        org_id: orgId,
        name: goal.name,
        description: goal.description || "",
        goal_type: goal.goal_type || "cta_click",
        tracking_rules: goal.tracking_rules || {},
        is_active: goal.is_active ?? true,
        is_conversion: goal.is_conversion ?? true,
        conversion_value: goal.conversion_value ?? null,
        priority_level: goal.priority_level ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversion_goals", orgId] }),
  });
}

export function useUpdateGoal(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ConversionGoal> & { id: string }) => {
      const { error } = await supabase
        .from("conversion_goals" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversion_goals", orgId] }),
  });
}

export function useDeleteGoal(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conversion_goals" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversion_goals", orgId] }),
  });
}

/* ─── Conversion Metrics ─── */

function defaultMetrics(): ConversionMetrics {
  return {
    conversionRate: 0, formCvr: 0, goalCvr: 0,
    totalConversions: 0, formConversions: 0, goalConversions: 0,
    sessions: 0, hasCustomGoals: false, goalBreakdown: [], typeBreakdown: [],
  };
}

export function useConversionMetrics(
  orgId: string | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ["conversion_metrics", orgId, startDate, endDate],
    queryFn: async (): Promise<ConversionMetrics> => {
      if (!orgId) return defaultMetrics();

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      // Parallel base queries
      const [goalsRes, sessRes, leadsRes, completionsRes] = await Promise.all([
        supabase
          .from("conversion_goals" as any)
          .select("*")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .eq("is_conversion", true),
        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd),
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd),
        supabase
          .from("goal_completions" as any)
          .select("goal_id")
          .eq("org_id", orgId)
          .gte("completed_at", dayStart)
          .lte("completed_at", dayEnd),
      ]);

      const goals = (goalsRes.data || []) as unknown as ConversionGoal[];
      const sessions = sessRes.count || 0;
      const formLeads = leadsRes.count || 0;
      const completions = (completionsRes.data || []) as unknown as { goal_id: string }[];

      const hasCustomGoals = goals.length > 0;

      // Count completions by goal (click-based goals tracked via track-event)
      const goalCountMap: Record<string, number> = {};
      completions.forEach((c) => {
        goalCountMap[c.goal_id] = (goalCountMap[c.goal_id] || 0) + 1;
      });

      // Page visit goals — compute from pageviews at query time
      const pageVisitGoals = goals.filter((g) => g.goal_type === "page_visit");
      for (const goal of pageVisitGoals) {
        const rules = goal.tracking_rules || {};
        let query = supabase
          .from("pageviews")
          .select("session_id")
          .eq("org_id", orgId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd);

        if (rules.url_contains) {
          query = query.ilike("page_path", `%${rules.url_contains}%`);
        } else if (rules.url_exact) {
          query = query.eq("page_path", rules.url_exact);
        } else {
          continue; // no rule configured
        }
        const { data: pvData } = await query.limit(1000);
        const uniqueSessions = new Set(
          (pvData || []).map((pv: any) => pv.session_id).filter(Boolean)
        ).size;
        goalCountMap[goal.id] = (goalCountMap[goal.id] || 0) + uniqueSessions;
      }

      // Form submission goals — count from leads table
      const formGoals = goals.filter((g) => g.goal_type === "form_submission");
      let formGoalConversions = 0;
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
        const c = count || 0;
        goalCountMap[goal.id] = c;
        formGoalConversions += c;
      }

      // Build breakdown
      const goalBreakdown = goals
        .map((g) => ({
          goalId: g.id,
          goalName: g.name,
          goalType: g.goal_type,
          count: goalCountMap[g.id] || 0,
        }))
        .sort((a, b) => b.count - a.count);

      const typeMap: Record<string, number> = {};
      goalBreakdown.forEach((gb) => {
        typeMap[gb.goalType] = (typeMap[gb.goalType] || 0) + gb.count;
      });
      const typeBreakdown = Object.entries(typeMap)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Non-form goal completions (click + page visit goals)
      const nonFormGoalCompletions = goalBreakdown
        .filter((g) => {
          const goal = goals.find((gg) => gg.id === g.goalId);
          return goal && goal.goal_type !== "form_submission";
        })
        .reduce((s, g) => s + g.count, 0);

      // Total conversions based on fallback logic
      let totalConversions: number;
      if (hasCustomGoals) {
        totalConversions = goalBreakdown.reduce((s, g) => s + g.count, 0);
      } else {
        // Fallback: form leads = conversions
        totalConversions = formLeads;
      }

      const conversionRate = sessions > 0 ? totalConversions / sessions : 0;
      const formCvr = sessions > 0 ? formLeads / sessions : 0;
      const goalCvr = sessions > 0 ? nonFormGoalCompletions / sessions : 0;

      return {
        conversionRate,
        formCvr,
        goalCvr,
        totalConversions,
        formConversions: formLeads,
        goalConversions: nonFormGoalCompletions,
        sessions,
        hasCustomGoals,
        goalBreakdown,
        typeBreakdown,
      };
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}
