import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Strip emoji and non-Latin1 characters that jsPDF's default fonts can't render
function safe(s: any): string {
  return String(s ?? "")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u200D\u200B\u200C\u200E\u200F]/g, "")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

// App design system colors (Indigo/Navy palette from index.css)
const COLORS = {
  primary: [99, 91, 255] as [number, number, number],     // --indigo 248 90% 66%
  text: [0, 38, 77] as [number, number, number],           // --navy 210 100% 15%
  muted: [107, 111, 128] as [number, number, number],      // --muted-foreground 220 9% 46%
  success: [33, 196, 93] as [number, number, number],      // --success 142 71% 45%
  danger: [236, 54, 54] as [number, number, number],       // --destructive 0 84% 60%
  bg: [245, 246, 250] as [number, number, number],         // --background 220 20% 97%
  white: [255, 255, 255] as [number, number, number],
  border: [228, 230, 237] as [number, number, number],     // --border 220 13% 91%
  navyLight: [20, 64, 128] as [number, number, number],    // --navy-light 210 80% 25%
  accent: [112, 88, 255] as [number, number, number],      // --purple 250 95% 70%
};

function changeText(change: number | null): string {
  if (change === null || change === undefined) return "";
  return `${change > 0 ? "+" : ""}${change}%`;
}

function changeColor(change: number | null): [number, number, number] {
  if (!change) return COLORS.muted;
  return change > 0 ? COLORS.success : change < 0 ? COLORS.danger : COLORS.muted;
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

export function buildReportPdf(report: any, run: any): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 12;

  const title = "Performance Report";
  const period = safe(`${fmtDate(report.periodStart)} - ${fmtDate(report.periodEnd)} | ${report.periodDays}-day period`);

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 15;
    }
  };

  // Branded header bar
  doc.setFillColor(...COLORS.text);
  doc.rect(0, 0, pageW, 28, "F");
  // Accent gradient strip
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 28, pageW, 1.5, "F");

  // Brand name
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.text("ACTV TRKR", margin, 11);

  // Title on header
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.text(safe(title), margin, 21);

  y = 36;

  // Period subtitle
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.text(safe(period), margin, y);
  y += 8;

  // Section header - navy accent bar
  const sectionHeader = (label: string) => {
    checkPage(20);
    doc.setFillColor(...COLORS.text);
    doc.rect(margin, y, 3, 6, "F");
    doc.setFillColor(...COLORS.primary);
    doc.rect(margin + 3, y, 1, 6, "F");
    y += 1;
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.text(safe(label).toUpperCase(), margin + 7, y + 4);
    y += 10;
  };

  // KPI cards - navy-topped cards
  const kpiRow = (kpis: Array<{ label: string; value: any; change: number | null }>) => {
    checkPage(24);
    const cardW = contentW / kpis.length - 2;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + 2);
      // Card background
      doc.setFillColor(...COLORS.bg);
      doc.roundedRect(x, y, cardW, 20, 2, 2, "F");
      // Top accent bar
      doc.setFillColor(...COLORS.primary);
      doc.rect(x, y, cardW, 2, "F");
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.text(safe(k.label).toUpperCase(), x + 3, y + 7);
      doc.setFontSize(14);
      doc.setTextColor(...COLORS.text);
      doc.setFont("helvetica", "bold");
      doc.text(safe(String(k.value)), x + 3, y + 14);
      if (k.change !== null && k.change !== undefined) {
        doc.setFontSize(8);
        doc.setTextColor(...changeColor(k.change));
        doc.setFont("helvetica", "bold");
        doc.text(safe(changeText(k.change)), x + 3, y + 18);
      }
    });
    y += 24;
  };

  // Insight box - no emoji, use [+] / [!] markers
  const insightBox = (marker: string, label: string, text: string, isWin: boolean) => {
    checkPage(14);
    const bgColor: [number, number, number] = isWin ? [236, 253, 245] : [254, 242, 242];
    doc.setFillColor(...bgColor);
    doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.text);
    doc.setFont("helvetica", "bold");
    const prefix = safe(`${marker} ${label}:`);
    doc.text(prefix, margin + 3, y + 5);
    const prefixW = doc.getTextWidth(prefix + " ");
    doc.setFont("helvetica", "normal");
    const safeText = safe(text);
    const available = contentW - 6 - prefixW;
    const lines = doc.splitTextToSize(safeText, available);
    doc.text(lines[0] || "", margin + 3 + prefixW, y + 5);
    y += 13;
  };

  // Rank list
  const rankList = (items: Array<{ label: string; count: number }>, maxItems = 8) => {
    const top = (items || []).slice(0, maxItems);
    top.forEach((item) => {
      checkPage(6);
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.text);
      doc.setFont("helvetica", "normal");
      doc.text(safe(item.label), margin + 2, y);
      doc.setTextColor(...COLORS.muted);
      doc.text(safe(item.count.toLocaleString()), margin + contentW - 2, y, { align: "right" });
      y += 5;
    });
    y += 2;
  };

  // Recommendations
  const recommendations = (actions: string[]) => {
    (actions || []).forEach((a, i) => {
      checkPage(8);
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.primary);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}.`, margin + 2, y);
      doc.setTextColor(...COLORS.text);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(safe(a), contentW - 12);
      doc.text(lines, margin + 8, y);
      y += lines.length * 4 + 2;
    });
  };

  // Column subtitle
  const colTitle = (label: string) => {
    checkPage(8);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.text(safe(label).toUpperCase(), margin, y);
    y += 5;
  };

  // ── Build by template ──
  {
    const es = report.executiveSummary;
    const ge = report.growthEngine;
    const ci = report.conversionIntelligence;
    const ux = report.userExperience;
    const ap = report.actionPlan;

    sectionHeader("Executive Summary");
    kpiRow([
      { label: "Leads", value: es.leads.current, change: es.leads.change },
      { label: "Sessions", value: es.sessions.current, change: es.sessions.change },
      { label: "Pageviews", value: es.pageviews.current, change: es.pageviews.change },
      { label: "CVR", value: `${es.cvr.current}%`, change: es.cvr.change },
    ]);
    if (es.goalTarget) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.text(safe(`Goal: ${es.goalTarget} leads | ${Math.round((es.leads.current / es.goalTarget) * 100)}% achieved`), margin, y);
      y += 6;
    }
    insightBox("[+]", "Key Win", es.keyWin, true);
    insightBox("[!]", "Key Risk", es.keyRisk, false);

    sectionHeader("Growth Engine");
    colTitle("Traffic by Source");
    rankList(ge.trafficBySource);
    colTitle("Top Landing Pages");
    rankList(ge.topLandingPages);

    sectionHeader("Conversion Intelligence");
    if (ci.leadsByForm?.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Form", "Category", "Weight", "Leads", "Change"]],
        body: (ci.leadsByForm || []).map((f: any) => [
          safe(f.formName), safe(f.formCategory), `${f.weight}x`, f.leads, changeText(f.change),
        ]),
        styles: { fontSize: 8, cellPadding: 2, font: "helvetica" },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
        alternateRowStyles: { fillColor: COLORS.bg },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
    colTitle("Top Converting Pages");
    rankList(ci.topConvertingPages);
    colTitle("Lead Sources");
    rankList(ci.leadSources);

    sectionHeader("User Experience Signals");
    colTitle("Device Breakdown");
    rankList(ux.deviceBreakdown);
    colTitle("Geography");
    rankList(ux.geoBreakdown, 10);
    colTitle("Top Pages");
    rankList((ux.topPages || []).slice(0, 10));
    colTitle("Referrers");
    rankList(ux.referrerBreakdown);

    sectionHeader("Action Plan & Forecast");
    if (ap.forecast?.projectedNextMonth > 0) {
      insightBox("[>]", "Lead Forecast", `Avg. ${ap.forecast.avgDailyLeads} leads/day - Projected next month: ${Math.round(ap.forecast.projectedNextMonth * 0.9)}-${Math.round(ap.forecast.projectedNextMonth * 1.1)}`, true);
    }
    recommendations(ap.recommendations);

    if (ap.contentOpportunities?.length > 0) {
      y += 4;
      colTitle("Content Opportunities");
      (ap.contentOpportunities || []).forEach((o: any) => {
        checkPage(6);
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.text);
        doc.setFont("helvetica", "normal");
        doc.text(safe(o.page), margin + 2, y);
        doc.setTextColor(...COLORS.muted);
        doc.text(safe(`${o.views} views`), margin + contentW - 2, y, { align: "right" });
        y += 5;
      });
    }
  } else if (slug === "weekly_brief") {
    const kpi = report.kpiSnapshot;
    sectionHeader("KPI Snapshot");
    kpiRow([
      { label: "Leads", value: kpi.leads.current, change: kpi.leads.change },
      { label: "Sessions", value: kpi.sessions.current, change: kpi.sessions.change },
      { label: "CVR", value: `${kpi.cvr.current}%`, change: kpi.cvr.change },
      { label: "Weighted Leads", value: kpi.weightedLeads, change: null },
    ]);
    if (kpi.goalTarget) {
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.text(safe(`Goal: ${kpi.goalTarget} leads | ${Math.round((kpi.leads.current / kpi.goalTarget) * 100)}% achieved`), margin, y);
      y += 6;
    }

    if (report.topChanges?.length) {
      sectionHeader("Biggest Changes");
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Metric", "Current", "Previous", "Change"]],
        body: (report.topChanges || []).map((c: any) => [
          safe(c.metric), c.current, c.previous, changeText(c.change),
        ]),
        styles: { fontSize: 8, cellPadding: 2, font: "helvetica" },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    if (report.topSources?.length) {
      sectionHeader("Top Sources");
      rankList(report.topSources, 5);
    }

    sectionHeader("Quick Actions");
    recommendations(report.actions);
  } else if (slug === "campaign_report") {
    const s = report.summary;
    sectionHeader("Overview");
    kpiRow([
      { label: "Total Leads", value: s.totalLeads, change: s.leadsChange },
      { label: "Sessions", value: s.totalSessions, change: null },
      { label: "CVR", value: `${s.cvr}%`, change: null },
      { label: "Spend", value: s.totalSpend ? `$${s.totalSpend.toLocaleString()}` : "-", change: null },
    ]);

    sectionHeader("Campaign Breakdown");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Campaign", "Leads", "Sessions", "CVR", "Spend", "CPL"]],
      body: (report.campaignBreakdown || []).map((c: any) => [
        safe(c.campaign), c.leads, c.sessions, `${c.cvr}%`,
        c.spend ? `$${c.spend.toLocaleString()}` : "-",
        c.cpl ? `$${c.cpl}` : "-",
      ]),
      styles: { fontSize: 8, cellPadding: 2, font: "helvetica" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bg },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    sectionHeader("Recommendations");
    recommendations(report.actions);
  }

  // Footer on every page - branded
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    // Footer accent line
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.4);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(safe(`ACTV TRKR | Generated ${fmtDate(report.generatedAt)}`), margin, pageH - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 8, { align: "right" });
  }

  return doc;
}
