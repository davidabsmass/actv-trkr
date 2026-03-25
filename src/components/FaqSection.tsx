import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How is ACTV TRKR different from Google Analytics?",
    a: "Google Analytics is a fantastic tool for understanding audience demographics, acquisition channels, and user behaviour across large-scale web properties. ACTV TRKR doesn't try to replace it — it solves a different problem. Where GA gives you broad traffic data, ACTV TRKR is purpose-built for WordPress and focused specifically on lead tracking, form health, site uptime, and actionable alerts. You get clear summaries, automatic SEO monitoring, and real-time notifications without needing to configure goals, filters, or custom reports. Many teams use both side by side: GA for the big picture, ACTV TRKR for the operational detail.",
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
    a: "ACTV TRKR supports a wide range of WordPress form builders out of the box: Gravity Forms, Avada / Fusion Forms, Contact Form 7, WPForms, Ninja Forms, Formidable Forms, Elementor Forms, Fluent Forms, HappyForms, and WS Form. On top of that, our universal form capture engine listens for any standard HTML form submission event — so even custom-built forms or lesser-known plugins are typically detected automatically with no extra configuration.",
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
