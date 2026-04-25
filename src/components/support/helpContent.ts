// Centralized help content used across the Support tab and the floating Help button.
// Keep entries short and action-oriented. Tags drive the "suggested articles" hints
// shown in the ticket form when a user picks a request type.

export type HelpArticle = {
  id: string;
  question: string;
  answer: string;
  tags: Array<"bug" | "feature" | "question" | "billing" | "setup" | "tracking" | "forms">;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "tracking-not-working",
    question: "My site shows no traffic — what now?",
    answer:
      "Open Settings → Connected Sites and confirm the site appears with a green status dot. If it's red, the WordPress plugin isn't reporting in. Reinstall or update the plugin to the latest version, then visit any page on the site to trigger a heartbeat. Tracking should appear within ~2 minutes.",
    tags: ["bug", "setup", "tracking"],
  },
  {
    id: "install-plugin",
    question: "How do I install the WordPress plugin?",
    answer:
      "Go to Settings → Connected Sites → Install Plugin. Download the .zip, then in WordPress go to Plugins → Add New → Upload Plugin and activate it. The site will auto-register on its first heartbeat.",
    tags: ["setup", "question"],
  },
  {
    id: "forms-missing",
    question: "A form isn't appearing in the Forms tab",
    answer:
      "Click 'Re-scan forms' on the Forms page. Discovery runs across Gravity Forms, WPForms, Avada/Fusion, Contact Form 7, and Ninja Forms. If a form still doesn't appear, confirm the plugin version is 1.9.1 or higher and the form is published on a public page.",
    tags: ["bug", "forms", "setup"],
  },
  {
    id: "billing-portal",
    question: "How do I update my payment method or download invoices?",
    answer:
      "Go to Account → Profile & Billing → Manage Billing. This opens a secure portal where you can update cards, download past invoices, or change your billing email.",
    tags: ["billing", "question"],
  },
  {
    id: "cancel-subscription",
    question: "How do I cancel my subscription?",
    answer:
      "Account → Profile & Billing → Cancel Subscription. You'll keep access until the end of the current billing period. We'll offer a couple of options before you cancel — feel free to skip them.",
    tags: ["billing"],
  },
  {
    id: "compliance-banner",
    question: "How do I enable the cookie consent banner?",
    answer:
      "Go to Compliance Setup. The built-in banner can be enabled directly in the WordPress plugin settings, or you can integrate an external CMP (CookieYes, Complianz, etc.) — both options are documented in the setup guide.",
    tags: ["setup", "question"],
  },
  {
    id: "compliance-banner-wording",
    question: "Where do I edit the consent banner text (title, buttons, links)?",
    answer:
      "Banner copy lives in the WordPress plugin so updates go live instantly. Open Compliance Setup → 'Customize banner wording' for a one-click link to your site's WP admin → ACTV TRKR → Consent Banner. From there you can edit title, body, Accept/Reject/Manage Preferences labels, the Privacy Policy URL, the US 'Privacy Settings' label, position, and expiry. Monitoring → Consent Status also has a quick link.",
    tags: ["setup", "question"],
  },
  {
    id: "conversion-rate-high",
    question: "Why is my conversion rate showing weird numbers?",
    answer:
      "If your account is brand new, percentage changes (Week-over-Week, Month-over-Month) are suppressed until at least 2× your selected date range of history exists. Conversion rates are now capped at 100%. If something still looks off after a week of data, send us a ticket.",
    tags: ["question", "tracking"],
  },
  {
    id: "feature-request",
    question: "Where do feature requests go?",
    answer:
      "Submit them under 'Feature Request' in the ticket form below. Every request is reviewed and added to our roadmap. You'll get notified if we ship something you asked for.",
    tags: ["feature"],
  },
];

export const RESOURCE_LINKS = [
  {
    title: "Plugin install guide",
    description: "Step-by-step setup for WordPress",
    href: "/website-setup",
    internal: true,
  },
  {
    title: "Compliance setup",
    description: "Cookie banner & GDPR configuration",
    href: "/compliance-setup",
    internal: true,
  },
  {
    title: "Forms troubleshooting",
    description: "Re-scan, mapping, and import status",
    href: "/forms",
    internal: true,
  },
  {
    title: "Connected sites",
    description: "Manage tracked websites",
    href: "/settings",
    internal: true,
  },
] as const;

export function articlesForType(type: string): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => (a.tags as string[]).includes(type)).slice(0, 3);
}
