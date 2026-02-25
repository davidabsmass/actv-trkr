import { subDays, format, startOfDay } from "date-fns";

// Generate realistic daily data for the last N days
function generateDailySeries(days: number, baseValue: number, variance: number, weekendDip = 0.6) {
  const data = [];
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(today, i);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const seasonality = isWeekend ? weekendDip : 1;
    const trend = 1 + (days - i) * 0.002; // slight upward trend
    const noise = 1 + (Math.random() - 0.5) * variance;
    const value = Math.round(baseValue * seasonality * trend * noise);
    data.push({
      date: format(date, "yyyy-MM-dd"),
      dateLabel: format(date, "MMM d"),
      value: Math.max(0, value),
    });
  }
  return data;
}

export function getMockDailyData(days = 30) {
  const sessions = generateDailySeries(days, 320, 0.3);
  const leads = generateDailySeries(days, 12, 0.5, 0.3);
  const pageviews = generateDailySeries(days, 850, 0.25);

  return sessions.map((s, i) => ({
    date: s.date,
    dateLabel: s.dateLabel,
    sessions: s.value,
    leads: leads[i].value,
    pageviews: pageviews[i].value,
    cvr: leads[i].value / Math.max(s.value, 1),
  }));
}

export function getMockKPIs() {
  const sessions = 9847;
  const leads = 387;
  const pageviews = 26432;
  const cvr = leads / sessions;
  return {
    sessions: { value: sessions, delta: 0.12, label: "Sessions" },
    leads: { value: leads, delta: 0.08, label: "Leads" },
    pageviews: { value: pageviews, delta: 0.05, label: "Pageviews" },
    cvr: { value: cvr, delta: -0.02, label: "Conversion Rate" },
  };
}

export function getMockSourceAttribution() {
  return [
    { source: "Google / CPC", sessions: 3842, leads: 156, cvr: 0.0406 },
    { source: "Google / Organic", sessions: 2914, leads: 98, cvr: 0.0336 },
    { source: "Direct", sessions: 1567, leads: 67, cvr: 0.0428 },
    { source: "Facebook / CPC", sessions: 823, leads: 34, cvr: 0.0413 },
    { source: "Bing / Organic", sessions: 412, leads: 18, cvr: 0.0437 },
    { source: "Referral", sessions: 289, leads: 14, cvr: 0.0484 },
  ];
}

export function getMockCampaignAttribution() {
  return [
    { campaign: "hip_q1", sessions: 1842, leads: 89, cvr: 0.0483 },
    { campaign: "knee_q1", sessions: 1456, leads: 52, cvr: 0.0357 },
    { campaign: "spine_brand", sessions: 867, leads: 38, cvr: 0.0438 },
    { campaign: "shoulder_geo", sessions: 543, leads: 21, cvr: 0.0387 },
    { campaign: "general_brand", sessions: 312, leads: 8, cvr: 0.0256 },
  ];
}

export function getMockTopPages() {
  return [
    { path: "/services/hip-replacement/", sessions: 2134, leads: 89, cvr: 0.0417 },
    { path: "/services/knee-replacement/", sessions: 1876, leads: 67, cvr: 0.0357 },
    { path: "/", sessions: 1654, leads: 23, cvr: 0.0139 },
    { path: "/about/our-surgeons/", sessions: 987, leads: 45, cvr: 0.0456 },
    { path: "/services/spine-surgery/", sessions: 876, leads: 34, cvr: 0.0388 },
    { path: "/contact/", sessions: 765, leads: 56, cvr: 0.0732 },
    { path: "/patient-resources/", sessions: 654, leads: 12, cvr: 0.0183 },
    { path: "/locations/downtown/", sessions: 543, leads: 28, cvr: 0.0516 },
    { path: "/services/shoulder-surgery/", sessions: 432, leads: 18, cvr: 0.0417 },
    { path: "/blog/recovery-tips/", sessions: 387, leads: 5, cvr: 0.0129 },
  ];
}

export function getMockOpportunities() {
  const sitewideCvr = 387 / 9847; // ~3.93%
  return getMockTopPages()
    .filter((p) => p.sessions >= 100)
    .map((p) => {
      const expected = Math.round(p.sessions * sitewideCvr);
      const gap = expected - p.leads;
      return {
        ...p,
        expectedLeads: expected,
        gap,
        opportunityScore: gap,
      };
    })
    .filter((p) => p.gap > 0)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

export function getMockAlerts() {
  return [
    {
      id: "1",
      severity: "warning" as const,
      title: "Conversion efficiency dropped",
      detail: "Sessions up 18% but leads down 12% vs. prior week. Check landing page changes.",
      date: format(subDays(new Date(), 1), "MMM d"),
    },
    {
      id: "2",
      severity: "info" as const,
      title: "Traffic source shift detected",
      detail: "Google/CPC share increased from 32% to 41% — verify budget allocation.",
      date: format(subDays(new Date(), 2), "MMM d"),
    },
    {
      id: "3",
      severity: "error" as const,
      title: "Lead anomaly detected",
      detail: "Daily leads dropped to 3 (avg: 13, σ: 4). Possible tracking issue.",
      date: format(subDays(new Date(), 3), "MMM d"),
    },
  ];
}

export function getMockForecast(days = 30) {
  const today = startOfDay(new Date());
  const points = [];
  let base = 13;
  for (let i = 1; i <= days; i++) {
    const date = subDays(today, -i);
    const trend = base + i * 0.05;
    const noise = (Math.random() - 0.5) * 3;
    const yhat = Math.round((trend + noise) * 10) / 10;
    points.push({
      date: format(date, "yyyy-MM-dd"),
      dateLabel: format(date, "MMM d"),
      yhat: Math.max(0, yhat),
      yhat_low: Math.max(0, yhat - 4),
      yhat_high: yhat + 4,
    });
  }
  return {
    metric: "leads_total",
    horizon: days,
    projected_total: points.reduce((s, p) => s + p.yhat, 0),
    points,
    sufficient_data: true,
    days_until_available: 0,
  };
}
