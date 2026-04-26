import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, Plug, Eye, Search, Mail, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const STEPS = [
  {
    icon: Eye,
    title: "Check the Forms page first",
    body: (
      <>
        <p>
          Open <Link to="/forms" className="underline text-primary">Forms</Link>. Every form
          we've discovered on your connected sites is listed there with a status pill, last entry
          date, and total entries. Most "missing form" worries clear up here in 10 seconds.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-muted-foreground">
          <li><strong>Healthy</strong> — entries are flowing as expected.</li>
          <li><strong>Idle</strong> — the form exists but hasn't received entries recently.</li>
          <li><strong>No entries yet</strong> — we found the form but nothing has been submitted.</li>
        </ul>
      </>
    ),
  },
  {
    icon: RefreshCw,
    title: "Click 'Re-scan forms' on the Forms page",
    body: (
      <>
        <p>
          New forms (or forms you just renamed/republished) get picked up by re-scanning. The
          button lives at the top right of <Link to="/forms" className="underline text-primary">/forms</Link>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Re-scanning runs <em>discovery</em> + <em>auto-import</em> across Gravity Forms, WPForms,
          Avada/Fusion, Contact Form 7, and Ninja Forms. Give it a minute — counts trickle in as
          entries arrive.
        </p>
      </>
    ),
  },
  {
    icon: Plug,
    title: "Confirm the WordPress plugin is connected",
    body: (
      <>
        <p>
          Go to <Link to="/settings?tab=sites" className="underline text-primary">Settings → Connected Sites</Link>.
          The site that hosts the form should show a <span className="text-green-500 font-medium">green</span> dot.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Red dot? The plugin isn't reporting in. Reinstall or update it.</li>
          <li>Plugin version must be <strong>1.9.1 or higher</strong> for full form support.</li>
          <li>After updating, visit any page on your site to trigger a heartbeat.</li>
        </ul>
      </>
    ),
  },
  {
    icon: CheckCircle2,
    title: "Make sure the form is actually published",
    body: (
      <>
        <p>
          We only ingest forms that live on a <strong>publicly visible page</strong>. Drafts,
          private pages, and forms behind a login won't appear.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Open the page in an incognito window — if you can see the form, so can we.</li>
          <li>Avada/Fusion forms must be saved as the <code>fusion_form</code> post type.</li>
          <li>Forms inside popups, accordions, or tabs are still detected as long as the page is public.</li>
        </ul>
      </>
    ),
  },
  {
    icon: Mail,
    title: "Test the form yourself",
    body: (
      <>
        <p>
          Submit a real entry from an incognito window using a recognizable name like
          <code className="mx-1">test-{`{date}`}</code>. Wait <strong>30–60 seconds</strong>, then refresh
          <Link to="/forms" className="underline text-primary mx-1">Forms</Link> or
          <Link to="/dashboard" className="underline text-primary mx-1">Dashboard</Link>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          If the test entry shows up but older entries don't, it's a historical-import question
          (see step 7), not a tracking issue.
        </p>
      </>
    ),
  },
  {
    icon: ListChecks,
    title: "Check field mapping if data looks wrong",
    body: (
      <>
        <p>
          Email/name/phone fields aren't always labeled in obvious ways. Open a form on
          <Link to="/forms" className="underline text-primary mx-1">Forms</Link> → <strong>Field Mapping</strong>
          to map raw fields (like <code>input_3</code>) to canonical attributes (<em>email</em>, <em>full_name</em>, <em>phone</em>).
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Once mapped, all future entries use it automatically. Past entries are re-mapped on the next refresh.
        </p>
      </>
    ),
  },
  {
    icon: Search,
    title: "Big import still running?",
    body: (
      <>
        <p>
          Historical entries pull in small, throttled batches so we don't overload your site:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-muted-foreground">
          <li>A few hundred entries → 2–5 minutes.</li>
          <li>A few thousand entries → 30 minutes to several hours.</li>
          <li>Imports resume automatically — you can close the page.</li>
        </ul>
        <p className="mt-2 text-sm">Counts on the Forms page tick up as entries arrive.</p>
      </>
    ),
  },
];

export default function FormsTroubleshooting() {
  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/settings?tab=support">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Support
        </Link>
      </Button>

      <div className="mb-8">
        <Badge variant="secondary" className="mb-2">Troubleshooting Guide</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Forms not showing up?</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Walk through these steps in order. Most issues clear up by step 3.
        </p>
      </div>

      <Alert className="mb-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Before you start</AlertTitle>
        <AlertDescription>
          Form data flows from your <strong>WordPress site</strong> → <strong>ACTV TRKR plugin</strong> → <strong>this dashboard</strong>.
          If any link in that chain breaks, entries won't appear here. We never modify your WordPress site —
          we only read what the plugin sends us.
        </AlertDescription>
      </Alert>

      <div className="space-y-4 mb-10">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          return (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardDescription className="text-xs uppercase tracking-wide">
                      Step {idx + 1}
                    </CardDescription>
                    <CardTitle className="text-lg mt-0.5">{step.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pl-16 text-sm">{step.body}</CardContent>
            </Card>
          );
        })}
      </div>

      <Separator className="my-8" />

      <h2 className="text-2xl font-semibold mb-4">Quick answers</h2>
      <Accordion type="single" collapsible className="mb-10">
        <AccordionItem value="q1">
          <AccordionTrigger>Why don't I see entries from before I installed the plugin?</AccordionTrigger>
          <AccordionContent>
            We backfill historical entries automatically after install — it just takes time.
            Large form histories (thousands of entries) can take several hours. If it's been
            more than 24 hours, open a support ticket.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q2">
          <AccordionTrigger>My form plugin isn't on your supported list — will it work?</AccordionTrigger>
          <AccordionContent>
            We officially support Gravity Forms, WPForms, Avada/Fusion, Contact Form 7, and
            Ninja Forms. Other form plugins may still be tracked as generic submissions, but
            field-level data won't be parsed. Submit a feature request from the Support tab.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q3">
          <AccordionTrigger>I deleted a form in WordPress — why does it still show here?</AccordionTrigger>
          <AccordionContent>
            We keep historical data so your reports stay intact. Deleted forms move to an
            "Archived" state and stop accumulating new entries, but all past leads remain.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q4">
          <AccordionTrigger>Conversion rate looks wrong on my form — what's happening?</AccordionTrigger>
          <AccordionContent>
            Form-specific CVR uses the form's leads divided by site-wide sessions for the same
            window. If your site is brand new (less than 2× your selected date range), CVR is
            suppressed. Numbers are also capped at 100% to avoid the "300% conversion" weirdness.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q5">
          <AccordionTrigger>Do I need to re-scan every time I add a form?</AccordionTrigger>
          <AccordionContent>
            No — new forms are picked up automatically within a few minutes of their first
            submission. Re-scan only if you want to check immediately or if a form was renamed.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-lg">Still stuck?</CardTitle>
          <CardDescription>
            Open a support ticket and we'll dig in with you. Mention which form, which site, and
            roughly when you submitted your test entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/settings?tab=support">Contact Support</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
