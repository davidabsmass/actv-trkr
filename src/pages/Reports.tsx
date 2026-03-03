import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { format, subDays, differenceInDays } from "date-fns";
import {
  FileText, Play, Clock, CheckCircle, AlertCircle, Download,
  CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight,
  ArrowLeft, TrendingUp, TrendingDown, Minus, Eye,
  Target, BarChart3, Users, Lightbulb, Globe, CalendarIcon,
  Filter, Megaphone, Activity, Shield, Link2, AlertTriangle,
  Sparkles, DollarSign, FormInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Shared sub-components ──
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
    <div className="space-y-2">
      {top.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-foreground truncate">{item.label}</span>
              <span className="text-xs text-muted-foreground ml-2">{item.count}</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Weekly Brief removed — only Monthly Performance and Campaign Report remain
// ── Campaign Report Viewer ──
function CampaignReportViewer({ report, onBack }: { report: any; onBack: () => void }) {
  const { summary, campaignBreakdown, actions } = report;
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Reports
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">Campaign Report</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {format(new Date(report.periodStart), "MMM d")} – {format(new Date(report.periodEnd), "MMM d, yyyy")} · {report.periodDays}-day period
        {report.filterSource && <span className="ml-2">· Source: {report.filterSource}</span>}
        {report.filterCampaign && <span className="ml-2">· Campaign: {report.filterCampaign}</span>}
      </p>

      <Section icon={Target} title="Overview">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Leads", value: summary.totalLeads, change: summary.leadsChange },
            { label: "Sessions", value: summary.totalSessions, change: null },
            { label: "CVR", value: `${summary.cvr}%`, change: null },
            { label: "Total Spend", value: summary.totalSpend ? `$${summary.totalSpend.toLocaleString()}` : "—", change: null },
            { label: "Overall CPL", value: summary.overallCpl ? `$${summary.overallCpl}` : "—", change: null },
          ].map((k) => (
            <div key={k.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{k.label}</p>
              <p className="text-lg font-bold text-foreground">{k.value}</p>
              <TrendBadge change={k.change} />
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Megaphone} title="Campaign Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Campaign</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Leads</th>
                {summary.previousTotalLeads !== null && <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Δ</th>}
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Sessions</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">CVR</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">Spend</th>
                <th className="py-2 pl-3 text-xs font-medium text-muted-foreground text-right">CPL</th>
              </tr>
            </thead>
            <tbody>
              {(campaignBreakdown || []).map((c: any, i: number) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4 font-medium text-foreground truncate max-w-[200px]">{c.campaign}</td>
                  <td className="py-2 px-3 text-right text-foreground">{c.leads}</td>
                  {summary.previousTotalLeads !== null && (
                    <td className="py-2 px-3 text-right"><TrendBadge change={c.leadsChange} /></td>
                  )}
                  <td className="py-2 px-3 text-right text-muted-foreground">{c.sessions}</td>
                  <td className="py-2 px-3 text-right text-muted-foreground">{c.cvr}%</td>
                  <td className="py-2 px-3 text-right text-muted-foreground">{c.spend ? `$${c.spend.toLocaleString()}` : "—"}</td>
                  <td className="py-2 pl-3 text-right text-muted-foreground">{c.cpl ? `$${c.cpl}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section icon={Lightbulb} title="Recommendations">
        <div className="space-y-2">
          {(actions || []).map((a: string, i: number) => (
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

// ── Monthly Performance Viewer ──
function MonthlyPerformanceViewer({ report, onBack }: { report: any; onBack: () => void }) {
  const { executiveSummary: es, growthEngine: ge, conversionIntelligence: ci, userExperience: ux, actionPlan: ap, siteHealth: sh, formHealth: fh, aiInsights } = report;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Reports
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">Monthly Performance Report</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {format(new Date(report.periodStart), "MMM d")} – {format(new Date(report.periodEnd), "MMM d, yyyy")} · {report.periodDays}-day period
        {report.compareMode && report.compareMode !== "none" && (
          <span className="ml-2">· vs {report.compareMode === "yoy" ? "same period last year" : "previous period"}</span>
        )}
      </p>

      {/* AI Insights */}
      {aiInsights && aiInsights.length > 0 && (
        <Section icon={Sparkles} title="AI Insights">
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

      {/* Executive Summary */}
      <Section icon={Target} title="Executive Summary">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          {[
            { label: "Leads", value: es.leads.current, change: es.leads.change },
            { label: "Sessions", value: es.sessions.current, change: es.sessions.change },
            { label: "Pageviews", value: es.pageviews.current, change: es.pageviews.change },
            { label: "CVR", value: `${es.cvr.current}%`, change: es.cvr.change },
            { label: "Weighted Leads", value: es.weightedLeads, change: null },
          ].map((kpi) => (
            <div key={kpi.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{kpi.label}</p>
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
              <p className="text-xs font-medium text-foreground">Key Win</p>
              <p className="text-xs text-muted-foreground">{es.keyWin}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Key Risk</p>
              <p className="text-xs text-muted-foreground">{es.keyRisk}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Site Health & Uptime */}
      {sh && (
        <Section icon={Activity} title="Site Health & Uptime">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Uptime</p>
              <p className={`text-lg font-bold ${sh.uptimePercent >= 99.5 ? "text-success" : sh.uptimePercent >= 95 ? "text-warning" : "text-destructive"}`}>
                {sh.uptimePercent}%
              </p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Downtime</p>
              <p className="text-lg font-bold text-foreground">{sh.totalDowntimeMinutes}m</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Incidents</p>
              <p className="text-lg font-bold text-foreground">{sh.downtimeIncidents?.length || 0}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Broken Links</p>
              <p className="text-lg font-bold text-foreground">{sh.brokenLinksCount || 0}</p>
            </div>
          </div>

          {/* Site statuses */}
          {sh.sites?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Current Status</p>
              <div className="flex flex-wrap gap-2">
                {sh.sites.map((s: any, i: number) => (
                  <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.status === "UP" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.status === "UP" ? "bg-success" : "bg-destructive"}`} />
                    {s.domain}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Downtime incidents */}
          {sh.downtimeIncidents?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Downtime Incidents</p>
              <div className="space-y-2">
                {sh.downtimeIncidents.map((inc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-sm text-foreground">{inc.domain}</span>
                      <Badge variant="outline" className="text-[10px]">{inc.durationMinutes}m</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(inc.startedAt), "MMM d, HH:mm")}
                      {inc.resolvedAt && ` → ${format(new Date(inc.resolvedAt), "HH:mm")}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Broken links */}
          {sh.topBrokenLinks?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Top Broken Links</p>
              <div className="space-y-1">
                {sh.topBrokenLinks.map((bl: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="text-foreground truncate flex-1 mr-2">{bl.url}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline">{bl.statusCode || "?"}</Badge>
                      <span className="text-muted-foreground">×{bl.occurrences}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Form Performance */}
      <Section icon={FormInput} title="Form Performance">
        {fh && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Submissions</p>
              <p className="text-lg font-bold text-foreground">{fh.totalSubmissions}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Failures</p>
              <p className={`text-lg font-bold ${fh.totalFailures > 0 ? "text-destructive" : "text-foreground"}`}>{fh.totalFailures}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Failure Rate</p>
              <p className={`text-lg font-bold ${fh.overallFailureRate > 5 ? "text-destructive" : "text-foreground"}`}>{fh.overallFailureRate}%</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Est. Pipeline</p>
              <p className="text-lg font-bold text-foreground">${(fh.totalEstimatedValue || 0).toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Form</th>
                <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-right">Leads</th>
                <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-right">Δ</th>
                <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-right">CVR</th>
                <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-right">Failures</th>
                <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(ci.leadsByForm || []).map((f: any, i: number) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4">
                    <p className="text-sm font-medium text-foreground">{f.formName}</p>
                    <p className="text-[10px] text-muted-foreground">{f.formCategory} · {f.weight}× weight{f.isPrimaryLead ? " · Primary" : ""}</p>
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-foreground">{f.leads}</td>
                  <td className="py-2 px-2 text-right"><TrendBadge change={f.change} /></td>
                  <td className="py-2 px-2 text-right text-muted-foreground">{f.cvr}%</td>
                  <td className={`py-2 px-2 text-right ${f.failures > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>{f.failures}</td>
                  <td className="py-2 px-2 text-right text-muted-foreground">{f.totalValue > 0 ? `$${f.totalValue.toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Growth Engine */}
      <Section icon={BarChart3} title="Growth Engine">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Traffic by Source</p>
            <RankList items={ge.trafficBySource} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Landing Pages</p>
            <RankList items={ge.topLandingPages} />
          </div>
        </div>
      </Section>

      {/* Conversion Intelligence */}
      <Section icon={TrendingUp} title="Conversion Intelligence">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Converting Pages</p>
            <RankList items={ci.topConvertingPages} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Lead Sources</p>
            <RankList items={ci.leadSources} />
          </div>
        </div>
      </Section>

      {/* User Experience */}
      <Section icon={Users} title="User Experience Signals">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Device Breakdown</p>
            <RankList items={ux.deviceBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Geography</p>
            <RankList items={ux.geoBreakdown} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Top Pages</p>
            <RankList items={ux.topPages} maxItems={10} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Referrers</p>
            <RankList items={ux.referrerBreakdown} />
          </div>
        </div>
      </Section>

      {/* Action Plan */}
      <Section icon={Lightbulb} title="Action Plan & Forecast">
        {ap.forecast?.projectedNextMonth > 0 && (
          <div className="p-3 rounded-md bg-primary/10 border border-primary/20 mb-4">
            <p className="text-xs font-medium text-foreground">📈 Lead Forecast</p>
            <p className="text-sm text-foreground mt-1">
              Avg. <strong>{ap.forecast.avgDailyLeads}</strong> leads/day → Projected next month: <strong>{Math.round(ap.forecast.projectedNextMonth * 0.9)}–{Math.round(ap.forecast.projectedNextMonth * 1.1)}</strong>
            </p>
          </div>
        )}
        <div className="space-y-3">
          {(ap.recommendations || []).map((rec: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
              <p className="text-sm text-foreground">{rec}</p>
            </div>
          ))}
        </div>
        {ap.contentOpportunities?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Content Opportunities (High Traffic, No Conversions)</p>
            <div className="space-y-1">
              {ap.contentOpportunities.map((o: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs py-1">
                  <span className="text-foreground truncate">{o.page}</span>
                  <span className="text-muted-foreground ml-2">{o.views} views</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
// ── Build printable HTML report ──
function buildReportHtml(report: any, run: any): string {
  const slug = report.templateSlug || "monthly_performance";
  const title = slug === "weekly_brief" ? "Weekly Brief" : slug === "campaign_report" ? "Campaign Report" : "Monthly Performance Report";
  const periodLabel = `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)} · ${report.periodDays}-day period`;

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.5; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
    .section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; page-break-inside: avoid; }
    .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; margin-bottom: 12px; border-bottom: 2px solid #6366f1; padding-bottom: 6px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .kpi-card { background: #f9fafb; border-radius: 6px; padding: 12px; }
    .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px; }
    .kpi-value { font-size: 20px; font-weight: 700; color: #1a1a2e; }
    .kpi-change { font-size: 11px; font-weight: 600; }
    .kpi-change.positive { color: #059669; }
    .kpi-change.negative { color: #dc2626; }
    .kpi-change.neutral { color: #6b7280; }
    .insight-box { padding: 10px 14px; border-radius: 6px; margin-bottom: 8px; font-size: 13px; }
    .insight-win { background: #ecfdf5; border: 1px solid #a7f3d0; }
    .insight-risk { background: #fef2f2; border: 1px solid #fecaca; }
    .rank-list { list-style: none; }
    .rank-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .rank-item:last-child { border-bottom: none; }
    .rank-label { font-weight: 500; }
    .rank-count { color: #6b7280; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .col-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: #6b7280; }
    td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
    .rec-item { padding: 6px 0; font-size: 13px; }
    .rec-num { font-weight: 700; color: #6366f1; margin-right: 8px; }
    .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print { body { padding: 20px; } .section { break-inside: avoid; } }
  `;

  let body = "";

  if (slug === "monthly_performance") {
    const es = report.executiveSummary;
    const ge = report.growthEngine;
    const ci = report.conversionIntelligence;
    const ux = report.userExperience;
    const ap = report.actionPlan;
    const sh = report.siteHealth;
    const fh = report.formHealth;

    // AI Insights
    if (report.aiInsights?.length) {
      body += renderSection("AI Insights", report.aiInsights.map((ins: any, i: number) => `<div class="rec-item"><span class="rec-num">${i + 1}.</span><strong>${esc(ins.title)}</strong><br><span style="color:#6b7280">${esc(ins.body)}</span></div>`).join(""));
    }

    body += renderSection("Executive Summary", `
      ${renderKpiGrid([
        { label: "Leads", value: es.leads.current, change: es.leads.change },
        { label: "Sessions", value: es.sessions.current, change: es.sessions.change },
        { label: "Pageviews", value: es.pageviews.current, change: es.pageviews.change },
        { label: "CVR", value: `${es.cvr.current}%`, change: es.cvr.change },
        { label: "Weighted Leads", value: es.weightedLeads, change: null },
      ])}
      <div class="insight-box insight-win">✅ <strong>Key Win:</strong> ${esc(es.keyWin)}</div>
      <div class="insight-box insight-risk">⚠️ <strong>Key Risk:</strong> ${esc(es.keyRisk)}</div>
    `);

    // Site Health
    if (sh) {
      body += renderSection("Site Health & Uptime", `
        ${renderKpiGrid([
          { label: "Uptime", value: `${sh.uptimePercent}%`, change: null },
          { label: "Downtime", value: `${sh.totalDowntimeMinutes}m`, change: null },
          { label: "Incidents", value: sh.downtimeIncidents?.length || 0, change: null },
          { label: "Broken Links", value: sh.brokenLinksCount || 0, change: null },
        ])}
        ${sh.downtimeIncidents?.length ? `<div class="col-title">Downtime Incidents</div>${sh.downtimeIncidents.map((inc: any) => `<div class="rank-item"><span class="rank-label">⚠️ ${esc(inc.domain)} (${inc.durationMinutes}m)</span><span class="rank-count">${formatDate(inc.startedAt)}</span></div>`).join("")}` : ""}
      `);
    }

    // Form Performance
    if (fh) {
      body += renderSection("Form Performance", `
        ${renderKpiGrid([
          { label: "Submissions", value: fh.totalSubmissions, change: null },
          { label: "Failures", value: fh.totalFailures, change: null },
          { label: "Failure Rate", value: `${fh.overallFailureRate}%`, change: null },
          { label: "Est. Pipeline", value: `$${(fh.totalEstimatedValue || 0).toLocaleString()}`, change: null },
        ])}
        <table>
          <thead><tr><th>Form</th><th style="text-align:right">Leads</th><th style="text-align:right">Δ</th><th style="text-align:right">CVR</th><th style="text-align:right">Failures</th><th style="text-align:right">Value</th></tr></thead>
          <tbody>${(ci.leadsByForm || []).map((f: any) => `<tr><td>${esc(f.formName)}<br><span style="font-size:11px;color:#6b7280">${esc(f.formCategory)} · ${f.weight}× weight</span></td><td style="text-align:right;font-weight:600">${f.leads}</td><td style="text-align:right">${renderChange(f.change)}</td><td style="text-align:right">${f.cvr}%</td><td style="text-align:right;${f.failures > 0 ? 'color:#dc2626' : ''}">${f.failures}</td><td style="text-align:right">${f.totalValue > 0 ? `$${f.totalValue.toLocaleString()}` : '—'}</td></tr>`).join("")}</tbody>
        </table>
      `);
    }

    body += renderSection("Growth Engine", `
      <div class="two-col">
        <div><div class="col-title">Traffic by Source</div>${renderRankList(ge.trafficBySource)}</div>
        <div><div class="col-title">Top Landing Pages</div>${renderRankList(ge.topLandingPages)}</div>
      </div>
    `);

    body += renderSection("Conversion Intelligence", `
      <div class="two-col">
        <div><div class="col-title">Top Converting Pages</div>${renderRankList(ci.topConvertingPages)}</div>
        <div><div class="col-title">Lead Sources</div>${renderRankList(ci.leadSources)}</div>
      </div>
    `);

    body += renderSection("User Experience Signals", `
      <div class="two-col">
        <div><div class="col-title">Device Breakdown</div>${renderRankList(ux.deviceBreakdown)}</div>
        <div><div class="col-title">Geography</div>${renderRankList(ux.geoBreakdown)}</div>
      </div>
      <div class="two-col" style="margin-top:16px">
        <div><div class="col-title">Top Pages</div>${renderRankList((ux.topPages || []).slice(0, 10))}</div>
        <div><div class="col-title">Referrers</div>${renderRankList(ux.referrerBreakdown)}</div>
      </div>
    `);

    body += renderSection("Action Plan & Forecast", `
      ${ap.forecast?.projectedNextMonth > 0 ? `<div class="insight-box insight-win">📈 Avg. <strong>${ap.forecast.avgDailyLeads}</strong> leads/day → Projected next month: <strong>${Math.round(ap.forecast.projectedNextMonth * 0.9)}–${Math.round(ap.forecast.projectedNextMonth * 1.1)}</strong></div>` : ""}
      ${(ap.recommendations || []).map((r: string, i: number) => `<div class="rec-item"><span class="rec-num">${i + 1}.</span>${esc(r)}</div>`).join("")}
      ${ap.contentOpportunities?.length > 0 ? `<div style="margin-top:12px"><div class="col-title">Content Opportunities</div>${(ap.contentOpportunities || []).map((o: any) => `<div class="rank-item"><span class="rank-label">${esc(o.page)}</span><span class="rank-count">${o.views} views, ${o.leads} leads</span></div>`).join("")}</div>` : ""}
    `);
  } else if (slug === "campaign_report") {
    const s = report.summary;
    body += renderSection("Overview", renderKpiGrid([
      { label: "Total Leads", value: s.totalLeads, change: s.leadsChange },
      { label: "Sessions", value: s.totalSessions, change: null },
      { label: "CVR", value: `${s.cvr}%`, change: null },
      { label: "Total Spend", value: s.totalSpend ? `$${s.totalSpend.toLocaleString()}` : "—", change: null },
      { label: "CPL", value: s.overallCpl ? `$${s.overallCpl}` : "—", change: null },
    ]));
    body += renderSection("Campaign Breakdown", `
      <table>
        <thead><tr><th>Campaign</th><th style="text-align:right">Leads</th><th style="text-align:right">Sessions</th><th style="text-align:right">CVR</th><th style="text-align:right">Spend</th><th style="text-align:right">CPL</th></tr></thead>
        <tbody>${(report.campaignBreakdown || []).map((c: any) => `<tr><td>${esc(c.campaign)}</td><td style="text-align:right">${c.leads}</td><td style="text-align:right">${c.sessions}</td><td style="text-align:right">${c.cvr}%</td><td style="text-align:right">${c.spend ? `$${c.spend.toLocaleString()}` : "—"}</td><td style="text-align:right">${c.cpl ? `$${c.cpl}` : "—"}</td></tr>`).join("")}</tbody>
      </table>
    `);
    body += renderSection("Recommendations", (report.actions || []).map((a: string, i: number) => `<div class="rec-item"><span class="rec-num">${i + 1}.</span>${esc(a)}</div>`).join(""));
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>
    <h1>${esc(title)}</h1>
    <div class="subtitle">${esc(periodLabel)}${report.compareMode && report.compareMode !== "none" ? ` · vs ${report.compareMode === "yoy" ? "same period last year" : "previous period"}` : ""}</div>
    ${body}
    <div class="footer">Generated ${formatDate(report.generatedAt)} · Print this page (Ctrl+P / ⌘P) to save as PDF</div>
  </body></html>`;
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; }
}

function esc(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderSection(title: string, content: string): string {
  return `<div class="section"><div class="section-title">${esc(title)}</div>${content}</div>`;
}

function renderKpiGrid(kpis: Array<{ label: string; value: any; change: number | null }>): string {
  return `<div class="kpi-grid">${kpis.map(k => `<div class="kpi-card"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.value}</div>${renderChange(k.change)}</div>`).join("")}</div>`;
}

function renderChange(change: number | null): string {
  if (change === null || change === undefined) return "";
  const cls = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const prefix = change > 0 ? "+" : "";
  return `<div class="kpi-change ${cls}">${prefix}${change}%</div>`;
}

function renderRankList(items: Array<{ label: string; count: number }>): string {
  return `<ul class="rank-list">${(items || []).slice(0, 10).map(i => `<li class="rank-item"><span class="rank-label">${esc(i.label)}</span><span class="rank-count">${i.count.toLocaleString()}</span></li>`).join("")}</ul>`;
}

// ── Report Viewer Router ──
function ReportViewer({ report, onBack }: { report: any; onBack: () => void }) {
  const slug = report.templateSlug || "monthly-performance";
  if (slug === "campaign-report") return <CampaignReportViewer report={report} onBack={onBack} />;
  if (slug === "campaign-report") return <CampaignReportViewer report={report} onBack={onBack} />;
  return <MonthlyPerformanceViewer report={report} onBack={onBack} />;
}

// ── Main Reports Page ──
export default function Reports() {
  const { orgId, orgName } = useOrg();
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ template: "", frequency: "weekly", runDayOfMonth: 1 });
  const [viewingReport, setViewingReport] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [compareMode, setCompareMode] = useState<string>("none");
  const [filterSource, setFilterSource] = useState<string>("");
  const [filterCampaign, setFilterCampaign] = useState<string>("");

  const { data: templates } = useQuery({
    queryKey: ["report_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["report_runs", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("report_runs").select("*").eq("org_id", orgId)
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      return data?.some((r) => r.status === "queued" || r.status === "running") ? 3000 : false;
    },
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ["report_schedules", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("report_schedules").select("*").eq("org_id", orgId)
        .order("frequency", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const generateReport = useMutation({
    mutationFn: async (templateSlug: string) => {
      if (!orgId || !session?.user.id) throw new Error("Not authenticated");
      const periodDays = differenceInDays(dateTo, dateFrom) || 30;
      const params: Record<string, any> = {
        period_days: periodDays,
        start_date: format(dateFrom, "yyyy-MM-dd"),
        end_date: format(dateTo, "yyyy-MM-dd"),
        compare_mode: compareMode,
      };
      if (filterSource.trim()) params.filter_source = filterSource.trim();
      if (filterCampaign.trim()) params.filter_campaign = filterCampaign.trim();

      const { data: inserted, error } = await supabase.from("report_runs").insert({
        org_id: orgId, template_slug: templateSlug, created_by: session.user.id,
        params, status: "queued",
      }).select("id").single();
      if (error) throw error;

      supabase.functions.invoke("process-report", {
        body: { run_id: inserted.id },
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_runs"] });
      toast.success("Report generation started");
    },
    onError: (err: any) => toast.error(err.message || "Failed to generate report"),
  });

  const viewReport = async (run: any) => {
    if (!run.file_path) return;
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const resp = await fetch(data.signedUrl);
      const report = await resp.json();
      setViewingReport(report);
    } catch {
      toast.error("Failed to load report");
    }
  };

  const downloadReport = async (run: any) => {
    if (!run.file_path) return;
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(run.file_path, 60);
      if (error) throw error;
      const resp = await fetch(data.signedUrl);
      const report = await resp.json();
      const { buildReportPdf } = await import("@/lib/report-pdf");
      const doc = buildReportPdf(report, run);
      doc.save(`report-${format(new Date(run.created_at), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF report downloaded");
    } catch {
      toast.error("Failed to download report");
    }
  };

  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.from("report_schedules").insert({
        org_id: orgId, template_slug: newSchedule.template, frequency: newSchedule.frequency,
        run_day_of_month: newSchedule.frequency === "monthly" ? newSchedule.runDayOfMonth : 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      toast.success("Schedule created");
      setScheduleOpen(false);
      setNewSchedule({ template: "", frequency: "weekly", runDayOfMonth: 1 });
    },
    onError: (err: any) => toast.error(err.message || "Failed to create schedule"),
  });

  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editRunDay, setEditRunDay] = useState<number>(1);

  const toggleSchedule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("report_schedules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report_schedules"] }),
    onError: (err: any) => toast.error(err.message || "Failed to update schedule"),
  });

  const updateScheduleDay = useMutation({
    mutationFn: async ({ id, day }: { id: string; day: number }) => {
      const { error } = await supabase.from("report_schedules").update({ run_day_of_month: day }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      setEditingScheduleId(null);
      toast.success("Schedule updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update schedule"),
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report_schedules"] });
      toast.success("Schedule deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete schedule"),
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      case "running": return <Play className="h-3.5 w-3.5 text-primary animate-pulse" />;
      case "succeeded":
      case "completed": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "failed":
      case "error": return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const templateName = (slug: string) => templates?.find((t) => t.slug === slug)?.name || slug;

  const dayLabel = (d: number) => {
    if (d === 0) return "First day of month";
    if (d === -1) return "Last day of month";
    return d === 1 ? "1st" : d === 2 ? "2nd" : d === 3 ? "3rd" : d === 21 ? "21st" : d === 22 ? "22nd" : d === 23 ? "23rd" : `${d}th`;
  };

  const dayOptions = [
    { value: "0", label: "First day of month" },
    { value: "-1", label: "Last day of month" },
    ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: dayLabel(i + 1) })),
  ];

  const showCampaignFilters = selectedTemplate === "campaign-report";

  if (viewingReport) {
    return <ReportViewer report={viewingReport} onBack={() => setViewingReport(null)} />;
  }

  return (
    <div>
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>
      <h1 className="text-2xl font-bold text-foreground mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-6">Generate reports for {orgName}</p>

      {/* Generate Report */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Generate a Report
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a report template" />
              </SelectTrigger>
              <SelectContent>
                {(templates || []).map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={compareMode} onValueChange={setCompareMode}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="previous">vs Previous Period</SelectItem>
                <SelectItem value="yoy">vs Same Period Last Year</SelectItem>
                <SelectItem value="none">No Comparison</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Campaign/Source filters — shown for all templates but especially useful for campaign */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Filter by UTM source (optional)"
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Megaphone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Filter by campaign (optional)"
                value={filterCampaign}
                onChange={(e) => setFilterCampaign(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "MMM d, yyyy") : "Start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} disabled={(d) => d > dateTo || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "MMM d, yyyy") : "End date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} disabled={(d) => d < dateFrom || d > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              {[7, 14, 30, 60, 90].map((days) => (
                <Button key={days} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => { setDateFrom(subDays(new Date(), days)); setDateTo(new Date()); }}>
                  {days}d
                </Button>
              ))}
            </div>
            <Button
              className="sm:ml-auto"
              onClick={() => selectedTemplate && generateReport.mutate(selectedTemplate)}
              disabled={!selectedTemplate || generateReport.isPending}
            >
              {generateReport.isPending ? "Generating…" : "Generate Report"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Analyzing {differenceInDays(dateTo, dateFrom)} days: {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")}
            {compareMode !== "none" && <span> · Comparing {compareMode === "yoy" ? "year-over-year" : "to previous period"}</span>}
          </p>
        </div>
      </div>

      {/* Scheduled Reports */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Scheduled Reports
          </h3>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Report Schedule</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
                  <Select value={newSchedule.frequency} onValueChange={(v) => {
                    const autoTemplate = v === "monthly"
                      ? (templates || []).find((t) => t.slug.includes("monthly") || t.name.toLowerCase().includes("monthly"))?.slug || newSchedule.template
                      : (templates || []).find((t) => t.slug.includes("weekly") || t.name.toLowerCase().includes("weekly"))?.slug || newSchedule.template;
                    setNewSchedule((s) => ({ ...s, frequency: v, template: autoTemplate }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Template</label>
                  <Select value={newSchedule.template} onValueChange={(v) => setNewSchedule((s) => ({ ...s, template: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>
                      {(templates || []).map((t) => (
                        <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newSchedule.frequency === "monthly" && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Day of Month</label>
                    <Select value={String(newSchedule.runDayOfMonth)} onValueChange={(v) => setNewSchedule((s) => ({ ...s, runDayOfMonth: parseInt(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dayOptions.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Report will run on this day each month</p>
                  </div>
                )}
                <Button className="w-full" disabled={!newSchedule.template || createSchedule.isPending} onClick={() => createSchedule.mutate()}>
                  {createSchedule.isPending ? "Creating…" : "Create Schedule"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {schedulesLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading schedules…</div>
        ) : !schedules || schedules.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No scheduled reports yet. Click "Add Schedule" to set up weekly or monthly reports.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className={`h-4 w-4 ${s.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{templateName(s.template_slug)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.frequency === "weekly" ? "Every week" : `Every month · ${dayLabel(s.run_day_of_month)}`} at {s.run_at_local_time} ({s.timezone})
                      {s.last_run_at && ` · Last run ${format(new Date(s.last_run_at), "MMM d")}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.frequency === "monthly" && editingScheduleId === s.id ? (
                    <div className="flex items-center gap-2">
                      <Select value={String(editRunDay)} onValueChange={(v) => setEditRunDay(parseInt(v))}>
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dayOptions.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 text-xs" disabled={updateScheduleDay.isPending} onClick={() => updateScheduleDay.mutate({ id: s.id, day: editRunDay })}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditingScheduleId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Badge variant="outline" className={`text-[10px] uppercase ${s.frequency === "weekly" ? "text-info border-info/20" : "text-primary border-primary/20"}`}>
                        {s.frequency}
                      </Badge>
                      {s.frequency === "monthly" && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setEditingScheduleId(s.id); setEditRunDay(s.run_day_of_month); }}>
                          <CalendarIcon className="h-3 w-3" /> Edit Day
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSchedule.mutate({ id: s.id, enabled: !s.enabled })} title={s.enabled ? "Disable" : "Enable"}>
                    {s.enabled ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteSchedule.mutate(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report History */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Report History</h3>
        </div>
        {runsLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading reports…</div>
        ) : !runs || runs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No reports generated yet. Select a template above to create your first report.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {statusIcon(run.status)}
                  <div>
                    <p className="text-sm font-medium text-foreground">{templateName(run.template_slug)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(run.created_at), "MMM d, yyyy 'at' HH:mm")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${
                      run.status === "succeeded" || run.status === "completed" ? "text-success border-success/20" :
                      run.status === "running" ? "text-primary border-primary/20" :
                      run.status === "failed" || run.status === "error" ? "text-destructive border-destructive/20" :
                      "text-muted-foreground"
                    }`}
                  >
                    {run.status === "succeeded" ? "completed" : run.status}
                  </Badge>
                  {(run.status === "succeeded" || run.status === "completed") && run.file_path && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewReport(run)} title="View Report">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadReport(run)} title="Download Report">
                        <Download className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {(run.status === "failed" || run.status === "error") && run.error && (
                    <span className="text-xs text-destructive max-w-[200px] truncate" title={run.error}>{run.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
