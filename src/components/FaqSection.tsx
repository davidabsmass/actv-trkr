import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "What does ACTV TRKR actually replace?",
    a: "ACTV TRKR consolidates several standalone tools into one platform. It replaces dedicated uptime monitors (like UptimeRobot), broken-link checkers (like Broken Link Checker plugins), form-testing tools, basic SEO auditors, and manual lead-source spreadsheets. Instead of juggling five or six subscriptions and browser tabs, you get real-time visitor analytics, form health monitoring, SEO scanning, SSL/domain expiry alerts, broken-link detection, conversion tracking, and AI-powered insights — all from a single dashboard.",
  },
  {
    q: "How is ACTV TRKR different from Google Analytics?",
    a: "Google Analytics gives you broad audience and acquisition data across any website. ACTV TRKR is purpose-built for WordPress and focused on what GA doesn't cover well: real-time lead attribution down to the individual form submission, automatic form health checks, broken-link detection, uptime monitoring, and plain-language AI summaries. Many teams run both side by side — GA for the big picture, ACTV TRKR for the operational detail and actionable alerts.",
  },
  {
    q: "What form plugins are supported?",
    a: "ACTV TRKR supports Gravity Forms, Contact Form 7, WPForms, Avada / Fusion Forms, Ninja Forms, Formidable Forms, Elementor Forms, Fluent Forms, HappyForms, and WS Form out of the box. On top of that, our universal capture engine intercepts any standard HTML form submission event — so even custom-built or niche forms are detected automatically with no extra configuration.",
  },
  {
    q: "Does it work with WooCommerce?",
    a: "Yes. ACTV TRKR tracks WooCommerce orders automatically — capturing order totals, product details, and customer attribution data. You can see which traffic sources, landing pages, and campaigns are driving actual revenue, not just page views.",
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
    a: "Yes — white-labeling is available on all plans. Upload your own logo, set custom brand colors, replace ACTV TRKR branding, and add your client's name to report headers. PDF reports automatically suppress ACTV TRKR branding when a custom logo is present, giving your clients a fully branded experience.",
  },
  {
    q: "Is my data private?",
    a: "Yes. ACTV TRKR uses first-party cookies only — no third-party trackers, no Google Analytics, no Facebook Pixel. We hash IP addresses (never store raw IPs), and all data stays under your control. We do not sell, rent, or share visitor data with anyone. You are the data controller; we are the processor.",
  },
  {
    q: "What's the difference between ACTV TRKR and PageSpeed Insights?",
    a: "PageSpeed Insights measures how fast your pages load and scores Core Web Vitals. ACTV TRKR focuses on what happens after the page loads: are forms working, are leads converting, is the site staying online, and are there SEO issues? Think of PageSpeed as your engine diagnostic, and ACTV TRKR as your full operations dashboard.",
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
