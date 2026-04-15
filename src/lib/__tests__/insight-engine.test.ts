import { describe, it, expect } from "vitest";
import { generateFindings, InsightInputs } from "../insight-engine";

const base: InsightInputs = {
  currentSessions: 100,
  previousSessions: 100,
  currentLeads: 10,
  previousLeads: 10,
  currentCvr: 5,
  previousCvr: 5,
};

describe("generateFindings", () => {
  it("returns empty for flat metrics", () => {
    expect(generateFindings(base)).toEqual([]);
  });

  it("detects traffic_up at +10%", () => {
    const f = generateFindings({ ...base, currentSessions: 110, previousSessions: 100 });
    expect(f.some(r => r.type === "traffic_up")).toBe(true);
  });

  it("does not trigger traffic_up below 10%", () => {
    const f = generateFindings({ ...base, currentSessions: 109, previousSessions: 100 });
    expect(f.some(r => r.type === "traffic_up")).toBe(false);
  });

  it("detects traffic_down with high severity at -25%", () => {
    const f = generateFindings({ ...base, currentSessions: 75, previousSessions: 100 });
    const td = f.find(r => r.type === "traffic_down");
    expect(td).toBeDefined();
    expect(td!.severity).toBe("high");
  });

  it("detects traffic_down with medium severity at -15%", () => {
    const f = generateFindings({ ...base, currentSessions: 85, previousSessions: 100 });
    const td = f.find(r => r.type === "traffic_down");
    expect(td).toBeDefined();
    expect(td!.severity).toBe("medium");
  });

  it("suppresses comparisons when org too new", () => {
    const f = generateFindings({
      ...base,
      currentSessions: 200,
      previousSessions: 100,
      orgAgeDays: 5,
      rangeDays: 7,
    });
    expect(f.some(r => r.type === "traffic_up")).toBe(false);
  });

  it("allows comparisons when org old enough", () => {
    const f = generateFindings({
      ...base,
      currentSessions: 200,
      previousSessions: 100,
      orgAgeDays: 30,
      rangeDays: 7,
    });
    expect(f.some(r => r.type === "traffic_up")).toBe(true);
  });

  it("suppresses when previous is 0 (no baseline)", () => {
    const f = generateFindings({ ...base, currentSessions: 100, previousSessions: 0 });
    expect(f.some(r => r.type === "traffic_up")).toBe(false);
  });

  it("detects lead_growth", () => {
    const f = generateFindings({ ...base, currentLeads: 20, previousLeads: 10 });
    expect(f.some(r => r.type === "lead_growth")).toBe(true);
  });

  it("detects lead_drop with high severity", () => {
    const f = generateFindings({ ...base, currentLeads: 7, previousLeads: 10 });
    const ld = f.find(r => r.type === "lead_drop");
    expect(ld).toBeDefined();
    expect(ld!.severity).toBe("medium");
  });

  it("detects form_abandonment", () => {
    const f = generateFindings({
      ...base,
      formStats: [{ name: "Contact", starts: 20, submissions: 5 }],
    });
    expect(f.some(r => r.type === "form_abandonment")).toBe(true);
  });

  it("does not flag forms with good completion", () => {
    const f = generateFindings({
      ...base,
      formStats: [{ name: "Contact", starts: 10, submissions: 9 }],
    });
    expect(f.some(r => r.type === "form_abandonment")).toBe(false);
  });

  it("detects broken links above threshold", () => {
    const f = generateFindings({ ...base, brokenLinksCount: 6 });
    expect(f.some(r => r.type === "site_health_issue" && r.title.includes("Broken"))).toBe(true);
  });

  it("does not flag broken links at 5 or below", () => {
    const f = generateFindings({ ...base, brokenLinksCount: 5 });
    expect(f.some(r => r.type === "site_health_issue" && r.title.includes("Broken"))).toBe(false);
  });

  it("detects active incidents", () => {
    const f = generateFindings({ ...base, activeIncidents: 1 });
    expect(f.some(r => r.type === "site_health_issue" && r.severity === "high")).toBe(true);
  });

  it("detects SEO score improvement", () => {
    const f = generateFindings({ ...base, seoScore: 80, previousSeoScore: 70 });
    expect(f.some(r => r.type === "seo_visibility_gain")).toBe(true);
  });

  it("detects SEO score decline", () => {
    const f = generateFindings({ ...base, seoScore: 60, previousSeoScore: 70 });
    expect(f.some(r => r.type === "seo_visibility_loss")).toBe(true);
  });

  it("sorts high severity and negative findings first", () => {
    const f = generateFindings({
      ...base,
      currentSessions: 200,
      previousSessions: 100,
      activeIncidents: 1,
    });
    expect(f[0].severity).toBe("high");
    expect(f[0].positive).toBe(false);
  });

  it("detects mobile dropoff", () => {
    const f = generateFindings({
      ...base,
      deviceBreakdown: [
        { device: "desktop", sessions: 100, leads: 10 },
        { device: "mobile", sessions: 100, leads: 2 },
      ],
    });
    expect(f.some(r => r.type === "mobile_dropoff")).toBe(true);
  });

  it("limits high_intent_low_performance to 2 max", () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      path: `/page-${i}`,
      views: 100,
      exits: 10,
      leads: 0,
    }));
    const f = generateFindings({ ...base, topPages: pages });
    expect(f.filter(r => r.type === "high_intent_low_performance").length).toBeLessThanOrEqual(2);
  });
});
