import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target, Plus, ChevronDown, ChevronRight, MapPin, Clock, Info, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { GOAL_TYPES, type ConversionGoal } from "@/hooks/use-goals";
import { useForms } from "@/hooks/use-dashboard-data";
import { CreateGoalDialog } from "@/components/settings/GoalsSection";
import { useState } from "react";
import { format } from "date-fns";

interface GoalResult {
  id: string;
  name: string;
  goal_type: string;
  count: number;
}

interface CompletionDetail {
  page_url: string | null;
  page_path: string | null;
  target_text: string | null;
  completed_at: string;
  session_id: string | null;
  target_href: string | null;
}

function prettifyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Show host + readable path
    const path = u.pathname.replace(/\/$/, "");
    const slug = path.split("/").pop() || "";
    const readable = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return readable || u.hostname + path;
  } catch {
    return raw;
  }
}

function prettifyPath(path: string | null, url: string | null): string {
  const raw = path || url || "Unknown page";
  const slug = raw.replace(/^.*\//, "").replace(/\/$/, "").replace(/[-_]/g, " ");
  if (!slug) return raw;
  return slug.replace(/\b\w/g, (c) => c.toUpperCase());
}

function GoalDrillDown({ goalId, orgId, startDate, endDate }: {
  goalId: string;
  orgId: string;
  startDate: string;
  endDate: string;
}) {
  const dayStart = `${startDate}T00:00:00Z`;
  const dayEnd = `${endDate}T23:59:59.999Z`;

  const { data, isLoading } = useQuery({
    queryKey: ["goal_drilldown", goalId, orgId, startDate, endDate],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("goal_completions" as any)
        .select("page_url,page_path,target_text,completed_at,session_id,utm_source")
        .eq("org_id", orgId)
        .eq("goal_id", goalId)
        .gte("completed_at", dayStart)
        .lte("completed_at", dayEnd)
        .order("completed_at", { ascending: false })
        .limit(200);

      // goal_completions doesn't have target_href, so always use events fallback for click goals
      let completions: CompletionDetail[] = [];

      // Always pull from raw events so we get meta.target_href
      const { data: goal } = await supabase
        .from("conversion_goals" as any)
        .select("goal_type, tracking_rules")
        .eq("id", goalId)
        .single();

      if (goal) {
        const g = goal as unknown as { goal_type: string; tracking_rules: Record<string, any> };
        const CLICK_TYPES = ["cta_click", "outbound_click", "tel_click", "mailto_click"];
        const eventTypes = CLICK_TYPES.includes(g.goal_type)
          ? CLICK_TYPES
          : [g.goal_type];

        const { data: events } = await supabase
          .from("events")
          .select("page_url,page_path,target_text,occurred_at,session_id,meta")
          .eq("org_id", orgId)
          .in("event_type", eventTypes)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd)
          .order("occurred_at", { ascending: false })
          .limit(200);

        if (events) {
          const rules = g.tracking_rules || {};
          completions = (events as any[])
            .filter((evt) => {
              const text = (evt.target_text || "").toLowerCase();
              const label = String((evt.meta as any)?.target_label || "").toLowerCase();
              const href = String((evt.meta as any)?.target_href || "").toLowerCase();
              const url = (evt.page_url || "").toLowerCase();

              if (rules.text_contains) {
                const needle = String(rules.text_contains).toLowerCase();
                if (!text.includes(needle) && !label.includes(needle)) return false;
              }
              if (rules.href_contains) {
                const needle = String(rules.href_contains).toLowerCase();
                if (!href.includes(needle) && !url.includes(needle) && !text.includes(needle)) return false;
              }
              return true;
            })
            .map((evt) => ({
              page_url: evt.page_url,
              page_path: evt.page_path,
              target_text: evt.target_text,
              completed_at: evt.occurred_at,
              session_id: evt.session_id,
              target_href: (evt.meta as any)?.target_href || null,
            }));
        }
      }

      // Group by source page + destination
      const byRow: Record<string, {
        sourcePage: string;
        destination: string | null;
        destinationLabel: string;
        count: number;
        lastAt: string;
      }> = {};

      for (const c of completions) {
        const src = prettifyPath(c.page_path, c.page_url);
        const dest = c.target_href || null;
        const key = `${c.page_path || c.page_url || "?"}::${dest || "none"}`;

        if (!byRow[key]) {
          byRow[key] = {
            sourcePage: src,
            destination: dest,
            destinationLabel: dest ? prettifyUrl(dest) : "No destination captured",
            count: 0,
            lastAt: c.completed_at,
          };
        }
        byRow[key].count++;
        if (c.completed_at > byRow[key].lastAt) byRow[key].lastAt = c.completed_at;
      }

      return Object.values(byRow).sort((a, b) => b.count - a.count);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="pl-7 py-2 space-y-1">
        <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="pl-7 py-2">
        <p className="text-[11px] text-muted-foreground italic">No page-level data yet.</p>
      </div>
    );
  }

  return (
    <div className="pl-7 py-1.5 space-y-1 border-l-2 border-primary/20 ml-2">
      {data.map((row, i) => (
        <div key={i} className="flex flex-col gap-0.5 text-[11px] py-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">From:</span>
            <span className="text-foreground font-medium truncate">{row.sourcePage}</span>
            <span className="text-muted-foreground font-mono-data ml-auto flex-shrink-0">{row.count}×</span>
            <span className="text-muted-foreground flex-shrink-0 flex items-center gap-0.5 whitespace-nowrap">
              <Clock className="h-2.5 w-2.5" />
              {format(new Date(row.lastAt), "MMM d, h:mm a")}
            </span>
          </div>
          {row.destination ? (
            <div className="flex items-start gap-2 pl-5">
              <span className="text-muted-foreground">→</span>
              <a
                href={row.destination}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {row.destination}
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-5">
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground italic">No destination captured</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function GoalConversions({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
  const { t } = useTranslation();
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const { data: forms = [] } = useForms(orgId);

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

      // Click goals: also count from raw events when goal_completions is empty
      const CLICK_TYPES = ["cta_click", "outbound_click", "tel_click", "mailto_click"];
      const clickGoals = typedGoals.filter(g => CLICK_TYPES.includes(g.goal_type));
      for (const goal of clickGoals) {
        if ((countMap[goal.id] || 0) > 0) continue; // already have completions
        const rules = goal.tracking_rules || {};
        const eventTypes = CLICK_TYPES;
        const { data: events } = await supabase
          .from("events")
          .select("target_text,page_url,meta,session_id")
          .eq("org_id", orgId)
          .in("event_type", eventTypes)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd)
          .limit(1000);

        if (events) {
          // Deduplicate: count unique sessions, not raw events
          const matchedSessions = new Set<string>();
          (events as any[]).forEach((evt) => {
            const text = (evt.target_text || "").toLowerCase();
            const label = String((evt.meta as any)?.target_label || "").toLowerCase();
            const href = String((evt.meta as any)?.target_href || "").toLowerCase();
            const url = (evt.page_url || "").toLowerCase();
            if (rules.text_contains) {
              const needle = String(rules.text_contains).toLowerCase();
              if (!text.includes(needle) && !label.includes(needle)) return;
            }
            if (rules.href_contains) {
              const needle = String(rules.href_contains).toLowerCase();
              if (!href.includes(needle) && !url.includes(needle) && !text.includes(needle)) return;
            }
            matchedSessions.add(evt.session_id || evt.occurred_at);
          });
          countMap[goal.id] = (countMap[goal.id] || 0) + matchedSessions.size;
        }
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

  if (!results || results.length === 0) return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t("goals.goalCompletions")}
        </h3>
        <div className="flex items-center gap-2">
          <IconTooltip label="Tracks how many times visitors complete your defined goals — page visits, button clicks, form submissions, etc.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
          <Link to="/performance?tab=key-actions" className="text-[11px] text-primary hover:underline flex items-center gap-1">
            <Settings2 className="h-3 w-3" /> Manage Goals
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">No goals configured yet. Create a goal to start tracking conversions.</p>
      {orgId && <CreateGoalDialog orgId={orgId} forms={forms} />}
    </div>
  );

  const total = results.reduce((s, r) => s + r.count, 0);

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t("goals.goalCompletions")}
        </h3>
        <div className="flex items-center gap-2">
          <IconTooltip label="Tracks how many times visitors complete your defined goals — page visits, button clicks, form submissions, etc.">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </IconTooltip>
          <span className="text-xs font-mono-data text-muted-foreground">{total} {t("dashboard.total")}</span>
          <Link to="/performance?tab=key-actions" className="text-[11px] text-primary hover:underline flex items-center gap-1">
            <Settings2 className="h-3 w-3" /> Manage
          </Link>
        </div>
        {orgId && <CreateGoalDialog orgId={orgId} forms={forms} />}
      </div>

      <div className="space-y-2">
        {results.map((goal) => {
          const typeInfo = GOAL_TYPES.find((gt) => gt.value === goal.goal_type);
          const maxCount = results[0]?.count || 1;
          const isExpanded = expandedGoal === goal.id;
          return (
            <div key={goal.id}>
              <div className="flex items-center gap-1 group">
                <button
                  onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                  className="flex items-center gap-3 flex-1 text-left hover:bg-muted/50 rounded-md px-1 py-0.5 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm flex-shrink-0">{typeInfo?.icon || "🎯"}</span>
                  <span className="text-xs font-medium text-foreground truncate w-[35%]">{goal.name}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary/50" style={{ width: `${(goal.count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs font-mono-data text-muted-foreground w-8 text-right">{goal.count}</span>
                </button>
                <Link
                  to={`/performance?tab=key-actions&goal=${goal.id}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary hover:underline px-1.5 py-0.5"
                  title="Edit this goal"
                >
                  Edit
                </Link>
              </div>
              {isExpanded && orgId && (
                <GoalDrillDown goalId={goal.id} orgId={orgId} startDate={startDate} endDate={endDate} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
