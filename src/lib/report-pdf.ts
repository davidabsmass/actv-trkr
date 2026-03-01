import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = {
  primary: [99, 102, 241] as [number, number, number],
  text: [26, 26, 46] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  success: [5, 150, 105] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
  bg: [249, 250, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
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
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; }
}

export function buildReportPdf(report: any, run: any): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 20;

  const slug = report.templateSlug || "monthly_performance";
  const title = slug === "weekly_brief" ? "Weekly Brief" : slug === "campaign_report" ? "Campaign Report" : "Monthly Performance Report";
  const period = `${fmtDate(report.periodStart)} – ${fmtDate(report.periodEnd)} · ${report.periodDays}-day period`;

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 15;
    }
  };

  // Title
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  let sub = period;
  if (report.compareMode && report.compareMode !== "none") sub += ` · vs ${report.compareMode === "yoy" ? "same period last year" : "previous period"}`;
  doc.text(sub, margin, y);
  y += 10;

  // Section header
  const sectionHeader = (label: string) => {
    checkPage(20);
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin + contentW, y);
    y += 5;
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), margin, y);
    y += 7;
  };

  // KPI cards
  const kpiRow = (kpis: Array<{ label: string; value: any; change: number | null }>) => {
    checkPage(22);
    const cardW = contentW / kpis.length - 2;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + 2);
      doc.setFillColor(...COLORS.bg);
      doc.roundedRect(x, y, cardW, 18, 2, 2, "F");
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.text(k.label.toUpperCase(), x + 3, y + 5);
      doc.setFontSize(14);
      doc.setTextColor(...COLORS.text);
      doc.setFont("helvetica", "bold");
      doc.text(String(k.value), x + 3, y + 12);
      if (k.change !== null && k.change !== undefined) {
        doc.setFontSize(8);
        doc.setTextColor(...changeColor(k.change));
        doc.setFont("helvetica", "bold");
        doc.text(changeText(k.change), x + 3, y + 16);
      }
    });
    y += 22;
  };

  // Insight box
  const insightBox = (emoji: string, label: string, text: string, isWin: boolean) => {
    checkPage(14);
    doc.setFillColor(...(isWin ? [236, 253, 245] as [number, number, number] : [254, 242, 242] as [number, number, number]));
    doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.text(`${emoji} ${label}:`, margin + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(text, margin + 3 + doc.getTextWidth(`${emoji} ${label}: `), y + 5);
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
      doc.text(item.label, margin + 2, y);
      doc.setTextColor(...COLORS.muted);
      doc.text(item.count.toLocaleString(), margin + contentW - 2, y, { align: "right" });
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
      const lines = doc.splitTextToSize(a, contentW - 12);
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
    doc.text(label.toUpperCase(), margin, y);
    y += 5;
  };

  // ── Build by template ──
  if (slug === "monthly_performance") {
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
      doc.text(`🎯 Monthly goal: ${es.goalTarget} leads · ${Math.round((es.leads.current / es.goalTarget) * 100)}% achieved`, margin, y);
      y += 6;
    }
    insightBox("✅", "Key Win", es.keyWin, true);
    insightBox("⚠️", "Key Risk", es.keyRisk, false);

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
        body: (ci.leadsByForm || []).map((f: any) => [f.formName, f.formCategory, `${f.weight}×`, f.leads, changeText(f.change)]),
        styles: { fontSize: 8, cellPadding: 2 },
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
      insightBox("📈", "Lead Forecast", `Avg. ${ap.forecast.avgDailyLeads} leads/day → Projected next month: ${Math.round(ap.forecast.projectedNextMonth * 0.9)}–${Math.round(ap.forecast.projectedNextMonth * 1.1)}`, true);
    }
    recommendations(ap.recommendations);

    if (ap.contentOpportunities?.length > 0) {
      y += 4;
      colTitle("Content Opportunities");
      (ap.contentOpportunities || []).forEach((o: any) => {
        checkPage(6);
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.text);
        doc.text(o.page, margin + 2, y);
        doc.setTextColor(...COLORS.muted);
        doc.text(`${o.views} views`, margin + contentW - 2, y, { align: "right" });
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
      doc.text(`🎯 Goal: ${kpi.goalTarget} leads · ${Math.round((kpi.leads.current / kpi.goalTarget) * 100)}% achieved`, margin, y);
      y += 6;
    }

    if (report.topChanges?.length) {
      sectionHeader("Biggest Changes");
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Metric", "Current", "Previous", "Change"]],
        body: (report.topChanges || []).map((c: any) => [c.metric, c.current, c.previous, changeText(c.change)]),
        styles: { fontSize: 8, cellPadding: 2 },
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
      { label: "Spend", value: s.totalSpend ? `$${s.totalSpend.toLocaleString()}` : "—", change: null },
    ]);

    sectionHeader("Campaign Breakdown");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Campaign", "Leads", "Sessions", "CVR", "Spend", "CPL"]],
      body: (report.campaignBreakdown || []).map((c: any) => [
        c.campaign, c.leads, c.sessions, `${c.cvr}%`,
        c.spend ? `$${c.spend.toLocaleString()}` : "—",
        c.cpl ? `$${c.cpl}` : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bg },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    sectionHeader("Recommendations");
    recommendations(report.actions);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Generated ${fmtDate(report.generatedAt)}`, margin, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: "right" });
  }

  return doc;
}
