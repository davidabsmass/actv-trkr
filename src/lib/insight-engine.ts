/**
 * Deterministic Insight Engine
 * Generates structured findings from pre-computed metrics.
 * AI is NEVER used here — only threshold-based logic.
 */

export type FindingType =
  | "traffic_up" | "traffic_down"
  | "lead_growth" | "lead_drop"
  | "conversion_gain" | "conversion_drop"
  | "high_exit_rate" | "mobile_dropoff"
  | "form_abandonment"
  | "seo_visibility_gain" | "seo_visibility_loss"
  | "high_intent_low_performance"
  | "strong_engagement_low_visibility"
  | "site_health_issue";

export type FindingCategory =
  | "Traffic" | "Conversion" | "Engagement"
  | "SEO" | "Site Health" | "Lead Tracking";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  type: FindingType;
  category: FindingCategory;
  page?: string;
  title: string;
  explanation: string;
  metric_values: Record<string, number | string>;
  severity: Severity;
  confidence: number; // 0-1
  recommended_action?: string;
  positive: boolean;
}

// ── Input types ──
export interface InsightInputs {
  currentSessions: number;
  previousSessions: number;
  currentLeads: number;
  previousLeads: number;
  currentCvr: number;
  previousCvr: number;
  topPages?: Array<{ path: string; views: number; exits: number; leads: number }>;
  deviceBreakdown?: Array<{ device: string; sessions: number; leads: number }>;
  formStats?: Array<{ name: string; starts: number; submissions: number }>;
  seoScore?: number;
  previousSeoScore?: number;
  brokenLinksCount?: number;
  activeIncidents?: number;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return null; // No baseline — suppress comparison
  return Math.round(((current - previous) / previous) * 100);
}

export function generateFindings(inputs: InsightInputs): Finding[] {
  const findings: Finding[] = [];

  // ── Traffic ──
  const sessionsPct = pctChange(inputs.currentSessions, inputs.previousSessions);
  if (sessionsPct !== null && sessionsPct >= 10) {
    findings.push({
      type: "traffic_up", category: "Traffic", positive: true,
      title: "Traffic is growing",
      explanation: `Sessions increased ${sessionsPct}% compared to the previous period.`,
      metric_values: { current: inputs.currentSessions, previous: inputs.previousSessions, change: sessionsPct },
      severity: "low", confidence: 0.9,
    });
  } else if (sessionsPct !== null && sessionsPct <= -10) {
    findings.push({
      type: "traffic_down", category: "Traffic", positive: false,
      title: "Traffic declined",
      explanation: `Sessions dropped ${Math.abs(sessionsPct)}% compared to the previous period.`,
      metric_values: { current: inputs.currentSessions, previous: inputs.previousSessions, change: sessionsPct },
      severity: sessionsPct <= -25 ? "high" : "medium", confidence: 0.9,
      recommended_action: "Review top landing pages and traffic sources for changes.",
    });
  }

  // ── Leads ──
  const leadsPct = pctChange(inputs.currentLeads, inputs.previousLeads);
  if (leadsPct !== null && leadsPct >= 10) {
    findings.push({
      type: "lead_growth", category: "Lead Tracking", positive: true,
      title: "Lead volume is up",
      explanation: `Leads increased ${leadsPct}% compared to the previous period.`,
      metric_values: { current: inputs.currentLeads, previous: inputs.previousLeads, change: leadsPct },
      severity: "low", confidence: 0.9,
    });
  } else if (leadsPct !== null && leadsPct <= -10) {
    findings.push({
      type: "lead_drop", category: "Lead Tracking", positive: false,
      title: "Leads declined",
      explanation: `Leads dropped ${Math.abs(leadsPct)}% compared to the previous period.`,
      metric_values: { current: inputs.currentLeads, previous: inputs.previousLeads, change: leadsPct },
      severity: leadsPct <= -25 ? "high" : "medium", confidence: 0.9,
      recommended_action: "Check form health and top lead sources for anomalies.",
    });
  }

  // ── Conversion rate ──
  const cvrPct = pctChange(inputs.currentCvr, inputs.previousCvr);
  if (cvrPct !== null && cvrPct >= 10) {
    findings.push({
      type: "conversion_gain", category: "Conversion", positive: true,
      title: "Conversion rate improved",
      explanation: `Conversion rate improved ${cvrPct}% compared to the previous period.`,
      metric_values: { current: `${inputs.currentCvr}%`, previous: `${inputs.previousCvr}%`, change: cvrPct },
      severity: "low", confidence: 0.85,
    });
  } else if (cvrPct !== null && cvrPct <= -10) {
    findings.push({
      type: "conversion_drop", category: "Conversion", positive: false,
      title: "Conversion rate dropped",
      explanation: `Conversion rate declined ${Math.abs(cvrPct)}% compared to the previous period.`,
      metric_values: { current: `${inputs.currentCvr}%`, previous: `${inputs.previousCvr}%`, change: cvrPct },
      severity: cvrPct <= -25 ? "high" : "medium", confidence: 0.85,
      recommended_action: "Review landing pages and form experience for friction.",
    });
  }

  // ── High-intent pages with low performance ──
  if (inputs.topPages) {
    const avgCvr = inputs.currentCvr || 1;
    for (const page of inputs.topPages.slice(0, 20)) {
      const pageCvr = page.views > 0 ? (page.leads / page.views) * 100 : 0;
      if (page.views >= 50 && pageCvr < avgCvr * 0.5 && pageCvr < 1) {
        findings.push({
          type: "high_intent_low_performance", category: "Conversion", positive: false,
          title: "High traffic, low conversions",
          explanation: `${page.path} gets significant traffic but converts below average.`,
          page: page.path,
          metric_values: { views: page.views, leads: page.leads, cvr: `${pageCvr.toFixed(1)}%` },
          severity: "medium", confidence: 0.8,
          recommended_action: "Review CTA placement and page clarity.",
        });
        if (findings.filter(f => f.type === "high_intent_low_performance").length >= 2) break;
      }
    }

    // ── High exit rate ──
    for (const page of inputs.topPages.slice(0, 10)) {
      const exitRate = page.views > 0 ? (page.exits / page.views) * 100 : 0;
      if (page.views >= 30 && exitRate > 70) {
        findings.push({
          type: "high_exit_rate", category: "Engagement", positive: false,
          title: "High exit rate",
          explanation: `${page.path} has a ${exitRate.toFixed(0)}% exit rate.`,
          page: page.path,
          metric_values: { views: page.views, exits: page.exits, exitRate: `${exitRate.toFixed(0)}%` },
          severity: exitRate > 85 ? "high" : "medium", confidence: 0.75,
          recommended_action: "Review page content and calls to action.",
        });
        if (findings.filter(f => f.type === "high_exit_rate").length >= 2) break;
      }
    }
  }

  // ── Mobile dropoff ──
  if (inputs.deviceBreakdown && inputs.deviceBreakdown.length >= 2) {
    const desktop = inputs.deviceBreakdown.find(d => d.device === "desktop");
    const mobile = inputs.deviceBreakdown.find(d => d.device === "mobile");
    if (desktop && mobile && desktop.sessions > 10 && mobile.sessions > 10) {
      const dCvr = desktop.leads / desktop.sessions;
      const mCvr = mobile.leads / mobile.sessions;
      if (dCvr > 0 && mCvr < dCvr * 0.5) {
        findings.push({
          type: "mobile_dropoff", category: "Engagement", positive: false,
          title: "Mobile users convert less",
          explanation: "Mobile conversion rate is significantly lower than desktop.",
          metric_values: { desktopCvr: `${(dCvr * 100).toFixed(1)}%`, mobileCvr: `${(mCvr * 100).toFixed(1)}%` },
          severity: "medium", confidence: 0.8,
          recommended_action: "Review the mobile experience on key landing pages.",
        });
      }
    }
  }

  // ── Form abandonment ──
  if (inputs.formStats) {
    for (const form of inputs.formStats) {
      if (form.starts >= 5 && form.submissions < form.starts * 0.4) {
        const abandonRate = Math.round((1 - form.submissions / form.starts) * 100);
        findings.push({
          type: "form_abandonment", category: "Conversion", positive: false,
          title: "Form abandonment is high",
          explanation: `"${form.name}" has a ${abandonRate}% abandonment rate.`,
          metric_values: { starts: form.starts, submissions: form.submissions, abandonRate: `${abandonRate}%` },
          severity: abandonRate > 75 ? "high" : "medium", confidence: 0.7,
          recommended_action: "Simplify form fields or check for errors.",
        });
        if (findings.filter(f => f.type === "form_abandonment").length >= 2) break;
      }
    }
  }

  // ── SEO ──
  if (inputs.seoScore !== undefined && inputs.previousSeoScore !== undefined) {
    const seoPct = inputs.seoScore - inputs.previousSeoScore;
    if (seoPct >= 5) {
      findings.push({
        type: "seo_visibility_gain", category: "SEO", positive: true,
        title: "SEO score improved",
        explanation: `SEO score went from ${inputs.previousSeoScore} to ${inputs.seoScore}.`,
        metric_values: { current: inputs.seoScore, previous: inputs.previousSeoScore },
        severity: "low", confidence: 0.8,
      });
    } else if (seoPct <= -5) {
      findings.push({
        type: "seo_visibility_loss", category: "SEO", positive: false,
        title: "SEO score declined",
        explanation: `SEO score dropped from ${inputs.previousSeoScore} to ${inputs.seoScore}.`,
        metric_values: { current: inputs.seoScore, previous: inputs.previousSeoScore },
        severity: "medium", confidence: 0.8,
        recommended_action: "Run an SEO scan to identify new issues.",
      });
    }
  }

  // ── Site health ──
  if ((inputs.brokenLinksCount ?? 0) > 5) {
    findings.push({
      type: "site_health_issue", category: "Site Health", positive: false,
      title: "Broken links detected",
      explanation: `${inputs.brokenLinksCount} broken links found on your site.`,
      metric_values: { count: inputs.brokenLinksCount ?? 0 },
      severity: (inputs.brokenLinksCount ?? 0) > 20 ? "high" : "medium", confidence: 0.95,
      recommended_action: "Fix or remove broken links to improve user experience and SEO.",
    });
  }
  if ((inputs.activeIncidents ?? 0) > 0) {
    findings.push({
      type: "site_health_issue", category: "Site Health", positive: false,
      title: "Active monitoring incidents",
      explanation: `${inputs.activeIncidents} unresolved incidents are being tracked.`,
      metric_values: { count: inputs.activeIncidents ?? 0 },
      severity: "high", confidence: 1,
      recommended_action: "Check the Monitoring page for details.",
    });
  }

  // Sort: high severity first, then negative before positive
  findings.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    if (a.positive !== b.positive) return a.positive ? 1 : -1;
    return 0;
  });

  return findings;
}
