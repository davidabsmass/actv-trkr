import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How is ACTV TRKR different from Google Analytics?",
    a: "Google Analytics is a powerful, broad analytics platform — but it requires setup, training, and time to pull useful insights. ACTV TRKR is purpose-built for WordPress sites and focuses on the metrics that matter most to site owners and agencies: form submissions, lead attribution, conversion tracking, and site health. Instead of digging through dashboards, you get clear summaries, alerts, and actionable recommendations automatically.",
  },
  {
    q: "How is this different from PageSpeed Insights?",
    a: "PageSpeed Insights measures how fast your pages load and scores your site's Core Web Vitals. ACTV TRKR doesn't replace that — it complements it. We focus on what happens after the page loads: are forms working, are leads coming in, is the site healthy, and are there broken links or SSL issues? Think of PageSpeed as your engine diagnostic, and ACTV TRKR as your full operations dashboard.",
  },
  {
    q: "Do I need to install a WordPress plugin?",
    a: "Yes. The ACTV TRKR WordPress plugin is lightweight and handles form tracking, pageview capture, heartbeat monitoring, and site health checks. It sends data securely to your ACTV TRKR dashboard — no code changes to your theme or templates required.",
  },
  {
    q: "What form plugins are supported?",
    a: "ACTV TRKR works with Gravity Forms, Avada/Fusion Forms, and any form that triggers a standard WordPress submission event. Our universal form capture system detects submissions automatically, so most form setups work without extra configuration.",
  },
  {
    q: "Can I use ACTV TRKR on multiple websites?",
    a: "Yes. Our Multi-Site Plan supports up to 10 websites for $49/month, making it ideal for agencies and teams managing multiple client sites from one dashboard.",
  },
  {
    q: "What kind of alerts will I receive?",
    a: "ACTV TRKR can alert you to broken forms, broken links, SSL certificate expiry, domain expiry, uptime issues, plugin vulnerabilities, WordPress core updates, suspicious login attempts, and file changes. You choose which alerts matter to you and how you want to be notified.",
  },
  {
    q: "Is my data private?",
    a: "Yes. ACTV TRKR does not use cookies for visitor tracking, does not collect personally identifiable information from site visitors, and does not share data with third parties. Your analytics data belongs to you.",
  },
  {
    q: "Can I white-label reports for clients?",
    a: "Yes. On supported plans, you can upload your own logo, set a custom colour scheme, replace ACTV TRKR branding, and add your client's name to report headers.",
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
