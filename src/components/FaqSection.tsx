import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "What does ACTV TRKR actually replace?",
    a: "ACTV TRKR replaces the need to piece together multiple tools just to understand your website.\n\nInstead of switching between Google Analytics, form plugins, uptime monitors, and reports, ACTV TRKR brings everything into one clear dashboard—so you can see traffic, leads, behavior, and site health in one place.\n\n👉 One system instead of a scattered stack.",
  },
  {
    q: "How is ACTV TRKR different from Google Analytics?",
    a: "Google Analytics shows you traffic. ACTV TRKR shows you what's actually driving leads.\n\nACTV TRKR connects traffic sources, visitor behavior, and form submissions into a single timeline—so you can see how a visit turns into a lead, not just how many visitors you had.\n\n👉 From visit → to action → to lead.",
  },
  {
    q: "Do I need to install a WordPress plugin?",
    a: "Yes. ACTV TRKR installs as a lightweight WordPress plugin.\n\nOnce installed, it automatically begins tracking traffic, form activity, and visitor behavior, and connects your site to your dashboard—no complex setup required.",
  },
  {
    q: "What form plugins are supported?",
    a: "ACTV TRKR works with the most common WordPress form builders, including Gravity Forms, WPForms, Contact Form 7, Ninja Forms, and Formidable Forms.\n\nIt captures submissions and activity automatically across these tools.",
  },
  {
    q: "What kind of alerts will I receive?",
    a: "ACTV TRKR alerts you when something needs attention—before it impacts your leads.\n\nThis includes broken forms, broken links, uptime issues, and SSL or domain problems.\n\n👉 So you can fix issues before they cost you.",
  },
  {
    q: "How does the AI agent work?",
    a: "ACTV TRKR includes an AI agent that analyzes your website data and lets you ask questions about it.\n\nYou can ask things like \"Where are my leads coming from?\", \"What changed this week?\", or \"What should I fix?\"—and get clear, actionable answers based on your actual data.\n\n👉 No digging through reports.",
  },
  {
    q: "How accurate is the data?",
    a: "ACTV TRKR is designed to reflect real user activity and actual lead behavior.\n\nIt tracks sessions, form submissions, and interactions directly on your site. Like all analytics tools, numbers may differ slightly from platforms like Google Analytics due to different tracking methods or ad blockers.\n\n👉 The focus is on clarity and real-world behavior, not just raw traffic counts.",
  },
  {
    q: "Will ad blockers affect tracking?",
    a: "In some cases, yes.\n\nLike most analytics tools, certain ad blockers may prevent tracking scripts from running. ACTV TRKR is designed to capture as much real activity as possible, but no analytics platform can guarantee 100% tracking coverage.\n\n👉 Even with this, trends and lead attribution remain highly reliable.",
  },
  {
    q: "Is my data private and secure?",
    a: "Yes.\n\nYour data is only accessible to your account and is never sold or shared with third parties. ACTV TRKR is built to keep your website data secure and isolated.",
  },
  {
    q: "Can I use this for client reporting?",
    a: "Yes.\n\nACTV TRKR includes clean, shareable reports that are easy to use with clients or internal teams.",
  },
  {
    q: "How long does setup take?",
    a: "Most sites are up and running in minutes.\n\nInstall the plugin, connect your site, and ACTV TRKR will begin tracking automatically.",
  },
  {
    q: "What if something breaks or stops tracking?",
    a: "ACTV TRKR actively monitors your site and will alert you if tracking, forms, or key systems stop working.\n\n👉 You'll know quickly if something needs attention.",
  },
  {
    q: "Do I need to configure anything?",
    a: "No complex setup is required.\n\nACTV TRKR is designed to work out of the box, automatically detecting forms, tracking activity, and capturing key data without manual configuration.",
  },
  {
    q: "Why don't my numbers match other tools?",
    a: "Different platforms track data in different ways.\n\nACTV TRKR focuses on session-based behavior, real user activity, and lead attribution—so numbers may not match exactly with tools like Google Analytics.\n\n👉 The goal is actionable insight, not raw data duplication.",
  },
  {
    q: "Is ACTV TRKR only for marketers?",
    a: "No.\n\nACTV TRKR is built for anyone responsible for a website—business owners, marketers, and agencies.\n\nIf you need to understand what's working and where leads are coming from, it's built for you.",
  },
];

interface FaqSectionProps {
  variant?: "landing" | "app";
}

export default function FaqSection({ variant = "app" }: FaqSectionProps) {
  const isLanding = variant === "landing";

  // Split FAQs into two columns for landing
  const midpoint = Math.ceil(faqs.length / 2);
  const leftFaqs = faqs.slice(0, midpoint);
  const rightFaqs = faqs.slice(midpoint);

  if (isLanding) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-0 w-full">
        <Accordion type="single" collapsible className="w-full">
          {leftFaqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-l-${i}`} className="border-border/30">
              <AccordionTrigger className="text-left text-base font-medium text-foreground hover:text-foreground/80">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-foreground/70 whitespace-pre-line">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <Accordion type="single" collapsible className="w-full">
          {rightFaqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-r-${i}`} className="border-border/30">
              <AccordionTrigger className="text-left text-base font-medium text-foreground hover:text-foreground/80">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-foreground/70 whitespace-pre-line">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-foreground mb-1">Frequently Asked Questions</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Common questions about ACTV TRKR and how it compares to other tools.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-left text-base font-medium text-foreground">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
