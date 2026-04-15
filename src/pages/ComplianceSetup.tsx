import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  CheckCircle2, XCircle, AlertTriangle, Info,
  Copy, Check, Code, ChevronDown, BookOpen,
  Globe, Lock, Unlock, Eye, EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useComplianceStatus } from "@/hooks/use-compliance-status";
import { toast } from "sonner";

/* ══════════════════════════════════════════════════
   STATUS SUMMARY CARD
   ══════════════════════════════════════════════════ */

function StatusSummary() {
  const { status } = useComplianceStatus();

  const rows: { label: string; ok: boolean | null; value: string }[] = [
    {
      label: "Tracking blocked before consent",
      ok: status.requireConsent === true,
      value: status.requireConsent === true ? "Yes" : status.requireConsent === false ? "No" : "Not set",
    },
    {
      label: "Consent system active",
      ok: status.consentDetected,
      value: status.consentDetected === true ? "Yes" : status.consentDetected === false ? "No" : "Unknown",
    },
    {
      label: "Consent mode",
      ok: status.consentMode === "strict" ? true : status.consentMode === "relaxed" ? false : null,
      value: status.consentMode
        ? status.consentMode.charAt(0).toUpperCase() + status.consentMode.slice(1)
        : "Not configured",
    },
  ];

  const overallIcon =
    status.overallStatus === "compliant" ? <ShieldCheck className="h-5 w-5 text-success" /> :
    status.overallStatus === "needs_attention" ? <ShieldAlert className="h-5 w-5 text-warning" /> :
    <ShieldOff className="h-5 w-5 text-destructive" />;

  const overallLabel =
    status.overallStatus === "compliant" ? "Compliant" :
    status.overallStatus === "needs_attention" ? "Needs Attention" :
    "Not Configured";

  const overallColor =
    status.overallStatus === "compliant" ? "text-success" :
    status.overallStatus === "needs_attention" ? "text-warning" :
    "text-destructive";

  return (
    <Card className="border-primary/20">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Your Setup Status
          </h2>
          <Badge variant="outline" className={overallColor}>
            {overallIcon}
            <span className="ml-1">{overallLabel}</span>
          </Badge>
        </div>

        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="flex items-center gap-1.5 font-medium">
                {r.ok === true && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                {r.ok === false && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                {r.ok === null && <Info className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className={
                  r.ok === true ? "text-success" :
                  r.ok === false ? "text-destructive" :
                  "text-muted-foreground"
                }>
                  {r.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   START HERE — DECISION FLOW
   ══════════════════════════════════════════════════ */

function StartHere() {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Start Here</h2>
      <p className="text-sm text-muted-foreground">Do you already use a cookie consent plugin?</p>

      <div className="grid gap-3 md:grid-cols-2">
        {/* YES */}
        <button
          type="button"
          onClick={() => setChoice("yes")}
          className={`p-4 rounded-lg border text-left transition-all ${
            choice === "yes"
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className={`h-5 w-5 ${choice === "yes" ? "text-primary" : "text-muted-foreground"}`} />
            <span className="font-semibold text-sm text-foreground">Yes, I have one</span>
          </div>
          <p className="text-xs text-muted-foreground">Complianz, CookieYes, CookieBot, or similar</p>
        </button>

        {/* NO */}
        <button
          type="button"
          onClick={() => setChoice("no")}
          className={`p-4 rounded-lg border text-left transition-all ${
            choice === "no"
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <XCircle className={`h-5 w-5 ${choice === "no" ? "text-primary" : "text-muted-foreground"}`} />
            <span className="font-semibold text-sm text-foreground">No, I don't</span>
          </div>
          <p className="text-xs text-muted-foreground">I need a consent solution</p>
        </button>
      </div>

      {/* Expanded instructions */}
      {choice === "yes" && (
        <Card className="border-success/20 bg-success/5">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Use your existing consent tool</h3>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Add <strong className="text-foreground">ACTV TRKR</strong> to the "Analytics" or "Statistics" category in your consent plugin</li>
              <li>Set consent mode to <strong className="text-foreground">Strict</strong> in ACTV TRKR → Settings → Consent Mode</li>
              <li>Disable the ACTV TRKR built-in banner (your CMP handles it)</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {choice === "no" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Use ACTV TRKR's built-in banner</h3>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Enable <strong className="text-foreground">Strict Mode</strong> in ACTV TRKR → Settings → Consent Mode</li>
              <li>Enable the <strong className="text-foreground">built-in consent banner</strong> in ACTV TRKR → Settings → Banner</li>
              <li>The banner will ask visitors for consent before any tracking starts</li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   CONSENT MODE SELECTION
   ══════════════════════════════════════════════════ */

function ConsentModeSection() {
  const { status } = useComplianceStatus();

  const modes = [
    {
      id: "regional",
      title: "EU/UK + US Mode",
      badge: "Recommended",
      badgeColor: "text-success bg-success/10",
      icon: <Globe className="h-5 w-5 text-primary" />,
      bullets: [
        "EU/UK visitors → consent required before tracking",
        "US visitors → opt-out allowed",
        "Best balance of compliance and data coverage",
      ],
    },
    {
      id: "strict",
      title: "Global Strict Mode",
      badge: null,
      badgeColor: "",
      icon: <Lock className="h-5 w-5 text-success" />,
      bullets: [
        "Consent required for all visitors worldwide",
        "Maximum compliance",
        "May reduce data from low-regulation regions",
      ],
    },
    {
      id: "relaxed",
      title: "Relaxed Mode",
      badge: "Not GDPR compliant",
      badgeColor: "text-destructive bg-destructive/10",
      icon: <Unlock className="h-5 w-5 text-warning" />,
      bullets: [
        "Tracking starts immediately for all visitors",
        "No consent required",
        "Only suitable for non-EU audiences",
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Consent Mode</h2>
      <p className="text-sm text-muted-foreground">
        Choose how ACTV TRKR handles consent. Configure this in your WordPress plugin settings.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        {modes.map((m) => {
          const active = status.consentMode === m.id;
          return (
            <div
              key={m.id}
              className={`rounded-lg border p-4 transition-all ${
                active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                {m.icon}
                {m.badge && (
                  <Badge variant="outline" className={`text-[10px] ${m.badgeColor} border-0`}>
                    {m.badge}
                  </Badge>
                )}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{m.title}</h3>
              <ul className="space-y-1">
                {m.bullets.map((b, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              {active && (
                <Badge variant="outline" className="mt-3 text-primary text-[10px]">
                  <Check className="h-3 w-3 mr-0.5" /> Active
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TESTING CHECKLIST
   ══════════════════════════════════════════════════ */

function TestingChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const steps = [
    { id: "incognito", label: "Open your site in a private / incognito window" },
    { id: "before_vid", label: "Before consent: no mm_vid cookie" },
    { id: "before_sid", label: "Before consent: no mm_sid cookie" },
    { id: "accept", label: "Accept consent → cookies appear, tracking starts" },
    { id: "reject", label: "Reject consent → no tracking, cookies removed" },
  ];

  const allDone = steps.every((s) => checked[s.id]);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Test Your Setup</h2>
      <Card>
        <CardContent className="p-4 space-y-3">
          {steps.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => toggle(s.id)}
            >
              <Checkbox
                checked={!!checked[s.id]}
                onCheckedChange={() => toggle(s.id)}
              />
              <span className={`text-sm transition-colors ${
                checked[s.id] ? "text-muted-foreground line-through" : "text-foreground"
              }`}>
                {s.label}
              </span>
            </label>
          ))}
          {allDone && (
            <div className="flex items-center gap-2 pt-2 text-sm text-success font-medium">
              <CheckCircle2 className="h-4 w-4" /> All checks passed!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   EXTERNAL TRACKING WARNING
   ══════════════════════════════════════════════════ */

function ExternalTrackingWarning() {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
        <Eye className="h-4 w-4 text-warning" /> Other Tracking Tools
      </h2>
      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="p-4">
          <p className="text-sm text-foreground">
            ACTV TRKR only controls its own analytics. Other tools like Google Analytics or Facebook Pixel must be configured separately in your consent plugin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   DATA RETENTION (COLLAPSIBLE)
   ══════════════════════════════════════════════════ */

function DataRetention() {
  const { status } = useComplianceStatus();

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors group">
        <span className="text-sm font-semibold text-foreground">Data Retention</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Handled automatically</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 py-3 text-sm text-muted-foreground space-y-1.5 border border-t-0 border-border rounded-b-lg">
          <p>Current retention: <strong className="text-foreground">{status.retentionMonths ? `${status.retentionMonths} months` : "Plan-tier default"}</strong></p>
          <p>Expired data is automatically purged daily. Aggregated reports are retained separately.</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ══════════════════════════════════════════════════
   LEGAL PAGES (COLLAPSIBLE)
   ══════════════════════════════════════════════════ */

function LegalPages() {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors group">
        <span className="text-sm font-semibold text-foreground">Legal Pages</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Templates available</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 py-3 border border-t-0 border-border rounded-b-lg space-y-3">
          <p className="text-sm text-muted-foreground">
            Your site should have a Privacy Policy and Cookie Policy. ACTV TRKR provides reference templates — you're responsible for your own site's legal pages.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { to: "/privacy", label: "Privacy Policy" },
              { to: "/cookie-policy", label: "Cookie Policy" },
              { to: "/dpa", label: "DPA" },
              { to: "/terms", label: "Terms" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <BookOpen className="h-3 w-3" /> {l.label}
              </Link>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ══════════════════════════════════════════════════
   PRIVACY LINK SNIPPET
   ══════════════════════════════════════════════════ */

function PrivacyLinkSnippet() {
  const [url, setUrl] = useState("https://yoursite.com/privacy-policy");
  const [copied, setCopied] = useState(false);

  const snippet = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:#888;text-decoration:underline;">Privacy Policy</a>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Footer Link Snippet</h2>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Your Privacy Policy URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com/privacy-policy"
              className="font-mono text-xs"
            />
          </div>
          <div className="relative">
            <pre className="bg-muted/50 border border-border rounded-md p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {snippet}
            </pre>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-1.5 right-1.5 h-7 px-2 text-xs"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════ */

export default function ComplianceSetup() {
  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Compliance Setup
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Get your tracking set up right in a few steps.
        </p>
      </div>

      {/* 1. Status Summary */}
      <StatusSummary />

      {/* 2. Start Here */}
      <StartHere />

      {/* 3. Consent Mode */}
      <ConsentModeSection />

      {/* 4. Testing Checklist */}
      <TestingChecklist />

      {/* 5. External Tracking */}
      <ExternalTrackingWarning />

      {/* 6. Data Retention (collapsed) */}
      <DataRetention />

      {/* 7. Legal Pages (collapsed) */}
      <LegalPages />

      {/* 8. Footer Snippet */}
      <PrivacyLinkSnippet />

      {/* Disclaimer */}
      <p className="text-[11px] text-muted-foreground">
        This guide is not legal advice. ACTV TRKR acts as a data processor — you are responsible for consent and compliance on your site.
      </p>
    </div>
  );
}
