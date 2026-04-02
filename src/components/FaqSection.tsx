import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "What does ACTV TRKR actually replace?",
    a: "ACTV TRKR consolidates several standalone tools into one platform. It replaces dedicated uptime monitors, broken-link checkers, form-testing tools, basic SEO auditors, and manual lead-source spreadsheets. Instead of juggling five or six subscriptions and browser tabs, you get real-time visitor analytics, form health monitoring, SEO scanning, SSL/domain expiry alerts, broken-link detection, conversion tracking, and AI-powered insights — all from a single dashboard.",
  },
  {
    q: "How is ACTV TRKR different from other analytics platforms?",
    a: "Most analytics platforms give you broad audience and acquisition data across any website. ACTV TRKR is purpose-built for WordPress and focused on what other tools don't cover well: real-time lead attribution down to the individual form submission, automatic form health checks, broken-link detection, uptime monitoring, and plain-language AI summaries. Many teams run ACTV TRKR alongside their existing analytics — one for the big picture, ACTV TRKR for the operational detail and actionable alerts.",
  },
  {
    q: "What form plugins are supported?",
    a: "ACTV TRKR supports all major WordPress form plugins and is also WooCommerce compatible — tracking orders, totals, product details, and customer attribution automatically. On top of that, our universal capture engine intercepts any standard HTML form submission event — so even custom-built or niche forms are detected automatically with no extra configuration.",
  },
  {
    q: "Do I need to install a WordPress plugin?",
    a: "Yes. The ACTV TRKR WordPress plugin is lightweight (under 50 KB of JavaScript) and handles visitor tracking, form capture, click events, uptime monitoring, and site health checks. It sends data securely to your dashboard — no code changes to your theme or templates required. It installs in under a minute.",
  },
  {
    q: "What kind of alerts will I receive?",
    a: "You can be alerted for broken forms, broken links, SSL certificate expiry, domain expiry, uptime outages, plugin vulnerabilities, WordPress core updates, suspicious login attempts, and file changes. Alerts are delivered via email and appear in your in-app notification center. You choose exactly which alerts matter to you.",
  },
  {
    q: "How does the SEO scanning work?",
    a: "ACTV TRKR crawls your pages and checks for missing or duplicate title tags, meta descriptions, heading structure issues, missing alt text, broken internal links, and other common on-page SEO problems. Each issue gets a severity score, and our AI can suggest specific fixes — including the exact code or content change to make. You can track your SEO score over time and see how fixes improve it.",
  },
  {
    q: "Can I white-label reports for clients?",
    a: "Yes — white-labeling is available on all plans. Upload your own logo, set custom brand colors, and add your client's name to report headers. PDF reports automatically use your custom branding, giving your clients a fully branded experience.",
  },
  {
    q: "Is my data private?",
    a: "Yes. ACTV TRKR uses first-party cookies only — no third-party trackers. We hash IP addresses (never store raw IPs), and all data stays under your control. We do not sell, rent, or share visitor data with anyone. You are the data controller; we are the processor.",
  },
  {
    q: "Why don't my numbers match other analytics platforms?",
    a: "Different analytics platforms often report different numbers because they track and process data in different ways. Variations can come from how each tool handles things like ad blockers, bot filtering, session definitions, attribution models, and user consent. Differences in tracking setup (such as how and when tags fire) can also impact results. Because of these factors, it's normal to see discrepancies between platforms. The most important thing is to stay consistent with one primary tool and focus on trends over time rather than exact matching numbers.",
  },
  {
    q: "How is ACTV TRKR different from Google Site Kit?",
    a: "Google Site Kit is a great tool for connecting WordPress to Google services and viewing important Google data in your dashboard. ACTV TRKR is built to complement that kind of visibility by giving you a wider view of how your website is performing, with insights into traffic, leads, site health, and other important activity in one place.",
  },
];
interface FaqSectionProps {
  variant?: "landing" | "app";
}

export default function FaqSection({ variant = "app" }: FaqSectionProps) {
  const isLanding = variant === "landing";

  return (
    <div className={isLanding ? "" : "max-w-3xl"}>
      {!isLanding && (
        <>
          <h2 className="text-2xl font-bold text-foreground mb-1">Frequently Asked Questions</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Common questions about ACTV TRKR and how it compares to other tools.
          </p>
        </>
      )}
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`faq-${i}`} className={isLanding ? "border-white/10" : ""}>
            <AccordionTrigger className={`text-left text-base font-medium ${isLanding ? "text-white hover:text-white/80" : "text-foreground"}`}>
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className={`text-sm leading-relaxed ${isLanding ? "text-white/70" : "text-muted-foreground"}`}>
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
