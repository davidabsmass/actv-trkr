// Builds a buyer-ready Diligence Pack: a branded multi-page PDF + ZIP of all CSVs.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import type { AcquisitionData } from "./useAcquisitionData";
import {
  buildMonthlyArr,
  buildRetention,
  buildConcentration,
  buildFinance,
  diligenceReadinessScore,
} from "./calculations";

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
const fmtPct = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : `${n.toFixed(d)}%`;
const fmtNum = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : n.toFixed(d);

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type DiligencePackResult = {
  pdfBlob: Blob;
  zipBlob: Blob;
  generatedAt: Date;
};

export async function buildDiligencePack(data: AcquisitionData): Promise<DiligencePackResult> {
  const arr = buildMonthlyArr(data.subscribers, 24);
  const retention = buildRetention(arr);
  const concentration = buildConcentration(data.contracts, data.subscribers);
  const finance = buildFinance(data.finance, arr);
  const readiness = diligenceReadinessScore(data.checklist);
  const latest = arr[arr.length - 1];
  const latestNrr = retention.filter((r) => r.nrr != null).slice(-1)[0]?.nrr ?? null;
  const latestGrr = retention.filter((r) => r.grr != null).slice(-1)[0]?.grr ?? null;
  const generatedAt = new Date();

  // ── PDF ───────────────────────────────────────────────────────────────────
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  const addHeader = (title: string, subtitle?: string) => {
    pdf.setFillColor(99, 91, 255);
    pdf.rect(0, 0, pageWidth, 56, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("Acquisition Readiness — Diligence Pack", margin, 26);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generated ${generatedAt.toLocaleString()}`, margin, 44);
    pdf.setTextColor(20, 20, 30);
    y = 80;
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, margin, y);
    y += 8;
    if (subtitle) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(110, 110, 120);
      pdf.text(subtitle, margin, (y += 14));
      pdf.setTextColor(20, 20, 30);
    }
    y += 16;
  };

  const newPage = (title: string, subtitle?: string) => {
    pdf.addPage();
    addHeader(title, subtitle);
  };

  // Page 1 — Executive Summary
  addHeader("Executive Summary", "Headline metrics for buyer review");
  const kpis: Array<[string, string]> = [
    ["ARR", fmtMoney(latest?.arr)],
    ["MRR", fmtMoney(latest?.mrr)],
    ["Active Customers", String(latest?.active_customers ?? "—")],
    ["Net New ARR (latest mo)", fmtMoney(latest?.net_new_arr)],
    ["NRR (latest)", fmtPct(latestNrr)],
    ["GRR (latest)", fmtPct(latestGrr)],
    ["Top Customer % of ARR", fmtPct(concentration.top_1_pct)],
    ["Top 5 % of ARR", fmtPct(concentration.top_5_pct)],
    ["Top 10 % of ARR", fmtPct(concentration.top_10_pct)],
    ["Gross Margin %", fmtPct(finance.gross_margin_pct)],
    ["Burn Rate (mo)", fmtMoney(finance.burn_rate)],
    ["Burn Multiple", fmtNum(finance.burn_multiple, 2)],
    ["Cash Runway (mo)", fmtNum(finance.cash_runway_months)],
    ["Rule of 40", fmtNum(finance.rule_of_40)],
    ["ARR / Employee", fmtMoney(finance.arr_per_employee)],
    ["Diligence Readiness", `${readiness.score}/100`],
  ];
  autoTable(pdf, {
    startY: y,
    head: [["Metric", "Value"]],
    body: kpis,
    theme: "striped",
    headStyles: { fillColor: [99, 91, 255], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });

  // Page 2 — Diligence Readiness Breakdown
  newPage("Diligence Readiness", `Overall ${readiness.score}/100 — ${readiness.ready} ready, ${readiness.partial} partial, ${readiness.missing} missing`);
  const sectionsMap = new Map<string, typeof data.checklist>();
  data.checklist.forEach((c) => {
    if (!sectionsMap.has(c.section_key)) sectionsMap.set(c.section_key, []);
    sectionsMap.get(c.section_key)!.push(c);
  });
  const sectionRows = Array.from(sectionsMap.entries()).map(([key, items]) => {
    const r = diligenceReadinessScore(items);
    return [key.replace(/_/g, " "), `${r.ready}/${r.total}`, `${r.partial}`, `${r.missing}`, `${r.score}/100`];
  });
  autoTable(pdf, {
    startY: y,
    head: [["Section", "Ready", "Partial", "Missing", "Score"]],
    body: sectionRows,
    theme: "striped",
    headStyles: { fillColor: [99, 91, 255], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: margin, right: margin },
  });

  // Page 3 — ARR/MRR trend (last 12 months)
  newPage("ARR & MRR Trend", "Last 12 months");
  const arrRows = arr.slice(-12).map((p) => [p.month, fmtMoney(p.mrr), fmtMoney(p.arr), String(p.active_customers), fmtMoney(p.new_arr), fmtMoney(p.churned_arr), fmtMoney(p.net_new_arr)]);
  autoTable(pdf, {
    startY: y,
    head: [["Month", "MRR", "ARR", "Customers", "New ARR", "Churned ARR", "Net New"]],
    body: arrRows,
    theme: "striped",
    headStyles: { fillColor: [99, 91, 255], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: margin, right: margin },
  });

  // Page 4 — Top Customers
  newPage("Top Customers by ARR", `Top 5 of ${data.contracts.length || data.subscribers.length} customers`);
  const topRows = concentration.top_5.map((c, i) => [String(i + 1), c.name, fmtMoney(c.arr), fmtPct(c.pct)]);
  autoTable(pdf, {
    startY: y,
    head: [["#", "Customer", "ARR", "% of Total"]],
    body: topRows,
    theme: "striped",
    headStyles: { fillColor: [99, 91, 255], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: margin, right: margin },
  });

  // Page 5 — Risk Register
  newPage("Risk Register", `${data.risks.length} flags · open & resolved`);
  const riskRows = data.risks.slice(0, 50).map((r) => [r.severity, r.risk_type, r.title, r.status, r.due_date ?? "—"]);
  if (riskRows.length) {
    autoTable(pdf, {
      startY: y,
      head: [["Severity", "Type", "Title", "Status", "Due"]],
      body: riskRows,
      theme: "striped",
      headStyles: { fillColor: [99, 91, 255], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 2: { cellWidth: 220 } },
      margin: { left: margin, right: margin },
    });
  } else {
    pdf.setFontSize(10);
    pdf.text("No risk flags recorded.", margin, y);
  }

  // Page 6 — Vendors & Tech Dependencies
  newPage("Vendors & Tech Dependencies", "Critical third parties");
  const vendorRows = data.vendors.map((v) => [v.vendor_name, v.category ?? "—", v.criticality ?? "—", v.risk_level ?? "—", fmtMoney(v.monthly_cost)]);
  if (vendorRows.length) {
    autoTable(pdf, {
      startY: y,
      head: [["Vendor", "Category", "Criticality", "Risk", "Monthly $"]],
      body: vendorRows,
      theme: "striped",
      headStyles: { fillColor: [99, 91, 255], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left: margin, right: margin },
    });
  }

  // Page 7 — Finance trend
  newPage("Financial Efficiency", "Monthly P&L summary");
  const finRows = finance.monthly_series.slice(-12).map((f) => [f.month, fmtMoney(f.revenue), fmtMoney(f.cogs), fmtMoney(f.opex), fmtPct(f.gross_margin_pct), fmtMoney(f.burn), String(f.headcount)]);
  if (finRows.length) {
    autoTable(pdf, {
      startY: y,
      head: [["Month", "Revenue", "COGS", "Opex", "GM %", "Burn", "HC"]],
      body: finRows,
      theme: "striped",
      headStyles: { fillColor: [99, 91, 255], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: { left: margin, right: margin },
    });
  } else {
    pdf.setFontSize(10);
    pdf.text("No finance data recorded.", margin, y);
  }

  // Footer page numbers
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 150);
    pdf.text(`Page ${i} of ${pageCount} · CONFIDENTIAL — for diligence use only`, margin, pdf.internal.pageSize.getHeight() - 20);
  }

  const pdfBlob = pdf.output("blob");

  // ── ZIP of CSVs ───────────────────────────────────────────────────────────
  const zip = new JSZip();
  const folder = zip.folder("diligence-pack")!;
  folder.file("00-kpi-summary.csv", rowsToCsv(kpis.map(([metric, value]) => ({ metric, value }))));
  folder.file("arr-monthly.csv", rowsToCsv(arr));
  folder.file("retention-monthly.csv", rowsToCsv(retention));
  folder.file("subscribers.csv", rowsToCsv(data.subscribers));
  folder.file("customer-contracts.csv", rowsToCsv(data.contracts));
  folder.file("finance-monthly.csv", rowsToCsv(data.finance));
  folder.file("risk-flags.csv", rowsToCsv(data.risks));
  folder.file("vendor-registry.csv", rowsToCsv(data.vendors));
  folder.file("technology-dependencies.csv", rowsToCsv(data.techDeps));
  folder.file("ip-assignments.csv", rowsToCsv(data.ipAssignments));
  folder.file("founder-dependencies.csv", rowsToCsv(data.founderDeps));
  folder.file("security-incidents.csv", rowsToCsv(data.incidents));
  folder.file("operational-documents.csv", rowsToCsv(data.documents));
  folder.file("forecast-assumptions.csv", rowsToCsv(data.forecasts));
  folder.file("metric-definitions.csv", rowsToCsv(data.metrics));
  folder.file("diligence-checklist.csv", rowsToCsv(data.checklist));
  folder.file("reconciliation-status.csv", rowsToCsv(data.reconciliation));
  folder.file(
    "concentration-report.csv",
    rowsToCsv([
      ...concentration.top_5.map((c) => ({ section: "top_customers", name: c.name, arr: c.arr, pct: c.pct })),
      ...concentration.by_industry.map((c) => ({ section: "by_industry", name: c.key, arr: c.arr, pct: c.pct })),
      ...concentration.by_geography.map((c) => ({ section: "by_geography", name: c.key, arr: c.arr, pct: c.pct })),
      ...concentration.by_plan.map((c) => ({ section: "by_plan", name: c.key, arr: c.arr, pct: c.pct })),
    ]),
  );
  folder.file(
    "README.txt",
    [
      "ACTV TRKR — Acquisition Diligence Pack",
      `Generated: ${generatedAt.toISOString()}`,
      "",
      "Contents:",
      "  diligence-pack.pdf       — Executive summary report (read first)",
      "  00-kpi-summary.csv       — Headline metrics",
      "  arr-monthly.csv          — Monthly ARR / MRR / customer counts",
      "  retention-monthly.csv    — NRR, GRR, logo churn by month",
      "  customer-contracts.csv   — Contract register",
      "  subscribers.csv          — Active subscriber list",
      "  finance-monthly.csv      — Monthly P&L (revenue, COGS, opex, cash)",
      "  risk-flags.csv           — Risk register",
      "  vendor-registry.csv      — Critical vendors",
      "  technology-dependencies.csv",
      "  ip-assignments.csv",
      "  founder-dependencies.csv",
      "  security-incidents.csv",
      "  operational-documents.csv",
      "  forecast-assumptions.csv",
      "  metric-definitions.csv   — Formulas & data sources",
      "  diligence-checklist.csv  — Readiness items by section",
      "  reconciliation-status.csv",
      "  concentration-report.csv",
      "",
      "CONFIDENTIAL — for diligence use only.",
    ].join("\n"),
  );
  folder.file("diligence-pack.pdf", pdfBlob);

  const zipBlob = await zip.generateAsync({ type: "blob" });

  return { pdfBlob, zipBlob, generatedAt };
}

export function downloadDiligencePackPdf(blob: Blob, generatedAt: Date) {
  const stamp = generatedAt.toISOString().slice(0, 10);
  triggerDownload(blob, `diligence-pack-${stamp}.pdf`);
}

export function downloadDiligencePackZip(blob: Blob, generatedAt: Date) {
  const stamp = generatedAt.toISOString().slice(0, 10);
  triggerDownload(blob, `diligence-pack-${stamp}.zip`);
}
