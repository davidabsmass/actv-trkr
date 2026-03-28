import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Renders a report data object into a hidden DOM container that mirrors
 * the in-browser MonthlyPerformanceViewer, captures it with html2canvas,
 * and splits it across A4 pages in a jsPDF document.
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
  const brandName = (wl?.hide_actv_branding || wl?.logo_url) ? (wl?.client_name || "") : "ACTV TRKR";
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
    <div style="border:1px solid #e4e6ed;border-radius:8px;background:#fff;padding:20px;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid">
      <div style="font-size:13px;font-weight:600;color:#00264d;margin-bottom:14px;display:flex;align-items:center;gap:6px">
        <span style="color:${brandPrimary}">${icon}</span> ${safe(title)}
      </div>`;
  const sectionEnd = `</div>`;

  const rankList = (items: Array<{ label: string; count: number }>, max = 8) => {
    const top = (items || []).slice(0, max);
    const maxCount = top[0]?.count || 1;
    return top
      .map((item, i) => {
        const widthPct = Math.max(2, Math.min(100, (item.count / maxCount) * 100));
        return `
      <div style="display:block;margin-bottom:16px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:11px;color:#6b6f80;width:16px;text-align:right;flex-shrink:0;line-height:1.5">${i + 1}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;min-height:18px">
              <span style="display:block;font-size:11px;font-weight:500;color:#00264d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;line-height:1.5;padding-bottom:1px">${safe(item.label)}</span>
              <span style="display:block;font-size:11px;color:#6b6f80;flex-shrink:0;min-width:32px;text-align:right;font-variant-numeric:tabular-nums;line-height:1.5">${fmtNum(item.count)}</span>
            </div>
            <div style="height:6px;background:#e4e6ed;border-radius:999px;overflow:hidden">
              <div style="height:100%;background:${brandPrimary}80;border-radius:999px;width:${widthPct}%"></div>
            </div>
          </div>
        </div>
      </div>`;
      })
      .join("");
  };

  let html = `
<div style="font-family:'BR Omega','Segoe UI',system-ui,sans-serif;color:#00264d;width:680px;padding:0;background:#fff">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,${brandGradientStart},${brandSecondary});padding:24px 28px;border-radius:8px 8px 0 0;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      ${wl?.logo_url ? `<img src="${wl.logo_url}" style="height:36px;max-width:180px;object-fit:contain;filter:brightness(0) invert(1);opacity:1" crossorigin="anonymous" />` : ''}
      ${brandName ? `<span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.02em">${brandName}</span>` : ''}
      <span style="width:4px;height:4px;background:#fff;border-radius:50%;display:inline-block"></span>
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
      let s = `<div class="force-page-break" style="height:4px"></div>`;
      s += sectionStart("◎", "Executive Summary");
      s += `<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">`;
      if (me("executiveSummary", "leads")) s += kpiCard("Leads", es.leads.current, es.leads.change);
      if (me("executiveSummary", "sessions")) s += kpiCard("Sessions", fmtNum(es.sessions.current), es.sessions.change);
      if (me("executiveSummary", "pageviews")) s += kpiCard("Pageviews", fmtNum(es.pageviews.current), es.pageviews.change);
      if (me("executiveSummary", "cvr")) s += kpiCard("CVR", `${es.cvr.current}%`, es.cvr.change);
      if (me("executiveSummary", "weightedLeads") && es.weightedLeads) s += kpiCard("Weighted Leads", es.weightedLeads, null);
      s += `</div>`;
      if (me("executiveSummary", "goal") && es.goalTarget) {
        const pct = Math.round((es.leads.current / es.goalTarget) * 100);
        s += `<div style="font-size:11px;color:#6b6f80;margin-bottom:10px">🎯 Monthly goal: ${es.goalTarget} leads · ${pct}% achieved</div>`;
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
      let s = `<div class="force-page-break" style="height:4px"></div>`;
      s += sectionStart("📊", "Conversion Intelligence");
      if (me("conversionIntelligence", "leadsByForm") && ci.leadsByForm?.length > 0) {
        s += `<div style="margin-bottom:16px"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-bottom:8px">Leads by Form</div>`;
        s += `<table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="border-bottom:1px solid #e4e6ed;text-align:left">
            <th style="padding:6px 8px 6px 0;font-weight:500;color:#6b6f80">Form</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80">Category</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Weight</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">Leads</th>
            <th style="padding:6px 8px;font-weight:500;color:#6b6f80;text-align:right">CVR</th>
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
  };

  // Determine section order from template or use default order
  const defaultOrder = ["aiInsights", "executiveSummary", "siteHealth", "formHealth", "growthEngine", "conversionIntelligence", "userExperience", "actionPlan"];
  const sectionOrder = (tpl && tpl.length > 0)
    ? tpl.filter((s) => s.enabled).map((s) => s.key)
    : defaultOrder;

  for (const key of sectionOrder) {
    const renderer = sectionRenderers[key];
    if (renderer && isSectionEnabled(tpl, key)) {
      html += renderer();
    }
  }

  // Footer watermark
  html += `<div style="text-align:center;padding:12px 0;font-size:10px;color:#6b6f80">
    ${brandName ? brandName + ' · ' : ''}Generated ${fmtDate(report.generatedAt)}
  </div>`;

  html += `</div>`;
  return html;
}

// ── Main export: render HTML → canvas → PDF ──

export async function buildReportPdf(report: any, _run: any, whiteLabel?: WhiteLabelConfig | null, template?: ReportTemplateSection[] | null): Promise<jsPDF> {
  // Create off-screen container
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "680px";
  container.style.background = "#ffffff";
  container.style.zIndex = "-1";
  container.innerHTML = buildReportHtml(report, whiteLabel, template);
  document.body.appendChild(container);

  // Wait for rendering
  await new Promise((r) => setTimeout(r, 150));

  // Collect forced page-break positions from DOM before rasterizing
  const forceBreakEls = container.querySelectorAll('.force-page-break');
  const forcedBreakOffsets = Array.from(forceBreakEls).map(
    (el) => (el as HTMLElement).offsetTop
  );

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width: 680,
      windowWidth: 680,
    });

    // A4 dimensions in mm
    const pageW = 210;
    const pageH = 297;
    const margin = 10;
    const contentW = pageW - margin * 2;
    const headerH = 8;
    const footerH = 8;
    const printableH = pageH - margin * 2 - headerH - footerH;

    const imgW = canvas.width;
    const imgH = canvas.height;
    const contentHmm = (imgH / imgW) * contentW;
    const pxPerMm = imgH / contentHmm;

    // Find section boundaries by scanning for the 16px (margin-bottom) white gaps
    // between section cards in the rendered canvas
    const findBreakPoints = (): number[] => {
      const ctx = canvas.getContext("2d")!;
      const breaks: number[] = [];
      const scanWidth = Math.min(imgW, 100); // scan left strip
      const gapThreshold = Math.round(12 * (canvas.width / 680)); // ~12px gap in source units

      for (let y = gapThreshold; y < imgH - gapThreshold; y += 2) {
        // Check if this row is all-white (gap between sections)
        const row = ctx.getImageData(10, y, scanWidth, 1).data;
        let isWhite = true;
        for (let x = 0; x < row.length; x += 4) {
          if (row[x] < 250 || row[x + 1] < 250 || row[x + 2] < 250) {
            isWhite = false;
            break;
          }
        }
        if (isWhite) {
          // Avoid duplicate nearby breaks
          if (breaks.length === 0 || y - breaks[breaks.length - 1] > gapThreshold) {
            breaks.push(y);
          }
        }
      }
      return breaks;
    };

    const naturalBreaks = findBreakPoints();

    // Convert DOM-measured forced break offsets to canvas pixel positions
    const scale = canvas.width / 680;
    const forcedBreaksPx = forcedBreakOffsets.map((o) => Math.round(o * scale));

    // Build page slices: forced breaks always trigger a new page,
    // natural breaks prevent cutting sections in half.
    const pageSlices: Array<{ srcY: number; srcH: number }> = [];
    let currentY = 0;
    const maxSliceH = Math.round(printableH * pxPerMm);

    // Sort all forced breaks ascending
    const sortedForced = [...forcedBreaksPx].sort((a, b) => a - b);

    while (currentY < imgH) {
      const idealEnd = currentY + maxSliceH;

      if (idealEnd >= imgH) {
        pageSlices.push({ srcY: currentY, srcH: imgH - currentY });
        break;
      }

      // Check if any forced break falls within [currentY+1 .. idealEnd]
      let breakAt = -1;
      for (const fb of sortedForced) {
        if (fb <= currentY) continue;
        if (fb <= idealEnd) {
          // Always break at the FIRST forced break within this page
          breakAt = fb;
          break;
        }
        break; // no more forced breaks in range
      }

      if (breakAt < 0) {
        // No forced break — use the nearest natural break before idealEnd
        const searchStart = idealEnd - Math.round(maxSliceH * 0.35);
        for (let i = naturalBreaks.length - 1; i >= 0; i--) {
          if (naturalBreaks[i] <= idealEnd && naturalBreaks[i] >= searchStart) {
            breakAt = naturalBreaks[i];
            break;
          }
        }
        if (breakAt < 0) breakAt = idealEnd;
      }

      const sliceH = breakAt - currentY;
      if (sliceH <= 0) break;
      pageSlices.push({ srcY: currentY, srcH: sliceH });
      currentY += sliceH;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const totalPages = pageSlices.length;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();
      const { srcY, srcH } = pageSlices[page];

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = imgW;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, imgW, srcH);
      ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);

      const sliceDataUrl = pageCanvas.toDataURL("image/png");
      const sliceHmm = (srcH / imgW) * contentW;

      doc.addImage(sliceDataUrl, "PNG", margin, margin + headerH, contentW, sliceHmm);

      // Footer
      doc.setFillColor(245, 246, 250);
      doc.rect(0, pageH - footerH - margin + 2, pageW, footerH + margin, "F");
      // Use brand color for footer line and badge
      const footerBrandHex = whiteLabel?.primary_color || "#6d5dd4";
      const fbR = parseInt(footerBrandHex.slice(1,3), 16);
      const fbG = parseInt(footerBrandHex.slice(3,5), 16);
      const fbB = parseInt(footerBrandHex.slice(5,7), 16);
      doc.setDrawColor(fbR, fbG, fbB);
      doc.setLineWidth(0.3);
      doc.line(0, pageH - footerH - margin + 2, pageW, pageH - footerH - margin + 2);

      const footerBrand = (whiteLabel?.hide_actv_branding || whiteLabel?.logo_url) ? (whiteLabel?.client_name || "") : "ACTV TRKR";
      doc.setFontSize(7);
      doc.setTextColor(107, 111, 128);
      doc.text(`${footerBrand}${footerBrand ? "  |  " : ""}Generated ${fmtDate(report.generatedAt)}`, margin, pageH - margin + 1);

      // Page badge
      doc.setFillColor(fbR, fbG, fbB);
      const pageText = `${page + 1} / ${totalPages}`;
      const ptw = doc.getTextWidth(pageText) + 4;
      doc.roundedRect(pageW - margin - ptw, pageH - margin - 1, ptw, 5, 1, 1, "F");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(pageText, pageW - margin - ptw / 2, pageH - margin + 2, { align: "center" });
    }

    return doc;
  } finally {
    document.body.removeChild(container);
  }
}
