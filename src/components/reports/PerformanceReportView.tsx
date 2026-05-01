import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  CheckCircle, AlertCircle, TrendingUp, TrendingDown, Minus,
  Target, BarChart3, Users, Lightbulb, Globe, Activity,
  Sparkles, FormInput, ArrowLeft,
} from "lucide-react";

const TrendBadge = ({ change }: { change: number | null }) => {
  if (change === null || change === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );
};

const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-card p-5 mb-4">
    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      {title}
    </h3>
    {children}
  </div>
);

const RankList = ({ items, maxItems = 8 }: { items: Array<{ label: string; count: number }>; maxItems?: number }) => {
  const top = (items || []).slice(0, maxItems);
  const maxCount = top[0]?.count || 1;
  return (
    <div className="space-y-3">
      {top.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0 relative h-6 rounded bg-muted/30 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-primary/15 rounded" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            <span className="relative z-10 px-2 text-xs font-medium text-foreground truncate block leading-6">{item.label}</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground shrink-0 w-10 text-right">{item.count}</span>
        </div>
      ))}
    </div>
  );
};

export function PerformanceReportView({
  report, onBack, hideHeader = false,
}: {
  report: any;
  onBack?: () => void;
  hideHeader?: boolean;
}) {
  const { t } = useTranslation();
  const { executiveSummary: es, growthEngine: ge, conversionIntelligence: ci, userExperience: ux, actionPlan: ap, siteHealth: sh, formHealth: fh, aiInsights } = report;

  return (
    <div>
      {!hideHeader && onBack && (
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t("reports.backToReports")}
        </button>
      )}
      {!hideHeader && (
        <>
          <h1 className="text-2xl font-bold text-foreground mb-1">{t("reports.performanceReport")}</h1>
          <p className="text-xs text-muted-foreground mb-6">
            {format(new Date(report.periodStart), "MMM d")} – {format(new Date(report.periodEnd), "MMM d, yyyy")} · {report.periodDays}-day period
          </p>
        </>
      )}

      {aiInsights && aiInsights.length > 0 && (
        <Section icon={Sparkles} title={t("reports.aiInsights")}>
          <div className="space-y-3">
            {aiInsights.map((insight: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-primary/5 border border-primary/10">
                <span className="text-xs font-bold text-primary mt-0.5 flex-shrink-0">{i + 1}.</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon={Target} title={t("reports.executiveSummary")}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          {[
            { label: t("reports.leads"), value: es.leads.current, change: es.leads.change },
            { label: t("reports.sessions"), value: es.sessions.current, change: es.sessions.change },
            { label: t("dashboard.pageviews"), value: es.pageviews.current, change: es.pageviews.change },
            { label: t("reports.cvr"), value: `${es.cvr.current}%`, change: es.cvr.change },
            { label: t("reports.weightedLeads"), value: es.weightedLeads, change: null },
          ].map((kpi) => (
            <div key={kpi.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{kpi.label}</p>
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              <TrendBadge change={kpi.change} />
            </div>
          ))}
        </div>
        {es.goalTarget && (
          <p className="text-xs text-muted-foreground mb-2">🎯 Monthly goal: {es.goalTarget} leads · {Math.round((es.leads.current / es.goalTarget) * 100)}% achieved</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-success/10 border border-success/20">
            <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{t("reports.keyWin")}</p>
              <p className="text-xs text-muted-foreground">{es.keyWin}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{t("reports.keyRisk")}</p>
              <p className="text-xs text-muted-foreground">{es.keyRisk}</p>
            </div>
          </div>
        </div>
      </Section>

      {sh && (
        <Section icon={Activity} title={t("reports.siteHealth")}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: t("reports.uptime"), value: `${sh.uptimePercent}%`, cls: sh.uptimePercent >= 99.5 ? "text-success" : sh.uptimePercent >= 95 ? "text-warning" : "text-destructive" },
              { label: t("reports.downtime"), value: `${sh.totalDowntimeMinutes}m` },
              { label: t("reports.incidents"), value: sh.downtimeIncidents?.length || 0 },
              { label: t("reports.brokenLinks"), value: sh.brokenLinksCount || 0 },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-md bg-muted/50">
                <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${(m as any).cls || "text-foreground"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {fh && (
        <Section icon={FormInput} title={t("reports.formHealth")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{t("reports.totalSubmissions")}</p>
              <p className="text-lg font-bold text-foreground">{fh.totalSubmissions}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{t("reports.failures")}</p>
              <p className={`text-lg font-bold ${fh.totalFailures > 0 ? "text-destructive" : "text-foreground"}`}>{fh.totalFailures}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{t("reports.failureRate")}</p>
              <p className={`text-lg font-bold ${fh.overallFailureRate > 5 ? "text-destructive" : "text-foreground"}`}>{fh.overallFailureRate}%</p>
            </div>
          </div>
        </Section>
      )}

      <Section icon={Globe} title={t("reports.growthEngine")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.trafficBySource")}</p>
            <RankList items={ge.trafficBySource} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.topLandingPages")}</p>
            <RankList items={ge.topLandingPages} />
          </div>
        </div>
      </Section>

      <Section icon={BarChart3} title={t("reports.conversionIntelligence")}>
        {ci.leadsByForm?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("reports.leadsByForm")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">{t("reports.form")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">{t("reports.category")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.weight")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.leads")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.cvr")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.failures")}</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">{t("reports.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ci.leadsByForm.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground truncate max-w-[200px]">{f.formName}</td>
                      <td className="py-2 px-3 text-muted-foreground capitalize">{f.formCategory}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{f.weight}x</td>
                      <td className="py-2 px-3 text-right text-foreground">{f.leads}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{f.cvr}%</td>
                      <td className="py-2 px-3 text-right"><span className={f.failures > 0 ? "text-destructive" : "text-muted-foreground"}>{f.failures}</span></td>
                      <td className="py-2 pl-3 text-right text-muted-foreground">${(f.totalValue || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.topConvertingPages")}</p>
            <RankList items={ci.topConvertingPages} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.leadSources")}</p>
            <RankList items={ci.leadSources} />
          </div>
        </div>
      </Section>

      <Section icon={Users} title={t("reports.userExperience")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.deviceBreakdown")}</p>
            <RankList items={ux.deviceBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.geography")}</p>
            <RankList items={ux.geoBreakdown} maxItems={10} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.topPages")}</p>
            <RankList items={(ux.topPages || []).slice(0, 10)} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{t("reports.referrers")}</p>
            <RankList items={ux.referrerBreakdown} />
          </div>
        </div>
      </Section>

      <Section icon={Lightbulb} title={t("reports.actionPlan")}>
        {ap.forecast?.projectedNextMonth > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10 mb-4">
            <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">{t("reports.leadForecast")}</p>
              <p className="text-xs text-muted-foreground">
                Avg. {ap.forecast.avgDailyLeads} leads/day · Projected next month: {Math.round(ap.forecast.projectedNextMonth * 0.9)}–{Math.round(ap.forecast.projectedNextMonth * 1.1)}
              </p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {(ap.recommendations || []).map((a: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
              <p className="text-sm text-foreground">{a}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export default PerformanceReportView;
