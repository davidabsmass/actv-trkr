import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Target, ArrowRight } from "lucide-react";
import type { KeyActionBreakdownEntry } from "@/hooks/use-key-actions";

interface KeyActionBreakdownProps {
  entries: KeyActionBreakdownEntry[];
  hasConfigured: boolean;
  hasSessions: boolean;
  periodLabel: string;
}

/**
 * Displays the per-category Key Action breakdown beneath the headline KPIs.
 * Shows only categories that have data, plus contextual empty states.
 */
export function KeyActionBreakdown({
  entries,
  hasConfigured,
  hasSessions,
  periodLabel,
}: KeyActionBreakdownProps) {
  const navigate = useNavigate();

  // No Key Actions configured yet
  if (!hasConfigured) {
    return (
      <div className="glass-card p-5 animate-slide-up">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Key Action Breakdown</h3>
            </div>
            <p className="text-sm text-foreground">No Key Actions configured yet.</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Track the actions that matter most to this site, such as form submissions,
              phone clicks, email clicks, downloads, donation clicks, or booking clicks.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate("/settings?tab=goals")} className="gap-1.5">
            Set Up Key Actions
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Configured but zero completions in window
  if (entries.length === 0) {
    return (
      <div className="glass-card p-5 animate-slide-up">
        <div className="flex items-center gap-2 mb-1.5">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Key Action Breakdown</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {hasSessions
            ? `Traffic is being tracked, but no Key Actions were completed in the ${periodLabel}.`
            : `No Key Actions completed in the ${periodLabel}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Key Action Breakdown</h3>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {periodLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {entries.map((entry) => (
          <div
            key={entry.category}
            className="flex items-baseline justify-between gap-2 px-3 py-2 rounded-lg bg-background/40 border border-border/40"
            title={
              entry.countsTowardActionRate
                ? "Counts toward Action Rate"
                : "Tracked but excluded from Action Rate"
            }
          >
            <span className="text-sm text-muted-foreground truncate">{entry.label}</span>
            <span className="text-base font-bold font-mono-data text-foreground">
              {entry.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Key Actions are the meaningful actions you want visitors to take, such as
        submitting a form, clicking to call, downloading a file, or clicking a donation
        button. Only actions marked as conversions count toward your Action Rate.
      </p>
    </div>
  );
}
