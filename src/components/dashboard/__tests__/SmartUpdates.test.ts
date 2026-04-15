import { describe, it, expect } from "vitest";
import { generateInsights, SmartInsight } from "../SmartUpdates";

describe("generateInsights", () => {
  const baseData = {
    sessions: { current: 100, previous: 100 },
    leads: { current: 10, previous: 10 },
    cvr: { current: 0.1, previous: 0.1 },
  };

  it("returns empty for flat metrics", () => {
    expect(generateInsights(baseData)).toEqual([]);
  });

  it("detects leads_drop at -25%", () => {
    const r = generateInsights({ ...baseData, leads: { current: 7, previous: 10 } });
    expect(r.some(i => i.id === "leads_drop")).toBe(true);
  });

  it("detects traffic_spike at +30%", () => {
    const r = generateInsights({ ...baseData, sessions: { current: 130, previous: 100 } });
    expect(r.some(i => i.id === "traffic_spike")).toBe(true);
  });

  it("detects cvr_drop at -20%", () => {
    const r = generateInsights({ ...baseData, cvr: { current: 0.08, previous: 0.1 } });
    expect(r.some(i => i.id === "cvr_drop")).toBe(true);
  });

  it("sorts by focus weight", () => {
    const data = {
      ...baseData,
      leads: { current: 5, previous: 10 },
      sessions: { current: 130, previous: 100 },
    };
    const leadFocused = generateInsights(data, "lead_volume");
    expect(leadFocused[0].id).toBe("leads_drop");

    const marketingFocused = generateInsights(data, "marketing_impact");
    // leads_drop and traffic_spike both present; marketing focuses on traffic
    expect(marketingFocused.some(i => i.id === "traffic_spike")).toBe(true);
  });

  it("detects top_page insight", () => {
    const r = generateInsights({
      ...baseData,
      pages: [{ page_path: "/contact", sessions: 50, leads: 5, cvr: 0.1 }],
    });
    expect(r.some(i => i.id === "top_page")).toBe(true);
  });
});
