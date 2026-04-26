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
  /** Total leads in the period including imports and sessionless POSTs (display only). */
  totalLeads: number;
  /** Leads excluded from CVR because they had no tracked session (imports, untracked pages, adblocked, server-side). */
  untrackedLeads: number;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversion_goals", orgId] });
      qc.invalidateQueries({ queryKey: ["conversion_metrics"] });
      qc.invalidateQueries({ queryKey: ["goal_conversions_v2"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversion_goals", orgId] });
      qc.invalidateQueries({ queryKey: ["conversion_metrics"] });
      qc.invalidateQueries({ queryKey: ["goal_conversions_v2"] });
    },
  });
}

export function useDeleteGoal(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conversion_goals" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversion_goals", orgId] });
      qc.invalidateQueries({ queryKey: ["conversion_metrics"] });
      qc.invalidateQueries({ queryKey: ["goal_conversions_v2"] });
    },
  });
}

/* ─── Conversion Metrics ─── */

function defaultMetrics(): ConversionMetrics {
  return {
    conversionRate: 0, formCvr: 0, goalCvr: 0,
    totalConversions: 0, formConversions: 0, totalLeads: 0, untrackedLeads: 0,
    goalConversions: 0,
    sessions: 0, hasCustomGoals: false, goalBreakdown: [], typeBreakdown: [],
  };
}

export function useConversionMetrics(
  orgId: string | null,
  startDate: string,
  endDate: string,
  installCutoff?: string | null
) {
  return useQuery({
    queryKey: ["conversion_metrics", orgId, startDate, endDate, installCutoff || null],
    queryFn: async (): Promise<ConversionMetrics> => {
      if (!orgId) return defaultMetrics();

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;
      const leadsLowerBound =
        installCutoff && new Date(installCutoff) > new Date(dayStart)
          ? installCutoff
          : dayStart;

      // Parallel base queries.
      // CVR ONLY counts leads attached to a tracked session (session_id IS NOT NULL).
      // This excludes WordPress imports/backfills, untracked-page submissions,
      // adblocked visitors, and server-to-server POSTs — which would otherwise
      // produce nonsensical >100% rates because they have no matching session.
      // `totalLeadsRes` keeps the unfiltered count for display ("X leads excluded").
      const [goalsRes, sessRes, leadsRes, totalLeadsRes, completionsRes] = await Promise.all([
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
          .not("session_id", "is", null)
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd),
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
      const totalLeads = totalLeadsRes.count || 0;
      const untrackedLeads = Math.max(0, totalLeads - formLeads);
      const completions = (completionsRes.data || []) as unknown as { goal_id: string }[];

      const hasCustomGoals = goals.length > 0;

      // Count completions by goal (click-based goals tracked via track-event)
      const goalCountMap: Record<string, number> = {};
      completions.forEach((c) => {
        goalCountMap[c.goal_id] = (goalCountMap[c.goal_id] || 0) + 1;
      });

      // Fallback: if goal_completions are missing, derive counts from raw events
      // so Conversion Breakdown still reflects tracked goal activity.
      const fallbackGoals = goals.filter((g) => {
        const current = goalCountMap[g.id] || 0;
        return current === 0 && g.goal_type !== "form_submission" && g.goal_type !== "page_visit";
      });

      if (fallbackGoals.length > 0) {
        const CLICK_TYPES = new Set(["cta_click", "outbound_click", "tel_click", "mailto_click"]);
        const eventTypeSet = new Set<string>();

        fallbackGoals.forEach((g) => {
          if (g.goal_type === "custom_event") {
            const eventName = String(g.tracking_rules?.event_name || "").trim();
            if (eventName) eventTypeSet.add(eventName);
            return;
          }
          if (g.goal_type === "tel_click" || g.goal_type === "mailto_click") {
            eventTypeSet.add(g.goal_type);
            return;
          }
          if (CLICK_TYPES.has(g.goal_type)) {
            CLICK_TYPES.forEach((t) => eventTypeSet.add(t));
          }
        });

        const neededTypes = Array.from(eventTypeSet);
        if (neededTypes.length > 0) {
          type RawEvent = {
            event_type: string;
            target_text: string | null;
            page_url: string | null;
            page_path: string | null;
            session_id: string | null;
            occurred_at: string;
            meta: Record<string, any> | null;
          };

          const fallbackEvents: RawEvent[] = [];
          const pageSize = 1000;
          for (let from = 0; from < 5000; from += pageSize) {
            const { data, error } = await supabase
              .from("events")
              .select("event_type,target_text,page_url,page_path,session_id,occurred_at,meta")
              .eq("org_id", orgId)
              .in("event_type", neededTypes)
              .gte("occurred_at", dayStart)
              .lte("occurred_at", dayEnd)
              .order("occurred_at", { ascending: false })
              .range(from, from + pageSize - 1);

            if (error || !data || data.length === 0) break;
            fallbackEvents.push(...(data as unknown as RawEvent[]));
            if (data.length < pageSize) break;
          }

          const matchesGoal = (evt: RawEvent, goal: ConversionGoal) => {
            const rules = (goal.tracking_rules || {}) as Record<string, any>;
            const text = (evt.target_text || "").toLowerCase();
            const label = String(evt.meta?.target_label || "").toLowerCase();
            const href = String(evt.meta?.target_href || "").toLowerCase();
            const url = (evt.page_url || "").toLowerCase();
            const path = (evt.page_path || "").toLowerCase();

            if (goal.goal_type === "custom_event") {
              const eventName = String(rules.event_name || "").trim();
              return !!eventName && eventName === evt.event_type;
            }

            const goalIsClick = CLICK_TYPES.has(goal.goal_type);
            const evtIsClick = CLICK_TYPES.has(evt.event_type);
            if (!goalIsClick && goal.goal_type !== evt.event_type) return false;
            if (goalIsClick && !evtIsClick) return false;

            if (
              (goal.goal_type === "tel_click" || goal.goal_type === "mailto_click") &&
              goal.goal_type !== evt.event_type
            ) {
              return false;
            }

            if (rules.text_contains) {
              const needle = String(rules.text_contains).toLowerCase();
              if (!text.includes(needle) && !label.includes(needle)) return false;
            }

            if (rules.href_contains) {
              const needle = String(rules.href_contains).toLowerCase();
              const hrefMatches =
                href.includes(needle) ||
                url.includes(needle) ||
                text.includes(needle) ||
                label.includes(needle);
              const allowLegacyNoHref = !href && !!rules.text_contains;
              if (!hrefMatches && !allowLegacyNoHref) return false;
            }

            if (rules.page_path_contains) {
              const needle = String(rules.page_path_contains).toLowerCase();
              if (!path.includes(needle)) return false;
            }

            if (rules.match === "all") return true;
            return true;
          };

          const seen = new Set<string>();
          const fallbackCounts: Record<string, number> = {};

          const normalizeForKey = (value: unknown, maxLen = 240) =>
            String(value ?? "")
              .toLowerCase()
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, maxLen);

          const hashString = (input: string) => {
            let hash = 2166136261;
            for (let i = 0; i < input.length; i++) {
              hash ^= input.charCodeAt(i);
              hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
            }
            return (hash >>> 0).toString(16);
          };

          for (const evt of fallbackEvents) {
            for (const goal of fallbackGoals) {
              if (!matchesGoal(evt, goal)) continue;
              const occurredAtMs = new Date(evt.occurred_at).getTime();
              const eventSecond = Math.floor((Number.isNaN(occurredAtMs) ? Date.now() : occurredAtMs) / 1000);
              const actorKey = evt.session_id || "no-session";
              const href = normalizeForKey(evt.meta?.target_href, 320);
              const label = normalizeForKey(evt.meta?.target_label, 160);
              const text = normalizeForKey(evt.target_text, 160);
              const path = normalizeForKey(evt.page_path, 240);
              const eventType = normalizeForKey(evt.event_type, 48);
              const fingerprint = hashString(`${eventType}|${path}|${href}|${label}|${text}|${eventSecond}`);
              const dedupeKey = `${goal.id}:${actorKey}:${fingerprint}`;
              if (seen.has(dedupeKey)) continue;
              seen.add(dedupeKey);
              fallbackCounts[goal.id] = (fallbackCounts[goal.id] || 0) + 1;
            }
          }

          Object.entries(fallbackCounts).forEach(([goalId, count]) => {
            if ((goalCountMap[goalId] || 0) === 0) {
              goalCountMap[goalId] = count;
            }
          });
        }
      }

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

      // Form submission goals — count from leads table.
      // Match the global CVR rule: only count leads attached to a tracked
      // session so the rate stays apples-to-apples with the sessions denominator.
      const formGoals = goals.filter((g) => g.goal_type === "form_submission");
      let formGoalConversions = 0;
      for (const goal of formGoals) {
        const rules = goal.tracking_rules || {};
        let query = supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .not("session_id", "is", null)
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

      // CVR uses tracked leads (session_id IS NOT NULL) ÷ tracked sessions so
      // numerator and denominator come from the same observed universe. The
      // Math.min cap is kept as a defensive safety net for edge cases (e.g.
      // a session that started just outside the date window).
      const conversionRate = sessions > 0 ? Math.min(1, totalConversions / sessions) : 0;
      const formCvr = sessions > 0 ? Math.min(1, formLeads / sessions) : 0;
      const goalCvr = sessions > 0 ? Math.min(1, nonFormGoalCompletions / sessions) : 0;

      return {
        conversionRate,
        formCvr,
        goalCvr,
        totalConversions,
        formConversions: formLeads,
        totalLeads,
        untrackedLeads,
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
