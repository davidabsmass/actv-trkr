import type { HowToSection } from "@/components/HowToButton";

export interface PageHowTo {
  pageName: string;
  intro: string;
  sections: HowToSection[];
}

export const HOWTO_DASHBOARD: PageHowTo = {
  pageName: "Dashboard",
  intro:
    "Your daily snapshot of what's happening across your sites — traffic, leads, and what needs attention.",
  sections: [
    {
      title: "Pick your time range",
      body: "Use the date selector at the top right to switch between presets (7/30/90 days) or pick a custom range. All KPIs, sparklines, and widgets update together.",
    },
    {
      title: "Reading the KPI cards",
      body: "Each card shows a headline number, a tiny trend line, and a percent change versus the previous equal-length period. Hover the (i) icon for the metric definition.",
      bullets: [
        "Green up-arrow = improving, red down-arrow = declining",
        "A dash means there isn't enough prior data to compare yet",
      ],
    },
    {
      title: "Needs Attention",
      body: "Surfaces the most urgent issues across your sites — SSL/domain expiries, broken forms, tracking interruptions, and security alerts. Click any item to jump to the page that fixes it.",
    },
    {
      title: "AI Insights & What's Working",
      body: "AI-generated narrative of what changed and why, plus a ranked list of the channels and pages driving the most engagement.",
    },
  ],
};

export const HOWTO_PERFORMANCE: PageHowTo = {
  pageName: "Performance",
  intro:
    "Deep-dive analytics: traffic sources, content, conversions, visitor behavior, and full session journeys.",
  sections: [
    {
      title: "Tabs across the top",
      body: "Switch between Analytics, Attribution, Content, Visitors, Funnel, Goals, and Journeys. The date range applies to every tab.",
    },
    {
      title: "Attribution model",
      body: "We use last-touch attribution at the session level. UTM parameters take precedence, then referrer domain, then a 'direct' fallback.",
    },
    {
      title: "Visitor Journeys widget",
      body: "Shows the 10 most recent sessions with arrival, page path, time spent, and exit page. Click 'View all' for the full journey explorer.",
    },
    {
      title: "Funnel & Goals",
      body: "The funnel tracks Sessions → Engaged → Leads. Goals show conversion counts for any custom goal you've defined in Settings.",
    },
  ],
};

export const HOWTO_VISITOR_JOURNEYS: PageHowTo = {
  pageName: "Visitor Journeys",
  intro:
    "Every session — anonymous or identified — from arrival to exit. Use this to understand real user paths.",
  sections: [
    {
      title: "What each row means",
      body: "One row = one session. You see when they arrived, the landing page, total active time, number of pageviews, the exit page, and an outcome badge.",
      bullets: [
        "Lead — the visitor submitted a form",
        "Engaged — multiple pageviews or significant time spent",
        "Bounced — single pageview, very short visit",
      ],
    },
    {
      title: "Expand for the full path",
      body: "Click any row to reveal the chronological list of pages visited, clicks, and key events — exactly like the timeline on a lead's profile.",
    },
    {
      title: "Filter by outcome",
      body: "Use the filter chips to focus on just leads, just engaged sessions, or just bounces. Combine with the date range for cohort analysis.",
    },
    {
      title: "Privacy",
      body: "Visitor IDs are shown as short hashes. Identifiable info only appears when the visitor became a lead and consented to identification.",
    },
  ],
};

export const HOWTO_REPORTS: PageHowTo = {
  pageName: "Reports",
  intro:
    "Build, schedule, and download multi-page PDF reports for clients or stakeholders.",
  sections: [
    {
      title: "Generate a report",
      body: "Pick a template, choose a date range and site, then click Generate. Reports render server-side as PDFs and appear in the history list when ready.",
    },
    {
      title: "Schedule recurring reports",
      body: "Use the Scheduled tab to set up weekly or monthly automated runs. They're emailed to the recipients you configure.",
    },
    {
      title: "Templates",
      body: "Templates control which sections appear (KPIs, charts, top pages, AI summary, etc.). Build a template once and reuse it for many sites.",
    },
    {
      title: "Archives",
      body: "Older generated reports live in the Archives tab — download or re-share at any time.",
    },
  ],
};

export const HOWTO_FORMS: PageHowTo = {
  pageName: "Forms",
  intro:
    "Every lead and form submission across your sites, with field-level data, status, and lead scoring.",
  sections: [
    {
      title: "Browse leads",
      body: "The main table lists every submission. Use Search and the status/category filters to narrow down. Click any row for the full lead detail with timeline.",
    },
    {
      title: "Lead status",
      body: "Update each lead's status (New → Contacted → Qualified → Converted/Lost) to track your sales pipeline. Status changes are stored per-lead.",
    },
    {
      title: "Form leaderboard",
      body: "Switch to the Forms tab to see which forms produce the most volume and the highest-quality leads. Use this to decide where to focus optimization.",
    },
    {
      title: "Field weights & scoring",
      body: "In Settings → Forms, you can weight fields (e.g. budget = 1×, newsletter checkbox = 0.25×) to tune how engagement scores are calculated.",
    },
  ],
};

export const HOWTO_MONITORING: PageHowTo = {
  pageName: "Monitoring",
  intro:
    "Live health of every connected site — uptime, tracking pulse, SSL/domain expiry, and the WP environment.",
  sections: [
    {
      title: "Pick a site",
      body: "Use the site selector at the top to switch between connected sites. Each site has its own tabs for Tracking, Compliance, Environment, and Fleet.",
    },
    {
      title: "Tracking health",
      body: "We ping each site every 5 minutes. A site goes 'unhealthy' after two failed checks and recovers automatically when the pulse returns.",
    },
    {
      title: "Compliance status",
      body: "Shows whether the consent banner is configured correctly and whether tracking is firing only after consent in strict-mode regions.",
    },
    {
      title: "WP Environment",
      body: "Reports the WordPress version, PHP version, plugin version, and any detected conflicts — useful when troubleshooting tracking issues.",
    },
  ],
};

export const HOWTO_SECURITY: PageHowTo = {
  pageName: "Security",
  intro:
    "Real-time security events from your WordPress sites — failed logins, file changes, plugin issues, and more.",
  sections: [
    {
      title: "Severity levels",
      body: "Critical = act now (compromise indicators). Warning = investigate soon (suspicious patterns). Info = audit trail only.",
    },
    {
      title: "Filter & acknowledge",
      body: "Use the severity chips to focus on Critical or Warning events first. Acknowledge an event once you've reviewed it — it stays in the history but stops showing as 'new'.",
    },
    {
      title: "Event aggregation",
      body: "Repeat events of the same type from the same source are grouped together to keep the feed manageable. Expand a row to see all occurrences.",
    },
    {
      title: "Requires plugin v1.4.0+",
      body: "Security data only flows in from sites running the latest WordPress plugin. Older sites will appear empty here — update the plugin to enable.",
    },
  ],
};

export const HOWTO_SEO: PageHowTo = {
  pageName: "SEO",
  intro:
    "Search visibility, keywords, page-level performance, and AI-suggested fixes.",
  sections: [
    {
      title: "Visibility tiers",
      body: "New orgs start in Summary mode. Once enough Search Console data accumulates, Advanced mode unlocks with full keyword and page detail.",
    },
    {
      title: "Top queries & pages",
      body: "Click any keyword to see which pages rank for it. Click a page to see all keywords driving its impressions and clicks.",
    },
    {
      title: "AI fix suggestions",
      body: "For pages with declining performance, the AI proposes title, meta description, and content tweaks. Suggestions are recommendations only — review before applying.",
    },
    {
      title: "Data freshness",
      body: "Search Console data has a 2–3 day delay (Google's lag, not ours). Today's numbers will fill in over the next few days.",
    },
  ],
};

export const HOWTO_SETTINGS: PageHowTo = {
  pageName: "Settings",
  intro:
    "Configure connected sites, forms, goals, notifications, white-labeling, API keys, and more.",
  sections: [
    {
      title: "Tabs across the top",
      body: "General holds day-to-day config (sites, forms, notifications). White-Label customizes branding. Website Setup walks through plugin install.",
    },
    {
      title: "Connected Sites",
      body: "Add, rename, or remove sites. Each new WordPress site auto-registers on its first report — manual add is rarely needed.",
    },
    {
      title: "Notifications",
      body: "Choose which events trigger emails or in-app alerts (new leads, weekly digest, security incidents). Configurable per-user.",
    },
    {
      title: "API Keys (admins)",
      body: "One active key per organization. Generating a new key automatically revokes the previous one. Used by the WordPress plugin and any custom integrations.",
    },
  ],
};
