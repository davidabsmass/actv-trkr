/**
 * SEO Score calculation — ported from RankCoach AI
 */

export interface SeoIssue {
  id: string;
  title: string;
  fix: string;
  impact: "Critical" | "High" | "Medium" | "Low";
  category?: "SEO" | "Performance" | "Content" | "Technical";
  severityMultiplier?: number;
  count?: number;
}

const BASE_WEIGHTS = { Critical: 15, High: 8, Medium: 4, Low: 2 };

const calculateIssueWeight = (issue: SeoIssue): number => {
  const base = BASE_WEIGHTS[issue.impact];
  const mult = Math.min(issue.severityMultiplier || 1.0, 3.0);
  return base * mult;
};

export const calculateSeverityMultiplier = (issueId: string, count?: number): number => {
  if (!count || count <= 1) return 1.0;
  switch (issueId) {
    case "h1-multiple":
    case "multiple-h1":
      return count <= 2 ? 1.0 : count <= 5 ? 1.3 : count <= 10 ? 1.7 : 2.0;
    case "images-without-alt":
    case "images-missing-alt":
      return count <= 5 ? 1.0 : count <= 15 ? 1.3 : count <= 30 ? 1.6 : 2.0;
    case "render-blocking-scripts":
      return count <= 2 ? 1.0 : count <= 5 ? 1.3 : 1.6;
    default:
      return count <= 3 ? 1.0 : count <= 10 ? 1.2 : 1.4;
  }
};

export const calculateScore = (allIssues: SeoIssue[]): number => {
  if (allIssues.length === 0) return 100;
  const deductions = allIssues.reduce((sum, i) => sum + calculateIssueWeight(i), 0);
  return Math.max(0, Math.round(100 - Math.min(deductions, 100)));
};

export const getScoreGrade = (score: number): string => {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
};

export const getScoreStatus = (score: number): "excellent" | "good" | "needs-work" | "poor" => {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "needs-work";
  return "poor";
};
