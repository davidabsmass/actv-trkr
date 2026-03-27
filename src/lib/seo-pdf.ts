import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { SeoIssue } from "@/lib/seo-scoring";
import { getScoreGrade, getScoreStatus } from "@/lib/seo-scoring";

interface WhiteLabelConfig {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  client_name?: string;
  logo_url?: string;
  hide_actv_branding?: boolean;
}

interface BlendedInsight {
  page: string;
  title: string;
  explanation: string;
}

interface SeoReportData {
  url: string;
  score: number;
  issues: SeoIssue[];
  platform: string | null;
  scannedAt: string;
  blendedInsights?: BlendedInsight[];
}

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

const impactColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Critical: { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626", dot: "#dc2626" },
  High: { bg: "#fffbeb", border: "#fcd34d", text: "#d97706", dot: "#d97706" },
  Medium: { bg: "#eff6ff", border: "#93c5fd", text: "#2563eb", dot: "#2563eb" },
  Low: { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280", dot: "#6b7280" },
};

function buildSeoHtml(data: SeoReportData, wl?: WhiteLabelConfig | null): string {
  const brandPrimary = wl?.primary_color || "#635bff";
  const brandSecondary = wl?.secondary_color || "#9449e0";
  const brandGradientStart = wl?.primary_color || "#6d5dd4";
  const brandName = (wl?.hide_actv_branding || wl?.logo_url) ? (wl?.client_name || "") : "ACTV TRKR";

  const grade = getScoreGrade(data.score);
  const status = getScoreStatus(data.score);
  const statusColor = status === "excellent" ? "#21c45d" : status === "good" ? "#2563eb" : status === "needs-work" ? "#d97706" : "#dc2626";

  const grouped = {
    Critical: data.issues.filter(i => i.impact === "Critical"),
    High: data.issues.filter(i => i.impact === "High"),
    Medium: data.issues.filter(i => i.impact === "Medium"),
    Low: data.issues.filter(i => i.impact === "Low"),
  };

  const sectionStart = (icon: string, title: string) => `
    <div style="border:1px solid #e4e6ed;border-radius:8px;background:#fff;padding:20px;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid">
      <div style="font-size:13px;font-weight:600;color:#00264d;margin-bottom:14px;display:flex;align-items:center;gap:6px">
        <span style="color:${brandPrimary}">${icon}</span> ${safe(title)}
      </div>`;
  const sectionEnd = `</div>`;

  let html = `
<div style="font-family:'BR Omega','Segoe UI',system-ui,sans-serif;color:#00264d;width:680px;padding:0;background:#fff">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,${brandGradientStart},${brandSecondary});padding:24px 28px;border-radius:8px 8px 0 0;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      ${wl?.logo_url ? `<img src="${wl.logo_url}" style="height:36px;max-width:180px;object-fit:contain;filter:brightness(0) invert(1);opacity:1" crossorigin="anonymous" />` : ''}
      ${brandName ? `<span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.02em">${brandName}</span>` : ''}
      <span style="width:4px;height:4px;background:#fff;border-radius:50%;display:inline-block"></span>
      <span style="font-size:10px;color:rgba(255,255,255,0.8)">SEO Report</span>
    </div>
    <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:6px">SEO Insights Report</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.85)">${safe(data.url)} · Scanned ${fmtDate(data.scannedAt)}</div>
  </div>`;

  // Score card
  html += sectionStart("◎", "SEO Score Overview");
  html += `
    <div style="display:flex;align-items:center;gap:24px;margin-bottom:14px">
      <div style="text-align:center">
        <div style="font-size:48px;font-weight:700;color:${statusColor}">${data.score}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#6b6f80;margin-top:2px">SEO Score</div>
      </div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:16px;font-weight:700;color:${statusColor}">Grade: ${grade}</span>
          ${data.platform ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;border:1px solid #e4e6ed;color:#6b6f80">${safe(data.platform)}</span>` : ''}
        </div>
        <div style="display:flex;gap:12px">
          ${(["Critical", "High", "Medium", "Low"] as const).map(impact => `
            <div style="text-align:center;flex:1;padding:8px;background:#f5f5fa;border-radius:6px">
              <div style="font-size:18px;font-weight:700;color:${impactColors[impact].text}">${grouped[impact].length}</div>
              <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.04em;color:#6b6f80">${impact}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>`;
  html += sectionEnd;

  // Issues by priority
  for (const impact of ["Critical", "High", "Medium", "Low"] as const) {
    const group = grouped[impact];
    if (group.length === 0) continue;

    const colors = impactColors[impact];
    html += sectionStart(
      `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors.dot}"></span>`,
      `${impact} Issues (${group.length})`
    );

    for (const issue of group) {
      html += `
        <div style="padding:12px 14px;border-radius:6px;background:${colors.bg};border:1px solid ${colors.border}40;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:12px;font-weight:600;color:#00264d">${safe(issue.title)}</span>
            ${issue.category ? `<span style="font-size:9px;text-transform:uppercase;padding:1px 6px;border-radius:8px;border:1px solid #e4e6ed;color:#6b6f80">${safe(issue.category)}</span>` : ''}
          </div>
          <div style="font-size:11px;color:#4b5563;line-height:1.5">${safe(issue.fix)}</div>
        </div>`;
    }
    html += sectionEnd;
  }

  // Blended insights
  if (data.blendedInsights && data.blendedInsights.length > 0) {
    html += `<div class="force-page-break" style="height:4px"></div>`;
    html += sectionStart("✦", "SEO + Engagement Insights");
    for (const insight of data.blendedInsights) {
      html += `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:6px;background:${brandPrimary}0d;border:1px solid ${brandPrimary}1a;margin-bottom:8px">
          <div>
            <div style="font-size:11px;font-weight:600;color:#00264d;margin-bottom:2px">${safe(insight.page)}</div>
            <div style="font-size:12px;font-weight:600;color:#00264d">${safe(insight.title)}</div>
            <div style="font-size:11px;color:#6b6f80;margin-top:2px">${safe(insight.explanation)}</div>
          </div>
        </div>`;
    }
    html += sectionEnd;
  }

  // Footer
  html += `<div style="text-align:center;padding:12px 0;font-size:10px;color:#6b6f80">
    ${brandName ? brandName + ' · ' : ''}Generated ${fmtDate(new Date().toISOString())}
  </div>`;

  html += `</div>`;
  return html;
}

export async function buildSeoPdf(data: SeoReportData, whiteLabel?: WhiteLabelConfig | null): Promise<jsPDF> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "680px";
  container.style.background = "#ffffff";
  container.style.zIndex = "-1";
  container.innerHTML = buildSeoHtml(data, whiteLabel);
  document.body.appendChild(container);

  await new Promise((r) => setTimeout(r, 150));

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

    const findBreakPoints = (): number[] => {
      const ctx = canvas.getContext("2d")!;
      const breaks: number[] = [];
      const scanWidth = Math.min(imgW, 100);
      const gapThreshold = Math.round(12 * (canvas.width / 680));

      for (let y = gapThreshold; y < imgH - gapThreshold; y += 2) {
        const row = ctx.getImageData(10, y, scanWidth, 1).data;
        let isWhite = true;
        for (let x = 0; x < row.length; x += 4) {
          if (row[x] < 250 || row[x + 1] < 250 || row[x + 2] < 250) {
            isWhite = false;
            break;
          }
        }
        if (isWhite) {
          if (breaks.length === 0 || y - breaks[breaks.length - 1] > gapThreshold) {
            breaks.push(y);
          }
        }
      }
      return breaks;
    };

    const naturalBreaks = findBreakPoints();
    const scale = canvas.width / 680;
    const forcedBreaksPx = forcedBreakOffsets.map((o) => Math.round(o * scale));

    const pageSlices: Array<{ srcY: number; srcH: number }> = [];
    let currentY = 0;
    const maxSliceH = Math.round(printableH * pxPerMm);
    const sortedForced = [...forcedBreaksPx].sort((a, b) => a - b);

    while (currentY < imgH) {
      const idealEnd = currentY + maxSliceH;
      if (idealEnd >= imgH) {
        pageSlices.push({ srcY: currentY, srcH: imgH - currentY });
        break;
      }

      let breakAt = -1;
      for (const fb of sortedForced) {
        if (fb <= currentY) continue;
        if (fb <= idealEnd) { breakAt = fb; break; }
        break;
      }

      if (breakAt < 0) {
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
    const footerBrandHex = whiteLabel?.primary_color || "#6d5dd4";
    const fbR = parseInt(footerBrandHex.slice(1, 3), 16);
    const fbG = parseInt(footerBrandHex.slice(3, 5), 16);
    const fbB = parseInt(footerBrandHex.slice(5, 7), 16);
    const footerBrand = (whiteLabel?.hide_actv_branding || whiteLabel?.logo_url) ? (whiteLabel?.client_name || "") : "ACTV TRKR";

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
      doc.setDrawColor(fbR, fbG, fbB);
      doc.setLineWidth(0.3);
      doc.line(0, pageH - footerH - margin + 2, pageW, pageH - footerH - margin + 2);

      doc.setFontSize(7);
      doc.setTextColor(107, 111, 128);
      doc.text(`${footerBrand}${footerBrand ? "  |  " : ""}SEO Report · Generated ${fmtDate(new Date().toISOString())}`, margin, pageH - margin + 1);

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
