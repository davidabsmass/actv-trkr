import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Key Actions are the meaningful visitor actions a site owner wants to track
 * as success events: form submissions, phone clicks, email clicks, important
 * button clicks, donation clicks, booking clicks, downloads, checkout, custom.
 *
 * Internally we reuse the existing `conversion_goals` schema:
 *  - `is_active = true`        → tracked
 *  - `is_conversion = true`    → counts toward Action Rate (the
 *                                "include_in_action_rate" flag in spec)
 *  - `goal_type`               → category (form_submission, tel_click, ...)
 *
 * Counts come from:
 *  - `goal_completions`        → first-class completions
 *  - `leads`                   → for `form_submission` goals (or all leads when
 *                                no form-submission goal exists)
 *  - `events`                  → fallback for click goals when no completion
 *                                rows exist yet
 *
 * Returns the total of *Action-Rate-eligible* Key Actions plus a breakdown
 * grouped by category so the UI can render "Form Submissions: 3, Phone
 * Clicks: 8, ..." below the headline metric.
 */

export type KeyActionCategory =
  | "form_submission"
  | "phone_click"
  | "email_click"
  | "button_click"
  | "link_click"
  | "download"
  | "donation_click"
  | "booking_click"
  | "checkout_action"
  | "custom_event";

export interface KeyActionBreakdownEntry {
  category: KeyActionCategory;
  label: string;
  count: number;
  countsTowardActionRate: boolean;
}

export interface KeyActionsResult {
  /** Total Key Actions that count toward Action Rate (in window). */
  totalActionRate: number;
  /** Total of every tracked Key Action (incl. non-Action-Rate ones). */
  totalAll: number;
  /** Per-category breakdown, sorted desc by count. */
  breakdown: KeyActionBreakdownEntry[];
  /** True if the org has any active Key Actions configured. */
  hasConfigured: boolean;
}

const CATEGORY_LABEL: Record<KeyActionCategory, string> = {
  form_submission: "Form Submissions",
  phone_click: "Phone Clicks",
  email_click: "Email Clicks",
  button_click: "Button Clicks",
  link_click: "Link Clicks",
  download: "Downloads",
  donation_click: "Donation Clicks",
  booking_click: "Booking Clicks",
  checkout_action: "Checkout Actions",
  custom_event: "Custom Actions",
};

/** Map raw `goal_type` values to a customer-facing category. */
function categoryFor(goalType: string): KeyActionCategory {
  switch (goalType) {
    case "form_submission":
      return "form_submission";
    case "tel_click":
      return "phone_click";
    case "mailto_click":
      return "email_click";
    case "cta_click":
      return "button_click";
    case "outbound_click":
      return "link_click";
    case "download":
      return "download";
    case "donation_click":
      return "donation_click";
    case "booking_click":
      return "booking_click";
    case "checkout_action":
    case "purchase":
      return "checkout_action";
    default:
      return "custom_event";
  }
}

const CLICK_EVENT_TYPES = ["cta_click", "outbound_click", "tel_click", "mailto_click"];

export function useKeyActions(
  orgId: string | null,
  startDate: string,
  endDate: string,
  installCutoff?: string | null,
) {
  return useQuery<KeyActionsResult>({
    queryKey: ["key_actions_overview", orgId, startDate, endDate, installCutoff || null],
    queryFn: async (): Promise<KeyActionsResult> => {
      const empty: KeyActionsResult = {
        totalActionRate: 0,
        totalAll: 0,
        breakdown: [],
        hasConfigured: false,
      };
      if (!orgId) return empty;

      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;
      const leadsLowerBound =
        installCutoff && new Date(installCutoff) > new Date(dayStart)
          ? installCutoff
          : dayStart;
      const windowEntirelyBeforeInstall =
        installCutoff && new Date(installCutoff) > new Date(dayEnd);

      // 1. Active Key Actions configured for this org
      const { data: goalsRaw } = await supabase
        .from("conversion_goals" as any)
        .select("id,name,goal_type,tracking_rules,is_conversion")
        .eq("org_id", orgId)
        .eq("is_active", true);

      const goals = (goalsRaw || []) as Array<{
        id: string;
        name: string;
        goal_type: string;
        tracking_rules: Record<string, any> | null;
        is_conversion: boolean;
      }>;

      // Per-goal count map
      const countByGoal: Record<string, number> = {};

      // 2. Completions table (covers everything tracker has logged as a goal)
      if (goals.length > 0) {
        const { data: completions } = await supabase
          .from("goal_completions" as any)
          .select("goal_id")
          .eq("org_id", orgId)
          .gte("completed_at", dayStart)
          .lte("completed_at", dayEnd);
        (completions || []).forEach((row: any) => {
          countByGoal[row.goal_id] = (countByGoal[row.goal_id] || 0) + 1;
        });
      }

      // 3. Form-submission goals: count from leads (post-install)
      const formGoals = goals.filter((g) => g.goal_type === "form_submission");
      for (const g of formGoals) {
        if (windowEntirelyBeforeInstall) {
          countByGoal[g.id] = countByGoal[g.id] || 0;
          continue;
        }
        const rules = g.tracking_rules || {};
        let q = supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", leadsLowerBound)
          .lte("submitted_at", dayEnd);
        if (rules.form_id && rules.form_id !== "all") {
          q = q.eq("form_id", rules.form_id);
        }
        const { count } = await q;
        countByGoal[g.id] = count || 0;
      }

      // 4. Click goals: fallback to raw events when completions missing
      const clickGoals = goals.filter((g) =>
        ["cta_click", "outbound_click", "tel_click", "mailto_click"].includes(g.goal_type),
      );
      const needsClickFallback = clickGoals.some((g) => !countByGoal[g.id]);
      if (needsClickFallback) {
        const { data: events } = await supabase
          .from("events")
          .select("event_type,target_text,meta,session_id,occurred_at")
          .eq("org_id", orgId)
          .in("event_type", CLICK_EVENT_TYPES)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd)
          .limit(2000);
        for (const g of clickGoals) {
          if (countByGoal[g.id]) continue;
          const rules = g.tracking_rules || {};
          const matched = new Set<string>();
          (events || []).forEach((evt: any) => {
            if (evt.event_type !== g.goal_type) return;
            const text = String(evt.target_text || "").toLowerCase();
            const label = String(evt.meta?.target_label || "").toLowerCase();
            const href = String(evt.meta?.target_href || "").toLowerCase();
            if (rules.text_contains) {
              const needle = String(rules.text_contains).toLowerCase();
              if (!text.includes(needle) && !label.includes(needle)) return;
            }
            if (rules.href_contains) {
              const needle = String(rules.href_contains).toLowerCase();
              if (!href.includes(needle) && !text.includes(needle)) return;
            }
            matched.add(evt.session_id || evt.occurred_at);
          });
          countByGoal[g.id] = matched.size;
        }
      }

      // 5. If no form_submission Key Action exists, surface raw form
      //    submissions as an implicit Key Action so the breakdown still
      //    feels truthful to the customer.
      const hasFormGoal = formGoals.length > 0;
      let implicitFormFills = 0;
      if (!hasFormGoal && !windowEntirelyBeforeInstall) {
        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .neq("status", "trashed")
          .gte("submitted_at", leadsLowerBound)
          .lte("submitted_at", dayEnd);
        implicitFormFills = count || 0;
      }

      // 6. Build category breakdown
      const buckets: Record<
        KeyActionCategory,
        { count: number; countsTowardActionRate: boolean }
      > = {} as any;

      goals.forEach((g) => {
        const cat = categoryFor(g.goal_type);
        const c = countByGoal[g.id] || 0;
        if (!buckets[cat]) buckets[cat] = { count: 0, countsTowardActionRate: false };
        buckets[cat].count += c;
        if (g.is_conversion) buckets[cat].countsTowardActionRate = true;
      });

      if (implicitFormFills > 0) {
        if (!buckets.form_submission) {
          buckets.form_submission = { count: 0, countsTowardActionRate: true };
        }
        buckets.form_submission.count += implicitFormFills;
        buckets.form_submission.countsTowardActionRate = true;
      }

      const breakdown: KeyActionBreakdownEntry[] = (
        Object.entries(buckets) as Array<[KeyActionCategory, { count: number; countsTowardActionRate: boolean }]>
      )
        .filter(([, v]) => v.count > 0)
        .map(([category, v]) => ({
          category,
          label: CATEGORY_LABEL[category],
          count: v.count,
          countsTowardActionRate: v.countsTowardActionRate,
        }))
        .sort((a, b) => b.count - a.count);

      // 7. Totals
      let totalActionRate = 0;
      let totalAll = 0;
      goals.forEach((g) => {
        const c = countByGoal[g.id] || 0;
        totalAll += c;
        if (g.is_conversion) totalActionRate += c;
      });
      if (implicitFormFills > 0) {
        totalAll += implicitFormFills;
        totalActionRate += implicitFormFills;
      }

      return {
        totalActionRate,
        totalAll,
        breakdown,
        hasConfigured: goals.length > 0 || implicitFormFills > 0,
      };
    },
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
