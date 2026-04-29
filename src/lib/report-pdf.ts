import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { renderSectionsToPdf } from "./pdf-section-renderer";

/**
 * Renders a report data object into a hidden DOM container that mirrors
 * the in-browser MonthlyPerformanceViewer, captures it with html2canvas
 * per-section, and places sections across A4 pages in a jsPDF document.
 */

// ── helpers ──

function safe(s: any): string {
  return String(s ?? "").trim();
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function changeHtml(change: number | null): string {
  if (change === null || change === undefined) return "";
  const color = change > 0 ? "#21c45d" : change < 0 ? "#ec3636" : "#6b6f80";
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "–";
  return `<span style="color:${color};font-size:11px;font-weight:600">${arrow} ${change > 0 ? "+" : ""}${change}%</span>`;
}

// ── Build the HTML string that mirrors MonthlyPerformanceViewer ──

interface WhiteLabelConfig {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  client_name?: string;
  logo_url?: string;
  hide_actv_branding?: boolean;
}

export interface ReportTemplateSection {
  key: string;
  enabled: boolean;
  metrics: Array<{ key: string; enabled: boolean }>;
}

function isSectionEnabled(tpl: ReportTemplateSection[] | null | undefined, key: string): boolean {
  if (!tpl || tpl.length === 0) return true;
  const s = tpl.find((t) => t.key === key);
  return s ? s.enabled : true;
}

function isMetricEnabled(tpl: ReportTemplateSection[] | null | undefined, sectionKey: string, metricKey: string): boolean {
  if (!tpl || tpl.length === 0) return true;
  const s = tpl.find((t) => t.key === sectionKey);
  if (!s) return true;
  if (!s.enabled) return false;
  const m = s.metrics.find((mt) => mt.key === metricKey);
  return m ? m.enabled : true;
}

function buildReportHtml(report: any, wl?: WhiteLabelConfig | null, tpl?: ReportTemplateSection[] | null): string {
  const brandPrimary = wl?.primary_color || "#635bff";
  const brandSecondary = wl?.secondary_color || "#9449e0";
  const brandGradientStart = wl?.primary_color || "#6d5dd4";
  // If a logo is uploaded, the logo IS the brand identity — no text name.
  // Otherwise show the client name (when branding is hidden) or ACTV TRKR.
  const brandName = wl?.logo_url
    ? ""
    : wl?.hide_actv_branding
      ? (wl?.client_name || "")
      : "ACTV TRKR";
  const brandAccent = wl?.accent_color || brandPrimary;
  const es = report.executiveSummary;
  const ge = report.growthEngine;
  const ci = report.conversionIntelligence;
  const ux = report.userExperience;
  const ap = report.actionPlan;
  const sh = report.siteHealth;
  const fh = report.formHealth;
  const aiInsights = report.aiInsights;

  const periodLabel = `${fmtDate(report.periodStart)} – ${fmtDate(report.periodEnd)} · ${report.periodDays}-day period`;

  const kpiCard = (label: string, value: any, change: number | null) => `
    <div style="flex:1;min-width:100px;background:#f5f5fa;border-radius:8px;padding:12px 14px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:4px;font-weight:600">${safe(label)}</div>
      <div style="font-size:20px;font-weight:700;color:#00264d">${safe(String(value))}</div>
      ${changeHtml(change)}
    </div>`;

  const sectionStart = (icon: string, title: string) => `
    <div data-pdf-section style="border:1px solid #e4e6ed;border-radius:8px;background:#fff;padding:20px;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid;font-family:Helvetica,Arial,'Segoe UI',sans-serif">
      <div style="font-size:13px;font-weight:600;color:#00264d;margin-bottom:14px;display:flex;align-items:center;gap:6px;font-family:Helvetica,Arial,'Segoe UI',sans-serif">
        <span style="color:${brandPrimary}">${icon}</span> ${safe(title)}
      </div>`;
  const sectionEnd = `</div>`;

  const rankList = (items: Array<{ label: string; count: number }>, max = 8) => {
    const top = (items || []).slice(0, max);
    const maxCount = top[0]?.count || 1;
    return top
      .map((item, i) => {
        const widthPct = Math.max(0, Math.min(100, (item.count / maxCount) * 100));
        return `
      <div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:12px;color:#6b6f80;width:20px;text-align:right;flex-shrink:0">${i + 1}</span>
          <div style="position:relative;flex:1;min-width:0;height:24px;border-radius:6px;background:rgba(228,230,237,0.45);overflow:hidden">
            <div style="position:absolute;inset:0 auto 0 0;height:100%;background:${brandPrimary}26;border-radius:6px;width:${widthPct}%"></div>
            <span style="position:relative;z-index:1;display:flex;align-items:center;padding:0 8px;font-size:12px;font-weight:500;color:#00264d;height:24px;transform:translateY(-5px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safe(item.label)}</span>
          </div>
          <span style="font-size:12px;color:#6b6f80;flex-shrink:0;width:40px;text-align:right;font-variant-numeric:tabular-nums">${fmtNum(item.count)}</span>
            </div>
          </div>
      </div>`;
      })
      .join("");
  };

  // Header section gets its own data-pdf-section
  let html = `
<div style="font-family:Helvetica,Arial,'Segoe UI',sans-serif;color:#00264d;width:680px;padding:0;background:#fff">
  <div data-pdf-section style="background:linear-gradient(135deg,${brandGradientStart},${brandSecondary});padding:24px 28px;border-radius:8px 8px 0 0;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      ${wl?.logo_url ? `<img src="${wl.logo_url}" style="height:36px;max-width:180px;object-fit:contain;filter:brightness(0) invert(1);opacity:1" crossorigin="anonymous" />` : ''}
      ${brandName ? `<span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.02em">${brandName}</span>` : ''}
      <span style="font-size:10px;color:rgba(255,255,255,0.8)">Activity Report</span>
    </div>
    <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:6px">Performance Report</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.85)">${safe(periodLabel)}</div>
  </div>`;

  // ── Section renderers keyed by section key ──
  const me = (sk: string, mk: string) => isMetricEnabled(tpl, sk, mk);

  const sectionRenderers: Record<string, () => string> = {
    aiInsights: () => {
      if (!aiInsights?.length || !me("aiInsights", "insights_list")) return "";
      let s = sectionStart("✦", "AI Insights");
      aiInsights.forEach((ins: any, i: number) => {
        s += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:6px;background:${brandPrimary}0d;border:1px solid ${brandPrimary}1a;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;color:${brandPrimary};flex-shrink:0">${i + 1}.</span>
          <div><div style="font-size:12px;font-weight:600;color:#00264d">${safe(ins.title)}</div>
          <div style="font-size:11px;color:#6b6f80;margin-top:2px">${safe(ins.body)}</div></div></div>`;
      });
      return s + sectionEnd;
    },

    executiveSummary: () => {
      let s = sectionStart("◎", "Executive Summary");
      s += `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">`;
      if (me("executiveSummary", "leads")) s += kpiCard("Leads", es.leads.current, es.leads.change);
      if (me("executiveSummary", "sessions")) s += kpiCard("Sessions", fmtNum(es.sessions.current), es.sessions.change);
      if (me("executiveSummary", "pageviews")) s += kpiCard("Pageviews", fmtNum(es.pageviews.current), es.pageviews.change);
      if (me("executiveSummary", "cvr")) s += kpiCard("Action Rate", `${es.cvr.current}%`, es.cvr.change);
      if (me("executiveSummary", "weightedLeads") && es.weightedLeads) s += kpiCard("Weighted Leads", es.weightedLeads, null);
      s += `</div>`;
      if (me("executiveSummary", "goal") && es.goalTarget) {
        const pct = Math.round((es.leads.current / es.goalTarget) * 100);
        s += `<div style="font-size:11px;color:#6b6f80;margin-bottom:10px">🎯 Monthly target: ${es.goalTarget} form submissions · ${pct}% achieved</div>`;
      }
      s += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">`;
      if (me("executiveSummary", "keyWin")) {
        s += `<div style="padding:10px 12px;border-radius:6px;background:rgba(33,196,93,0.08);border:1px solid rgba(33,196,93,0.15)">
          <div style="font-size:11px;font-weight:600;color:#00264d;margin-bottom:2px">✓ Key Win</div>
          <div style="font-size:11px;color:#6b6f80">${safe(es.keyWin)}</div></div>`;
      }
      if (me("executiveSummary", "keyRisk")) {
        s += `<div style="padding:10px 12px;border-radius:6px;background:rgba(236,54,54,0.06);border:1px solid rgba(236,54,54,0.12)">
          <div style="font-size:11px;font-weight:600;color:#00264d;margin-bottom:2px">⚠ Key Risk</div>
          <div style="font-size:11px;color:#6b6f80">${safe(es.keyRisk)}</div></div>`;
      }
      s += `</div>`;
      return s + sectionEnd;
    },

    siteHealth: () => {
      if (!sh) return "";
      let s = sectionStart("⚡", "Site Health & Uptime");
      s += `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">`;
      if (me("siteHealth", "uptime")) s += kpiCard("Uptime", `${sh.uptimePercent}%`, null);
      if (me("siteHealth", "downtime")) s += kpiCard("Downtime", `${sh.totalDowntimeMinutes || 0}m`, null);
      if (me("siteHealth", "incidents")) s += kpiCard("Incidents", sh.downtimeIncidents?.length || 0, null);
      if (me("siteHealth", "brokenLinks")) s += kpiCard("Broken Links", sh.brokenLinksCount || 0, null);
      s += `</div>`;
      if (sh.sites?.length > 0) {
        s += `<div style="margin-bottom:10px"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:6px">Current Status</div><div style="display:flex;flex-wrap:wrap;gap:6px">`;
        sh.sites.forEach((si: any) => {
          const col = si.status === "UP" ? "#21c45d" : "#ec3636";
          s += `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:500;background:${col}15;color:${col}">
            <span style="width:5px;height:5px;border-radius:50%;background:${col}"></span>${safe(si.domain)}</span>`;
        });
        s += `</div></div>`;
      }
      if (me("siteHealth", "incidents") && sh.downtimeIncidents?.length > 0) {
        s += `<div style="margin-bottom:8px"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:6px">Downtime Incidents</div>`;
        sh.downtimeIncidents.forEach((inc: any) => {
          s += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e4e6ed">
            <span style="font-size:11px;color:#00264d">▲ ${safe(inc.domain || "Site")}</span>
            <span style="font-size:11px;color:#6b6f80">${inc.durationMinutes}m · ${fmtDate(inc.startedAt)}</span></div>`;
        });
        s += `</div>`;
      }
      if (me("siteHealth", "ssl") && sh.sslExpiry?.length > 0) {
        s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:6px">SSL & Domain</div><div style="display:flex;flex-wrap:wrap;gap:10px">`;
        sh.sslExpiry.forEach((si: any) => {
          const col = si.daysLeft <= 14 ? "#ec3636" : si.daysLeft <= 30 ? "#f59e0b" : "#6b6f80";
          s += `<span style="font-size:11px;color:#00264d">🔒 ${safe(si.domain)} <span style="color:${col}">SSL: ${si.daysLeft}d left</span></span>`;
        });
        s += `</div></div>`;
      }
      return s + sectionEnd;
    },

    formHealth: () => {
      if (!fh) return "";
      let s = sectionStart("📋", "Form Health");
      s += `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">`;
      if (me("formHealth", "totalSubmissions")) s += kpiCard("Total Submissions", fmtNum(fh.totalSubmissions || 0), null);
      if (me("formHealth", "failures")) s += kpiCard("Failures", fh.totalFailures || 0, null);
      if (me("formHealth", "failureRate")) s += kpiCard("Failure Rate", `${fh.overallFailureRate || 0}%`, null);
      s += `</div>`;
      return s + sectionEnd;
    },

    growthEngine: () => {
      let s = sectionStart("🌐", "Growth Engine");
      s += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">`;
      if (me("growthEngine", "trafficBySource")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Traffic by Source</div>${rankList(ge.trafficBySource)}</div>`;
      if (me("growthEngine", "topLandingPages")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Top Landing Pages</div>${rankList(ge.topLandingPages)}</div>`;
      s += `</div>`;
      return s + sectionEnd;
    },

    conversionIntelligence: () => {
      let s = sectionStart("📊", "Conversion Intelligence");
      if (me("conversionIntelligence", "leadsByForm") && ci.leadsByForm?.length > 0) {
        s += `<div style="margin-bottom:16px"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:8px">Leads by Form</div>`;
        s += `<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:Helvetica,Arial,'Segoe UI',sans-serif">
          <thead><tr style="border-bottom:1px solid #e4e6ed;text-align:left">
            <th style="padding:6px 8px 6px 0;font-weight:500;color:#6b6f80">Form</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80">Category</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Weight</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Leads</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Action Rate</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Failures</th>
            </tr></thead><tbody>`;
        ci.leadsByForm.forEach((f: any) => {
          const failColor = f.failures > 0 ? "color:#ec3636" : "color:#6b6f80";
          s += `<tr style="border-bottom:1px solid rgba(228,230,237,0.5)">
            <td style="padding:6px 8px 6px 0;font-weight:500;color:#00264d;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safe(f.formName)}</td>
            <td style="padding:6px 8px;color:#6b6f80;text-transform:capitalize">${safe(f.formCategory)}</td>
            <td style="padding:6px 8px;color:#6b6f80;text-align:right">${f.weight}x</td>
            <td style="padding:6px 8px;color:#00264d;text-align:right">${f.leads}</td>
            <td style="padding:6px 8px;color:#6b6f80;text-align:right">${f.cvr}%</td>
            <td style="padding:6px 8px;text-align:right;${failColor}">${f.failures}</td></tr>`;
        });
        s += `</tbody></table></div>`;
      }
      s += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">`;
      if (me("conversionIntelligence", "topConvertingPages")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Top Converting Pages</div>${rankList(ci.topConvertingPages)}</div>`;
      if (me("conversionIntelligence", "leadSources")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Lead Sources</div>${rankList(ci.leadSources)}</div>`;
      s += `</div>`;
      return s + sectionEnd;
    },

    userExperience: () => {
      let s = sectionStart("👤", "User Experience Signals");
      s += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">`;
      if (me("userExperience", "deviceBreakdown")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Device Breakdown</div>${rankList(ux.deviceBreakdown)}</div>`;
      if (me("userExperience", "geoBreakdown")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Geography</div>${rankList(ux.geoBreakdown, 10)}</div>`;
      if (me("userExperience", "topPages")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Top Pages</div>${rankList((ux.topPages || []).slice(0, 10))}</div>`;
      if (me("userExperience", "referrerBreakdown")) s += `<div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Referrers</div>${rankList(ux.referrerBreakdown)}</div>`;
      s += `</div>`;
      return s + sectionEnd;
    },

    actionPlan: () => {
      let s = sectionStart("💡", "Action Plan & Forecast");
      if (me("actionPlan", "forecast") && ap.forecast?.projectedNextMonth > 0) {
        const low = Math.round(ap.forecast.projectedNextMonth * 0.9);
        const high = Math.round(ap.forecast.projectedNextMonth * 1.1);
        s += `<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:6px;background:${brandPrimary}0d;border:1px solid ${brandPrimary}1a;margin-bottom:14px">
          <span style="color:${brandPrimary};font-size:12px;margin-top:1px">↗</span>
          <div><div style="font-size:11px;font-weight:600;color:#00264d">Lead Forecast</div>
          <div style="font-size:11px;color:#6b6f80">Avg. ${ap.forecast.avgDailyLeads} leads/day · Projected next month: ${fmtNum(low)}–${fmtNum(high)}</div></div></div>`;
      }
      if (me("actionPlan", "recommendations") && ap.recommendations?.length > 0) {
        ap.recommendations.forEach((a: string, i: number) => {
          s += `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
            <span style="font-size:11px;font-weight:700;color:${brandPrimary};flex-shrink:0">${i + 1}.</span>
            <span style="font-size:12px;color:#00264d">${safe(a)}</span></div>`;
        });
      }
      if (me("actionPlan", "contentOpportunities") && ap.contentOpportunities?.length > 0) {
        s += `<div style="margin-top:14px"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:10px">Content Opportunities</div>`;
        s += rankList((ap.contentOpportunities || []).map((o: any) => ({ label: o.page, count: o.views })));
        s += `</div>`;
      }
      return s + sectionEnd;
    },

    goalConversions: () => {
      const gc = report.goalConversions;
      if (!gc || !gc.goals?.length) return "";
      let s = sectionStart("🎯", "Key Actions");
      s += `<div style="font-size:11px;color:#6b6f80;margin-bottom:12px">${gc.totalCompletions} total completions across ${gc.goals.length} Key Action(s)</div>`;
      s += `<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:Helvetica,Arial,'Segoe UI',sans-serif">
        <thead><tr style="border-bottom:1px solid #e4e6ed;text-align:left">
          <th style="padding:6px 8px 6px 0;font-weight:500;color:#6b6f80">Key Action</th>
          <th style="padding:6px 8px;font-weight:500;color:#6b6f80">Type</th>
          <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Completions</th>
        </tr></thead><tbody>`;
      gc.goals.forEach((g: any) => {
        s += `<tr style="border-bottom:1px solid rgba(228,230,237,0.5)">
          <td style="padding:6px 8px 6px 0;font-weight:500;color:#00264d">${safe(g.name)}</td>
          <td style="padding:6px 8px;color:#6b6f80;text-transform:capitalize">${safe(g.goalType?.replace(/_/g, " "))}</td>
          <td style="padding:6px 8px;color:#00264d;text-align:right;font-weight:600">${g.count}</td></tr>`;
      });
      s += `</tbody></table>`;
      return s + sectionEnd;
    },
  };

  // Determine section order from template or use default order
  const defaultOrder = ["aiInsights", "executiveSummary", "siteHealth", "formHealth", "goalConversions", "growthEngine", "conversionIntelligence", "userExperience", "actionPlan"];
  const sectionOrder = (tpl && tpl.length > 0)
    ? tpl.filter((s) => s.enabled).map((s) => s.key)
    : defaultOrder;

  for (const key of sectionOrder) {
    const renderer = sectionRenderers[key];
    if (renderer && isSectionEnabled(tpl, key)) {
      html += renderer();
    }
  }

  // Footer watermark (also a section so it doesn't get orphaned)
  html += `<div data-pdf-section style="text-align:center;padding:12px 0;font-size:10px;color:#6b6f80;font-family:Helvetica,Arial,'Segoe UI',sans-serif">
    ${brandName ? brandName + ' · ' : ''}Generated ${fmtDate(report.generatedAt)}
  </div>`;

  html += `</div>`;
  return html;
}

// ── Main export: render HTML → per-section canvas → PDF ──

export async function buildReportPdf(report: any, _run: any, whiteLabel?: WhiteLabelConfig | null, template?: ReportTemplateSection[] | null): Promise<jsPDF> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "680px";
  container.style.background = "#ffffff";
  container.style.zIndex = "-1";
  container.innerHTML = buildReportHtml(report, whiteLabel, template);
  document.body.appendChild(container);

  // Wait for any <img> tags (e.g. white-label logo) to fully load before
  // html2canvas captures, otherwise remote images render as broken/blank.
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            // Safety timeout — never block the export forever
            setTimeout(done, 3000);
          })
    )
  );
  // Tiny extra tick for layout to settle
  await new Promise((r) => setTimeout(r, 50));

  try {
    const pageW = 210;
    const pageH = 297;
    const margin = 10;
    const contentW = pageW - margin * 2;
    const headerH = 8;
    const footerH = 8;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const footerBrandHex = whiteLabel?.primary_color || "#6d5dd4";
    const fbR = parseInt(footerBrandHex.slice(1, 3), 16);
    const fbG = parseInt(footerBrandHex.slice(3, 5), 16);
    const fbB = parseInt(footerBrandHex.slice(5, 7), 16);
    const footerBrand = whiteLabel?.logo_url
      ? ""
      : whiteLabel?.hide_actv_branding
        ? (whiteLabel?.client_name || "")
        : "ACTV TRKR";

    const footerRenderer = (d: jsPDF, page: number, totalPages: number) => {
      d.setFillColor(245, 246, 250);
      d.rect(0, pageH - footerH - margin + 2, pageW, footerH + margin, "F");
      d.setDrawColor(fbR, fbG, fbB);
      d.setLineWidth(0.3);
      d.line(0, pageH - footerH - margin + 2, pageW, pageH - footerH - margin + 2);

      d.setFontSize(7);
      d.setTextColor(107, 111, 128);
      d.text(`${footerBrand}${footerBrand ? "  |  " : ""}Generated ${fmtDate(report.generatedAt)}`, margin, pageH - margin + 1);

      d.setFillColor(fbR, fbG, fbB);
      const pageText = `${page + 1} / ${totalPages}`;
      const ptw = d.getTextWidth(pageText) + 4;
      d.roundedRect(pageW - margin - ptw, pageH - margin - 1, ptw, 5, 1, 1, "F");
      d.setFontSize(7);
      d.setTextColor(255, 255, 255);
      d.text(pageText, pageW - margin - ptw / 2, pageH - margin + 2, { align: "center" });
    };

    await renderSectionsToPdf({
      container, doc, margin, headerH, footerH, contentW, pageW, pageH, footerRenderer,
    });

    return doc;
  } finally {
    document.body.removeChild(container);
  }
}
