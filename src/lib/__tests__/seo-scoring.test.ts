import { describe, it, expect } from "vitest";
import {
  calculateScore,
  getScoreGrade,
  getScoreStatus,
  calculateSeverityMultiplier,
  SeoIssue,
} from "../seo-scoring";

const issue = (impact: SeoIssue["impact"], overrides?: Partial<SeoIssue>): SeoIssue => ({
  id: "test",
  title: "Test",
  fix: "Fix it",
  impact,
  ...overrides,
});

describe("calculateScore", () => {
  it("returns 100 for no issues", () => {
    expect(calculateScore([])).toBe(100);
  });

  it("deducts correctly for a single Critical issue", () => {
    expect(calculateScore([issue("Critical")])).toBe(85); // 100 - 15
  });

  it("deducts correctly for a single High issue", () => {
    expect(calculateScore([issue("High")])).toBe(92); // 100 - 8
  });

  it("deducts correctly for Medium and Low", () => {
    expect(calculateScore([issue("Medium")])).toBe(96);
    expect(calculateScore([issue("Low")])).toBe(98);
  });

  it("caps score at 0 for massive deductions", () => {
    const issues = Array.from({ length: 20 }, () => issue("Critical"));
    expect(calculateScore(issues)).toBe(0);
  });

  it("applies severityMultiplier up to 3x cap", () => {
    const i = issue("High", { severityMultiplier: 2.0 });
    expect(calculateScore([i])).toBe(84); // 100 - (8*2)
  });

  it("caps severityMultiplier at 3.0", () => {
    const i = issue("High", { severityMultiplier: 10.0 });
    expect(calculateScore([i])).toBe(76); // 100 - (8*3)
  });
});

describe("getScoreGrade", () => {
  it.each([
    [100, "A"], [90, "A"], [89, "B"], [75, "B"],
    [74, "C"], [60, "C"], [59, "D"], [45, "D"],
    [44, "F"], [0, "F"],
  ])("score %i → grade %s", (score, grade) => {
    expect(getScoreGrade(score)).toBe(grade);
  });
});

describe("getScoreStatus", () => {
  it.each([
    [100, "excellent"], [80, "excellent"],
    [79, "good"], [60, "good"],
    [59, "needs-work"], [40, "needs-work"],
    [39, "poor"], [0, "poor"],
  ] as const)("score %i → %s", (score, status) => {
    expect(getScoreStatus(score)).toBe(status);
  });
});

describe("calculateSeverityMultiplier", () => {
  it("returns 1.0 for count <= 1 or undefined", () => {
    expect(calculateSeverityMultiplier("h1-multiple")).toBe(1.0);
    expect(calculateSeverityMultiplier("h1-multiple", 0)).toBe(1.0);
    expect(calculateSeverityMultiplier("h1-multiple", 1)).toBe(1.0);
  });

  it("scales h1-multiple correctly", () => {
    expect(calculateSeverityMultiplier("h1-multiple", 2)).toBe(1.0);
    expect(calculateSeverityMultiplier("h1-multiple", 5)).toBe(1.3);
    expect(calculateSeverityMultiplier("h1-multiple", 10)).toBe(1.7);
    expect(calculateSeverityMultiplier("h1-multiple", 11)).toBe(2.0);
  });

  it("scales images-without-alt correctly", () => {
    expect(calculateSeverityMultiplier("images-without-alt", 5)).toBe(1.0);
    expect(calculateSeverityMultiplier("images-without-alt", 15)).toBe(1.3);
    expect(calculateSeverityMultiplier("images-without-alt", 30)).toBe(1.6);
    expect(calculateSeverityMultiplier("images-without-alt", 31)).toBe(2.0);
  });

  it("uses default scaling for unknown ids", () => {
    expect(calculateSeverityMultiplier("unknown-issue", 3)).toBe(1.0);
    expect(calculateSeverityMultiplier("unknown-issue", 10)).toBe(1.2);
    expect(calculateSeverityMultiplier("unknown-issue", 11)).toBe(1.4);
  });
});
