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

// ── Design System Colors (from index.css) ──
const C = {
  indigo:     [99, 91, 255]   as [number, number, number],
  purple:     [112, 88, 255]  as [number, number, number],
  navy:       [0, 38, 77]     as [number, number, number],
  navyLight:  [20, 64, 128]   as [number, number, number],
  success:    [33, 196, 93]   as [number, number, number],
  warning:    [245, 158, 11]  as [number, number, number],
  danger:     [236, 54, 54]   as [number, number, number],
  text:       [0, 38, 77]     as [number, number, number],
  muted:      [107, 111, 128] as [number, number, number],
  border:     [228, 230, 237] as [number, number, number],
  bg:         [245, 246, 250] as [number, number, number],
  bgCard:     [250, 250, 253] as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
  chart1:     [99, 91, 255]   as [number, number, number],
  chart2:     [33, 196, 93]   as [number, number, number],
  chart3:     [150, 120, 255] as [number, number, number],
  chart4:     [245, 158, 11]  as [number, number, number],
  chart5:     [236, 80, 120]  as [number, number, number],
  chart6:     [14, 165, 233]  as [number, number, number],
};

const CHART_PALETTE: [number, number, number][] = [C.chart1, C.chart2, C.chart3, C.chart4, C.chart5, C.chart6];

const GRADIENT_TOP: [number, number, number] = [109, 93, 212];
const GRADIENT_BOT: [number, number, number] = [148, 73, 224];

// Footer height reserved at page bottom
const FOOTER_H = 16;

function changeText(change: number | null): string {
  if (change === null || change === undefined) return "";
  return `${change > 0 ? "+" : ""}${change}%`;
}

function changeColor(change: number | null): [number, number, number] {
  if (!change) return C.muted;
  return change > 0 ? C.success : change < 0 ? C.danger : C.muted;
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

// ── Font Loading ──
async function loadFont(url: string): Promise<string> {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function registerFonts(doc: jsPDF): Promise<boolean> {
  try {
    const [regularB64, boldB64, semiBoldB64, lightB64, mediumB64] = await Promise.all([
      loadFont("/fonts/BROmega-Regular.otf"),
      loadFont("/fonts/BROmega-Bold.otf"),
      loadFont("/fonts/BROmega-SemiBold.otf"),
      loadFont("/fonts/BROmega-Light.otf"),
      loadFont("/fonts/BROmega-Medium.otf"),
    ]);

    doc.addFileToVFS("BROmega-Regular.otf", regularB64);
    doc.addFont("BROmega-Regular.otf", "BROmega", "normal");

    doc.addFileToVFS("BROmega-Bold.otf", boldB64);
    doc.addFont("BROmega-Bold.otf", "BROmega", "bold");

    doc.addFileToVFS("BROmega-SemiBold.otf", semiBoldB64);
    doc.addFont("BROmega-SemiBold.otf", "BROmega", "normal", 600);

    doc.addFileToVFS("BROmega-Light.otf", lightB64);
    doc.addFont("BROmega-Light.otf", "BROmega", "normal", 300);

    doc.addFileToVFS("BROmega-Medium.otf", mediumB64);
    doc.addFont("BROmega-Medium.otf", "BROmega", "normal", 500);

    return true;
  } catch (e) {
    console.warn("Failed to load BROmega fonts, falling back to helvetica", e);
    return false;
  }
}

// ── Drawing Helpers ──

function drawBarChart(
  doc: jsPDF,
  items: Array<{ label: string; count: number }>,
  x: number, y: number, w: number,
  fontFamily: string,
  maxItems = 8,
  barColor: [number, number, number] = C.indigo,
): number {
  const data = (items || []).slice(0, maxItems);
  if (!data.length) return y;
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const barH = 5;
  const gap = 3;
  const labelW = Math.min(w * 0.4, 55);
  const barArea = w - labelW - 18;

  data.forEach((item, i) => {
    const rowY = y + i * (barH + gap);
    doc.setFontSize(7);
    doc.setTextColor(...C.text);
    doc.setFont(fontFamily, "normal");
    const label = safe(item.label).substring(0, 30);
    doc.text(label, x, rowY + barH - 1);

    doc.setFillColor(...C.bg);
    doc.roundedRect(x + labelW, rowY, barArea, barH, 1, 1, "F");

    const fillW = Math.max((item.count / maxVal) * barArea, 2);
    const ci = i % CHART_PALETTE.length;
    doc.setFillColor(...(barColor === C.indigo ? CHART_PALETTE[ci] : barColor));
    doc.roundedRect(x + labelW, rowY, fillW, barH, 1, 1, "F");

    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont(fontFamily, "bold");
    doc.text(fmtNum(item.count), x + labelW + barArea + 2, rowY + barH - 1);
  });

  return y + data.length * (barH + gap) + 4;
}

function drawStackedBar(
  doc: jsPDF,
  items: Array<{ label: string; count: number }>,
  x: number, y: number, w: number,
  fontFamily: string,
): number {
  const data = (items || []).slice(0, 6);
  if (!data.length) return y;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const barH = 8;
  let cx = x;

  data.forEach((item, i) => {
    const segW = Math.max((item.count / total) * w, 1);
    doc.setFillColor(...CHART_PALETTE[i % CHART_PALETTE.length]);
    if (i === 0) {
      doc.roundedRect(cx, y, segW, barH, 2, 2, "F");
      doc.rect(cx + segW - 2, y, 2, barH, "F");
    } else if (i === data.length - 1) {
      doc.roundedRect(cx, y, segW, barH, 2, 2, "F");
      doc.rect(cx, y, 2, barH, "F");
    } else {
      doc.rect(cx, y, segW, barH, "F");
    }
    cx += segW;
  });

  let ly = y + barH + 4;
  let lx = x;
  data.forEach((item, i) => {
    const pct = Math.round((item.count / total) * 100);
    const legendText = safe(`${item.label} (${pct}%)`);
    doc.setFillColor(...CHART_PALETTE[i % CHART_PALETTE.length]);
    doc.circle(lx + 1.5, ly - 1, 1.5, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.text);
    doc.setFont(fontFamily, "normal");
    doc.text(legendText, lx + 4.5, ly);
    const textW = doc.getTextWidth(legendText) + 8;
    lx += textW;
    if (lx > x + w - 20) {
      lx = x;
      ly += 5;
    }
  });

  return ly + 5;
}

function drawDonutChart(
  doc: jsPDF,
  items: Array<{ label: string; count: number }>,
  cx: number, cy: number, radius: number,
  fontFamily: string,
): number {
  const data = (items || []).slice(0, 6);
  if (!data.length) return cy + radius + 4;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const innerR = radius * 0.55;
  const steps = 60;
  let startAngle = -Math.PI / 2;

  data.forEach((item, i) => {
    const sweep = (item.count / total) * Math.PI * 2;
    const endAngle = startAngle + sweep;
    const color = CHART_PALETTE[i % CHART_PALETTE.length];
    doc.setFillColor(...color);

    const points: [number, number][] = [];
    const segSteps = Math.max(Math.ceil(steps * (sweep / (Math.PI * 2))), 3);
    for (let s = 0; s <= segSteps; s++) {
      const a = startAngle + (sweep * s) / segSteps;
      points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
    }
    for (let s = segSteps; s >= 0; s--) {
      const a = startAngle + (sweep * s) / segSteps;
      points.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
    }

    if (points.length >= 3) {
      doc.setFillColor(...color);
      for (let t = 1; t < points.length - 1; t++) {
        doc.triangle(
          points[0][0], points[0][1],
          points[t][0], points[t][1],
          points[t + 1][0], points[t + 1][1],
          "F",
        );
      }
    }

    startAngle = endAngle;
  });

  doc.setFillColor(...C.white);
  doc.circle(cx, cy, innerR, "F");

  doc.setFontSize(10);
  doc.setTextColor(...C.navy);
  doc.setFont(fontFamily, "bold");
  doc.text(fmtNum(total), cx, cy + 1, { align: "center" });
  doc.setFontSize(5);
  doc.setTextColor(...C.muted);
  doc.setFont(fontFamily, "normal");
  doc.text("TOTAL", cx, cy + 4.5, { align: "center" });

  return cy + radius + 4;
}

// ── Simple icon drawing helpers (matching Lucide style) ──

function drawCheckIcon(doc: jsPDF, x: number, y: number, size: number, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  // Checkmark
  doc.line(x + size * 0.2, y + size * 0.5, x + size * 0.4, y + size * 0.7);
  doc.line(x + size * 0.4, y + size * 0.7, x + size * 0.8, y + size * 0.25);
}

function drawAlertIcon(doc: jsPDF, x: number, y: number, size: number, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  // Triangle outline
  const cx = x + size / 2;
  doc.line(cx, y + size * 0.15, x + size * 0.15, y + size * 0.85);
  doc.line(x + size * 0.15, y + size * 0.85, x + size * 0.85, y + size * 0.85);
  doc.line(x + size * 0.85, y + size * 0.85, cx, y + size * 0.15);
  // Exclamation mark
  doc.setFillColor(...color);
  doc.line(cx, y + size * 0.35, cx, y + size * 0.6);
  doc.circle(cx, y + size * 0.72, 0.3, "F");
}

function drawTrendUpIcon(doc: jsPDF, x: number, y: number, size: number, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.line(x + size * 0.15, y + size * 0.7, x + size * 0.85, y + size * 0.3);
  // Arrow head
  doc.line(x + size * 0.85, y + size * 0.3, x + size * 0.6, y + size * 0.3);
  doc.line(x + size * 0.85, y + size * 0.3, x + size * 0.85, y + size * 0.55);
}

// ── Main PDF Builder ──

export async function buildReportPdf(report: any, run: any): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = 12;

  // Load custom fonts
  const fontsLoaded = await registerFonts(doc);
  const fontFamily = fontsLoaded ? "BROmega" : "helvetica";

  const period = safe(`${fmtDate(report.periodStart)}  -  ${fmtDate(report.periodEnd)}  |  ${report.periodDays}-day period`);

  // Safe zone: content must not go past this Y
  const maxY = pageH - FOOTER_H - 4;

  const checkPage = (needed: number) => {
    if (y + needed > maxY) {
      doc.addPage();
      y = 18;
    }
  };

  // ─── HEADER ───
  doc.setFillColor(...GRADIENT_TOP);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...GRADIENT_BOT);
  doc.rect(0, 28, pageW, 4, "F");
  doc.setFillColor(...C.white);
  doc.rect(0, 32, pageW, 0.3, "F");

  // Brand name
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont(fontFamily, "bold");
  doc.text("ACTV TRKR", margin, 10);

  doc.setFillColor(255, 255, 255);
  doc.circle(margin + doc.getTextWidth("ACTV TRKR") + 3, 9, 0.6, "F");

  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.setFont(fontFamily, "normal");
  doc.text("Performance Intelligence", margin + doc.getTextWidth("ACTV TRKR") + 6, 10);

  // Title
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont(fontFamily, "bold");
  doc.text("Performance Report", margin, 22);

  // Period
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setFont(fontFamily, "normal");
  doc.text(safe(period), margin, 28);

  y = 40;

  // ─── SECTION HEADER (clean, no "attach" decorations) ───
  const sectionHeader = (label: string) => {
    checkPage(16);
    y += 4;
    // Simple left accent line
    doc.setFillColor(...GRADIENT_TOP);
    doc.roundedRect(margin, y, 2.5, 6, 0.8, 0.8, "F");
    // Label
    doc.setFontSize(11);
    doc.setTextColor(...C.navy);
    doc.setFont(fontFamily, "bold");
    doc.text(safe(label).toUpperCase(), margin + 6, y + 4.5);
    // Subtle divider line after text
    const textW = doc.getTextWidth(safe(label).toUpperCase());
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(margin + 6 + textW + 3, y + 3, pageW - margin, y + 3);
    y += 12;
  };

  // ─── KPI CARDS ───
  const kpiRow = (kpis: Array<{ label: string; value: any; change: number | null }>) => {
    checkPage(28);
    const cardW = (contentW - (kpis.length - 1) * 3) / kpis.length;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + 3);
      // Card shadow
      doc.setFillColor(235, 236, 242);
      doc.roundedRect(x + 0.5, y + 0.5, cardW, 22, 2, 2, "F");
      doc.setFillColor(...C.white);
      doc.roundedRect(x, y, cardW, 22, 2, 2, "F");
      // Top accent line
      doc.setFillColor(...GRADIENT_TOP);
      doc.rect(x + 2, y, cardW - 4, 1.2, "F");
      // Label
      doc.setFontSize(6.5);
      doc.setTextColor(...C.muted);
      doc.setFont(fontFamily, "bold");
      doc.text(safe(k.label).toUpperCase(), x + 4, y + 7);
      // Value
      doc.setFontSize(16);
      doc.setTextColor(...C.navy);
      doc.setFont(fontFamily, "bold");
      doc.text(safe(String(k.value)), x + 4, y + 15);
      // Change badge
      if (k.change !== null && k.change !== undefined) {
        const cc = changeColor(k.change);
        const ct = changeText(k.change);
        const badgeBg: [number, number, number] = k.change > 0 ? [236, 253, 245] : k.change < 0 ? [254, 242, 242] : [245, 245, 245];
        const badgeW = doc.getTextWidth(ct) + 4;
        doc.setFillColor(...badgeBg);
        doc.roundedRect(x + 4, y + 17, badgeW + 2, 4, 1, 1, "F");
        doc.setFontSize(7);
        doc.setTextColor(...cc);
        doc.setFont(fontFamily, "bold");
        doc.text(safe(ct), x + 5, y + 20);
      }
    });
    y += 28;
  };

  // ─── INSIGHT BOX (clean — icon-based, no [+]/[!] markers) ───
  const insightBox = (label: string, text: string, isWin: boolean) => {
    checkPage(16);
    const bgColor: [number, number, number] = isWin ? [236, 253, 245] : [254, 242, 242];
    const accentColor = isWin ? C.success : C.danger;
    doc.setFillColor(...bgColor);
    doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
    // Left accent bar
    doc.setFillColor(...accentColor);
    doc.roundedRect(margin, y, 2, 12, 1, 1, "F");

    // Draw icon
    if (isWin) {
      drawCheckIcon(doc, margin + 4, y + 1.5, 4, accentColor);
    } else {
      drawAlertIcon(doc, margin + 4, y + 1.5, 4, accentColor);
    }

    // Label
    doc.setFontSize(7.5);
    doc.setTextColor(...accentColor);
    doc.setFont(fontFamily, "bold");
    doc.text(safe(label), margin + 10, y + 5.5);
    // Text
    const prefixW = doc.getTextWidth(safe(label) + " ");
    doc.setTextColor(...C.text);
    doc.setFont(fontFamily, "normal");
    const safeText = safe(text);
    const available = contentW - 14 - prefixW;
    const lines = doc.splitTextToSize(safeText, available);
    doc.text(lines[0] || "", margin + 10 + prefixW, y + 5.5);
    if (lines[1]) {
      doc.text(lines[1], margin + 10, y + 10);
    }
    y += 15;
  };

  // ─── COLUMN TITLE ───
  const colTitle = (label: string) => {
    checkPage(8);
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.setFont(fontFamily, "bold");
    doc.text(safe(label).toUpperCase(), margin, y);
    y += 5;
  };

  // ─── RECOMMENDATIONS ───
  const recommendations = (actions: string[]) => {
    (actions || []).forEach((a, i) => {
      checkPage(10);
      // Numbered circle
      doc.setFillColor(...GRADIENT_TOP);
      doc.circle(margin + 3, y + 1, 2.5, "F");
      doc.setFontSize(7);
      doc.setTextColor(...C.white);
      doc.setFont(fontFamily, "bold");
      doc.text(`${i + 1}`, margin + 3, y + 2, { align: "center" });
      // Text
      doc.setTextColor(...C.text);
      doc.setFont(fontFamily, "normal");
      const lines = doc.splitTextToSize(safe(a), contentW - 14);
      doc.text(lines, margin + 9, y + 2);
      y += lines.length * 4 + 3;
    });
  };

  // Bottom margin for autoTable to respect footer
  const tableBottomMargin = FOOTER_H + 4;

  // ════════════════════════════════════════
  // BUILD REPORT CONTENT
  // ════════════════════════════════════════

  const es = report.executiveSummary;
  const ge = report.growthEngine;
  const ci = report.conversionIntelligence;
  const ux = report.userExperience;
  const ap = report.actionPlan;
  const sh = report.siteHealth;
  const fh = report.formHealth;
  const aiInsights = report.aiInsights;

  // ── AI Insights ──
  if (aiInsights?.length > 0) {
    sectionHeader("AI-Generated Insights");
    aiInsights.forEach((insight: any, i: number) => {
      checkPage(14);
      doc.setFillColor(...C.bgCard);
      doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
      doc.setFillColor(...GRADIENT_BOT);
      doc.roundedRect(margin, y, 2, 12, 1, 1, "F");
      doc.setFontSize(8);
      doc.setTextColor(...C.indigo);
      doc.setFont(fontFamily, "bold");
      doc.text(safe(insight.title), margin + 5, y + 5);
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.setFont(fontFamily, "normal");
      const lines = doc.splitTextToSize(safe(insight.body), contentW - 10);
      doc.text(lines[0] || "", margin + 5, y + 9.5);
      y += 15;
    });
  }

  // ── Executive Summary ──
  sectionHeader("Executive Summary");
  kpiRow([
    { label: "Leads", value: fmtNum(es.leads.current), change: es.leads.change },
    { label: "Sessions", value: fmtNum(es.sessions.current), change: es.sessions.change },
    { label: "Pageviews", value: fmtNum(es.pageviews.current), change: es.pageviews.change },
    { label: "CVR", value: `${es.cvr.current}%`, change: es.cvr.change },
  ]);

  if (es.weightedLeads) {
    checkPage(8);
    doc.setFillColor(...C.bgCard);
    doc.roundedRect(margin, y, contentW / 2 - 2, 8, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont(fontFamily, "normal");
    doc.text("WEIGHTED LEADS", margin + 3, y + 3.5);
    doc.setFontSize(10);
    doc.setTextColor(...C.navy);
    doc.setFont(fontFamily, "bold");
    doc.text(String(es.weightedLeads), margin + 3 + doc.getTextWidth("WEIGHTED LEADS  "), y + 3.5);

    if (es.goalTarget) {
      const gx = margin + contentW / 2 + 2;
      const gw = contentW / 2 - 2;
      const pct = Math.min(Math.round((es.leads.current / es.goalTarget) * 100), 100);
      doc.setFillColor(...C.bgCard);
      doc.roundedRect(gx, y, gw, 8, 2, 2, "F");
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.setFont(fontFamily, "normal");
      doc.text(`GOAL: ${es.goalTarget} leads (${pct}%)`, gx + 3, y + 3.5);
      // Progress bar
      doc.setFillColor(...C.border);
      doc.roundedRect(gx + 3, y + 5, gw - 6, 2, 1, 1, "F");
      doc.setFillColor(...(pct >= 100 ? C.success : C.indigo));
      doc.roundedRect(gx + 3, y + 5, Math.max((pct / 100) * (gw - 6), 2), 2, 1, 1, "F");
    }
    y += 12;
  }

  insightBox("Key Win:", es.keyWin, true);
  insightBox("Key Risk:", es.keyRisk, false);

  // ── Growth Engine ──
  sectionHeader("Growth Engine");

  if (ge.trafficBySource?.length) {
    colTitle("Traffic by Source");
    y = drawBarChart(doc, ge.trafficBySource, margin, y, contentW, fontFamily, 8);
  }

  if (ge.trafficByMedium?.length) {
    checkPage(25);
    colTitle("Traffic by Medium");
    y = drawStackedBar(doc, ge.trafficByMedium, margin, y, contentW, fontFamily);
  }

  if (ge.topLandingPages?.length) {
    checkPage(50);
    colTitle("Top Landing Pages");
    y = drawBarChart(doc, ge.topLandingPages, margin, y, contentW, fontFamily, 8, C.indigo);
  }

  // ── Conversion Intelligence ──
  sectionHeader("Conversion Intelligence");

  if (ci.leadsByForm?.length) {
    const tableHead = [["Form", "Category", "Wt", "Leads", "CVR", "Failures", "Change"]];
    const tableBody = (ci.leadsByForm || []).map((f: any) => [
      safe(f.formName),
      safe(f.formCategory),
      `${f.weight}x`,
      String(f.leads),
      `${f.cvr || 0}%`,
      String(f.failures || 0),
      changeText(f.change),
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: tableBottomMargin },
      head: tableHead,
      body: tableBody,
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
        font: fontFamily,
        lineColor: C.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: GRADIENT_TOP,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: C.bgCard },
      columnStyles: {
        0: { cellWidth: 45 },
        6: { fontStyle: "bold" },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 6) {
          const val = parseFloat(data.cell.raw);
          if (val > 0) data.cell.styles.textColor = C.success;
          else if (val < 0) data.cell.styles.textColor = C.danger;
        }
        if (data.section === "body" && data.column.index === 5) {
          const val = parseInt(data.cell.raw);
          if (val > 0) data.cell.styles.textColor = C.danger;
        }
      },
      theme: "grid",
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (ci.leadSources?.length) {
    checkPage(45);
    colTitle("Lead Sources");
    const donutR = 14;
    const donutCx = margin + donutR + 5;
    const donutCy = y + donutR;
    drawDonutChart(doc, ci.leadSources.slice(0, 6), donutCx, donutCy, donutR, fontFamily);

    const legendX = margin + donutR * 2 + 18;
    const legendData = (ci.leadSources || []).slice(0, 6);
    const total = legendData.reduce((s: number, d: any) => s + d.count, 0) || 1;
    legendData.forEach((item: any, i: number) => {
      const ly = y + i * 5 + 2;
      doc.setFillColor(...CHART_PALETTE[i % CHART_PALETTE.length]);
      doc.circle(legendX, ly, 1.5, "F");
      doc.setFontSize(7);
      doc.setTextColor(...C.text);
      doc.setFont(fontFamily, "normal");
      doc.text(safe(item.label), legendX + 4, ly + 1);
      doc.setTextColor(...C.muted);
      const pct = Math.round((item.count / total) * 100);
      doc.text(`${item.count} (${pct}%)`, legendX + 50, ly + 1);
    });

    y += donutR * 2 + 6;
  }

  if (ci.topConvertingPages?.length) {
    checkPage(40);
    colTitle("Top Converting Pages");
    y = drawBarChart(doc, ci.topConvertingPages, margin, y, contentW, fontFamily, 6, C.indigo);
  }

  // ── Site Health ──
  if (sh) {
    sectionHeader("Site Health");

    const healthKpis: Array<{ label: string; value: any; change: null }> = [];
    if (sh.uptimePercent !== undefined) healthKpis.push({ label: "Uptime", value: `${sh.uptimePercent}%`, change: null });
    if (sh.brokenLinksCount !== undefined) healthKpis.push({ label: "Broken Links", value: sh.brokenLinksCount, change: null });
    if (sh.downtimeIncidents?.length !== undefined) healthKpis.push({ label: "Incidents", value: sh.downtimeIncidents.length, change: null });
    if (healthKpis.length) kpiRow(healthKpis);

    if (sh.downtimeIncidents?.length > 0) {
      colTitle("Downtime Incidents");
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, bottom: tableBottomMargin },
        head: [["Type", "Severity", "Started", "Duration"]],
        body: sh.downtimeIncidents.slice(0, 10).map((inc: any) => [
          safe(inc.type), safe(inc.severity),
          fmtDate(inc.started_at),
          inc.resolved_at ? safe(`${Math.round((new Date(inc.resolved_at).getTime() - new Date(inc.started_at).getTime()) / 60000)}m`) : "Ongoing",
        ]),
        styles: { fontSize: 7, cellPadding: 2, font: fontFamily, lineColor: C.border, lineWidth: 0.2 },
        headStyles: { fillColor: C.danger, textColor: C.white, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
  }

  // ── Form Health ──
  if (fh) {
    sectionHeader("Form Health");
    const fhKpis: Array<{ label: string; value: any; change: null }> = [];
    if (fh.overallFailureRate !== undefined) fhKpis.push({ label: "Failure Rate", value: `${fh.overallFailureRate}%`, change: null });
    if (fh.totalEstimatedValue !== undefined) fhKpis.push({ label: "Pipeline Value", value: `$${fmtNum(fh.totalEstimatedValue)}`, change: null });
    if (fhKpis.length) kpiRow(fhKpis);
  }

  // ── User Experience ──
  sectionHeader("User Experience Signals");

  if (ux.deviceBreakdown?.length) {
    colTitle("Device Breakdown");
    y = drawStackedBar(doc, ux.deviceBreakdown, margin, y, contentW, fontFamily);
  }

  if (ux.geoBreakdown?.length) {
    checkPage(45);
    colTitle("Geography");
    y = drawBarChart(doc, ux.geoBreakdown, margin, y, contentW, fontFamily, 10, C.indigo);
  }

  if (ux.topPages?.length) {
    checkPage(45);
    colTitle("Top Pages by Views");
    y = drawBarChart(doc, ux.topPages.slice(0, 8), margin, y, contentW, fontFamily, 8, C.indigo);
  }

  if (ux.referrerBreakdown?.length) {
    checkPage(35);
    colTitle("Referrers");
    y = drawBarChart(doc, ux.referrerBreakdown, margin, y, contentW, fontFamily, 6, C.indigo);
  }

  // ── Action Plan ──
  sectionHeader("Action Plan & Forecast");

  if (ap.forecast?.projectedNextMonth > 0) {
    checkPage(16);
    const low = Math.round(ap.forecast.projectedNextMonth * 0.9);
    const high = Math.round(ap.forecast.projectedNextMonth * 1.1);
    insightBox("Lead Forecast:", `Avg. ${ap.forecast.avgDailyLeads} leads/day - Projected next month: ${fmtNum(low)}-${fmtNum(high)}`, true);
  }

  if (ap.recommendations?.length) {
    colTitle("Recommendations");
    recommendations(ap.recommendations);
  }

  if (ap.contentOpportunities?.length > 0) {
    checkPage(30);
    colTitle("Content Opportunities");
    y = drawBarChart(
      doc,
      ap.contentOpportunities.map((o: any) => ({ label: o.page, count: o.views })),
      margin, y, contentW, fontFamily, 6, C.indigo,
    );
  }

  // ─── FOOTER ON EVERY PAGE ───
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pH = doc.internal.pageSize.getHeight();

    doc.setFillColor(...C.bg);
    doc.rect(0, pH - FOOTER_H, pageW, FOOTER_H, "F");
    doc.setFillColor(...GRADIENT_TOP);
    doc.rect(0, pH - FOOTER_H, pageW, 0.5, "F");

    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.setFont(fontFamily, "normal");
    doc.text(safe(`ACTV TRKR  |  Generated ${fmtDate(report.generatedAt)}`), margin, pH - FOOTER_H / 2 + 1);

    doc.setFillColor(...GRADIENT_TOP);
    const pageText = `${i} / ${pageCount}`;
    const pageTextW = doc.getTextWidth(pageText) + 4;
    doc.roundedRect(pageW - margin - pageTextW, pH - FOOTER_H / 2 - 2, pageTextW, 5, 1, 1, "F");
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.setFont(fontFamily, "bold");
    doc.text(pageText, pageW - margin - pageTextW / 2, pH - FOOTER_H / 2 + 1, { align: "center" });
  }

  return doc;
}
