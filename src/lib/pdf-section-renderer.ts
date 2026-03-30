import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Shared helper: captures each [data-pdf-section] element individually
 * and places them onto A4 PDF pages with proper overflow handling.
 */

interface SectionRenderOptions {
  container: HTMLElement;
  doc: jsPDF;
  margin: number;
  headerH: number;
  footerH: number;
  contentW: number;       // mm
  pageW: number;          // mm (210 for A4)
  pageH: number;          // mm (297 for A4)
  footerRenderer: (doc: jsPDF, page: number, totalPages: number) => void;
}

export async function renderSectionsToPdf(opts: SectionRenderOptions): Promise<void> {
  const { container, doc, margin, headerH, footerH, contentW, pageW, pageH, footerRenderer } = opts;
  const printableH = pageH - margin * 2 - headerH - footerH;

  const sections = container.querySelectorAll("[data-pdf-section]");
  if (sections.length === 0) {
    // Fallback: capture the whole container as a single section
    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: "#ffffff", width: 680, windowWidth: 680,
    });
    const sliceHmm = (canvas.height / canvas.width) * contentW;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin + headerH, contentW, sliceHmm);
    footerRenderer(doc, 0, 1);
    return;
  }

  // Capture each section as its own canvas
  const sectionCanvases: HTMLCanvasElement[] = [];
  for (const el of Array.from(sections)) {
    const canvas = await html2canvas(el as HTMLElement, {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: "#ffffff", width: 680, windowWidth: 680,
    });
    sectionCanvases.push(canvas);
  }

  // Convert section canvases to mm heights
  const sectionHeights = sectionCanvases.map(
    (c) => (c.height / c.width) * contentW
  );

  const gap = 3; // mm gap between sections
  let currentY = margin + headerH; // current Y in mm on current page
  let pageIndex = 0;

  // First pass: compute page assignments for total page count
  interface Placement {
    canvasIdx: number;
    pageIdx: number;
    y: number;
    h: number;
    // For tall sections that need slicing
    srcYPx?: number;
    srcHPx?: number;
  }

  const placements: Placement[] = [];
  let simY = margin + headerH;
  let simPage = 0;

  for (let i = 0; i < sectionCanvases.length; i++) {
    const h = sectionHeights[i];
    const remaining = pageH - margin - footerH - simY;

    if (h <= remaining) {
      // Fits on current page
      placements.push({ canvasIdx: i, pageIdx: simPage, y: simY, h });
      simY += h + gap;
    } else if (h <= printableH) {
      // Doesn't fit, but fits on a fresh page
      simPage++;
      simY = margin + headerH;
      placements.push({ canvasIdx: i, pageIdx: simPage, y: simY, h });
      simY += h + gap;
    } else {
      // Section is taller than a full page — slice it
      const canvas = sectionCanvases[i];
      const pxPerMm = canvas.height / h;
      let srcYPx = 0;
      let remainingH = h;

      // If there's meaningful space on current page, use it
      const spaceOnCurrent = pageH - margin - footerH - simY;
      if (spaceOnCurrent > printableH * 0.2) {
        const sliceH = Math.min(remainingH, spaceOnCurrent);
        const slicePx = Math.round(sliceH * pxPerMm);
        placements.push({
          canvasIdx: i, pageIdx: simPage, y: simY, h: sliceH,
          srcYPx, srcHPx: slicePx,
        });
        srcYPx += slicePx;
        remainingH -= sliceH;
      }

      while (remainingH > 0.5) {
        simPage++;
        simY = margin + headerH;
        const sliceH = Math.min(remainingH, printableH);
        const slicePx = Math.round(sliceH * pxPerMm);
        placements.push({
          canvasIdx: i, pageIdx: simPage, y: simY, h: sliceH,
          srcYPx, srcHPx: slicePx,
        });
        srcYPx += slicePx;
        remainingH -= sliceH;
        simY += sliceH + gap;
      }
    }
  }

  const totalPages = simPage + 1;

  // Second pass: render placements to PDF
  for (const p of placements) {
    // Add pages as needed
    while (pageIndex < p.pageIdx) {
      footerRenderer(doc, pageIndex, totalPages);
      doc.addPage();
      pageIndex++;
    }

    const canvas = sectionCanvases[p.canvasIdx];

    if (p.srcYPx !== undefined && p.srcHPx !== undefined) {
      // Sliced tall section
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = p.srcHPx;
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, p.srcYPx, canvas.width, p.srcHPx, 0, 0, canvas.width, p.srcHPx);
      doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, p.y, contentW, p.h);
    } else {
      // Whole section
      doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, p.y, contentW, p.h);
    }
  }

  // Render footer on the last page
  footerRenderer(doc, pageIndex, totalPages);
}
