import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  TrendingDown,
  ArrowRight,
} from "lucide-react";

export type HeroSeverity = "critical" | "high" | "medium" | "healthy";

interface SiteStatusHeroProps {
  sessions: number;
  /** Key Actions counted toward Action Rate (was: form fills). */
  keyActions: number;
  formIssueCount: number;
  hasActiveIncident: boolean;
  periodLabel: string; // e.g. "last 30 days"
}

interface HeroSpec {
  severity: HeroSeverity;
  badge: string;
  badgeTone: "destructive" | "warning" | "info" | "success";
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  primary: { label: string; to: string };
  secondary?: { label: string; to: string };
}

function formatActionRate(sessions: number, actions: number): string {
  if (!sessions) return "—";
  const pct = (actions / sessions) * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function buildSpec({
  sessions,
  keyActions,
  formIssueCount,
  hasActiveIncident,
  periodLabel,
}: SiteStatusHeroProps): HeroSpec {
  const actionRate = sessions > 0 ? (keyActions / sessions) * 100 : 0;
  const sessionsText = sessions.toLocaleString();
  const actionsText = keyActions.toLocaleString();

  // Priority 1: Site down
  if (hasActiveIncident) {
    return {
      severity: "critical",
      badge: "Site Down",
      badgeTone: "destructive",
      Icon: ShieldAlert,
      title: "Your site appears to be unavailable.",
      body: "ACTV TRKR detected an uptime issue. Resolve the incident to restore traffic and Key Actions.",
      primary: { label: "Review Uptime Issue", to: "/monitoring" },
      secondary: { label: "View Traffic Sources", to: "/performance" },
    };
  }

  // Priority 2: Form rendering issues
  if (formIssueCount > 0) {
    const formWord = formIssueCount === 1 ? "form" : "forms";
    return {
      severity: "high",
      badge: "Needs Attention",
      badgeTone: "warning",
      Icon: AlertTriangle,
      title: `ACTV TRKR found ${formIssueCount} ${formWord} that may not be rendering correctly.`,
      body: `This could be suppressing form submissions. Your site received ${sessionsText} sessions and generated ${actionsText} Key Actions in the ${periodLabel}.`,
      primary: { label: "Review Form Issues", to: "/forms/troubleshooting" },
      secondary: { label: "View Key Actions", to: "/settings?tab=goals" },
    };
  }

  // Priority 3: Low Action Activity
  if (actionRate < 0.5 && sessions >= 500) {
    return {
      severity: "medium",
      badge: "Low Action Activity",
      badgeTone: "info",
      Icon: TrendingDown,
      title: "Your site is getting traffic, but visitors are not completing many Key Actions.",
      body: `${sessionsText} sessions produced ${actionsText} Key Actions (${formatActionRate(sessions, keyActions)}) in the ${periodLabel}. Review your Key Actions to identify drop-off points.`,
      primary: { label: "Review Key Actions", to: "/settings?tab=goals" },
      secondary: { label: "View Traffic Sources", to: "/performance" },
    };
  }

  // Healthy
  return {
    severity: "healthy",
    badge: "Live",
    badgeTone: "success",
    Icon: Activity,
    title: "Your site is live, being monitored, and tracking visitor activity.",
    body: "ACTV TRKR is watching traffic, Key Actions, forms, uptime, SEO issues, and site health.",
    primary: { label: "View Insights", to: "/reports" },
    secondary: { label: "View Traffic Sources", to: "/performance" },
  };
}

const TONE_BG: Record<HeroSpec["badgeTone"], string> = {
  destructive: "border-destructive/40 bg-destructive/10",
  warning: "border-warning/40 bg-warning/10",
  info: "border-primary/40 bg-primary/10",
  success: "border-success/40 bg-success/10",
};

const TONE_BADGE: Record<HeroSpec["badgeTone"], string> = {
  destructive: "bg-destructive/20 text-destructive border-destructive/30",
  warning: "bg-warning/20 text-warning border-warning/30",
  info: "bg-primary/20 text-primary border-primary/30",
  success: "bg-success/20 text-success border-success/30",
};

const TONE_ICON: Record<HeroSpec["badgeTone"], string> = {
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-primary",
  success: "text-success",
};

export function SiteStatusHero(props: SiteStatusHeroProps) {
  const navigate = useNavigate();
  const spec = buildSpec(props);
  const Icon = spec.Icon;

  return (
    <div
      className={`glass-card p-5 md:p-6 border ${TONE_BG[spec.badgeTone]} animate-slide-up`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
        <div className={`hidden md:flex h-12 w-12 rounded-xl items-center justify-center bg-background/40 border border-border/50 ${TONE_ICON[spec.badgeTone]}`}>
          <Icon className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider ${TONE_BADGE[spec.badgeTone]}`}>
              <span className={`md:hidden ${TONE_ICON[spec.badgeTone]}`}><Icon className="h-3 w-3" /></span>
              {spec.badge}
            </span>
          </div>
          <h2 className="text-base md:text-lg font-semibold text-foreground leading-snug">
            {spec.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            {spec.body}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button
              size="sm"
              onClick={() => navigate(spec.primary.to)}
              className="gap-1.5"
            >
              {spec.primary.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            {spec.secondary && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(spec.secondary!.to)}
              >
                {spec.secondary.label}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
