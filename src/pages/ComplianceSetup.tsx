import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldOff,
  CheckCircle2, XCircle, Info,
  Copy, Check, Code, ChevronDown, BookOpen,
  Globe, Lock, Unlock, Eye, Link2, MessageSquareText, ExternalLink,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useComplianceStatus } from "@/hooks/use-compliance-status";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ══════════════════════════════════════════════════
   COPY BUTTON HELPER
   ══════════════════════════════════════════════════ */

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

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

  const copyBlocks = {
    short: `We use ACTV TRKR to measure website performance and usage. This includes anonymized data such as page views, clicks, and form interactions. This data is used only for internal analytics.`,
    full: `We use ACTV TRKR, an analytics tool, to understand how visitors interact with our website and to improve performance. ACTV TRKR may collect anonymized usage data such as page views, clicks, and form submissions. This data is used solely for internal analytics and is not used for advertising or sold to third parties.`,
    technical: `ACTV TRKR uses first-party analytics identifiers such as mm_vid, mm_sid, and related tracking data. ACTV TRKR should only be activated after Analytics or Statistics consent has been granted.`,
  };

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
            <span className="font-semibold text-sm text-foreground">Yes — Use your existing consent tool</span>
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
            <span className="font-semibold text-sm text-foreground">No — Use ACTV TRKR's built-in banner</span>
          </div>
          <p className="text-xs text-muted-foreground">I need a consent solution</p>
        </button>
      </div>

      {/* Branch A — existing CMP */}
      {choice === "yes" && (
        <div className="space-y-4">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Use your existing consent tool</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Add <strong className="text-foreground">ACTV TRKR</strong> to the "Analytics" or "Statistics" category in your consent plugin</li>
                <li>Choose <strong className="text-foreground">Global Strict Mode</strong> below</li>
                <li>Disable the ACTV TRKR built-in banner if your current consent tool already handles visitor consent</li>
              </ol>
            </CardContent>
          </Card>

          {/* Copy blocks */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Paste one of these into your consent plugin's Analytics / Statistics category:</p>

            {[
              { label: "Short", text: copyBlocks.short },
              { label: "Full", text: copyBlocks.full },
              { label: "Technical", text: copyBlocks.technical },
            ].map((block) => (
              <Card key={block.label} className="border-border">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-foreground">{block.label}</span>
                    <CopyButton text={block.text} />
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{block.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Branch B — built-in banner */}
      {choice === "no" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Use ACTV TRKR's built-in banner</h3>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Choose <strong className="text-foreground">Global Strict Mode</strong> below</li>
              <li>Enable the <strong className="text-foreground">ACTV TRKR built-in banner</strong></li>
              <li>ACTV TRKR will ask visitors for consent before analytics tracking begins</li>
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

  type ModeId = "regional" | "strict" | "relaxed";

  const [selectedMode, setSelectedMode] = useState<ModeId | null>(null);

  const currentModeId: ModeId | null =
    status.consentMode === "relaxed"
      ? "relaxed"
      : status.consentMode === "strict"
        ? "strict"
        : null;

  const activeModeId = selectedMode ?? currentModeId;

  const modes = [
    {
      id: "strict" as const,
      title: "Global Strict Mode",
      badge: null,
      badgeColor: "",
      icon: <Lock className="h-5 w-5 text-success" />,
      description: "Shows the ACTV TRKR consent banner and blocks ACTV TRKR analytics until consent is granted.",
      bullets: [
        "Consent required for all visitors worldwide",
        "Maximum compliance",
        "May reduce data from low-regulation regions",
      ],
    },
    {
      id: "regional" as const,
      title: "EU/UK Strict + US Opt-Out",
      badge: "Recommended",
      badgeColor: "text-success bg-success/10",
      icon: <Globe className="h-5 w-5 text-primary" />,
      description: "EU/UK visitors see the consent banner before ACTV TRKR analytics starts. US visitors can opt out using Privacy Settings.",
      bullets: [
        "EU/UK visitors → consent required before tracking",
        "US visitors → opt-out allowed",
        "Best balance of compliance and data coverage",
      ],
    },
    {
      id: "relaxed" as const,
      title: "Custom Region Rules",
      badge: null,
      badgeColor: "",
      icon: <Unlock className="h-5 w-5 text-warning" />,
      description: "Configure different behavior for EU/UK, US, and other regions.",
      bullets: [
        "EU/UK → strict consent banner",
        "US → opt-out via Privacy Settings",
        "Other regions → choose strict or relaxed fallback",
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Consent Mode</h2>
      <p className="text-sm text-muted-foreground">
        Choose how ACTV TRKR handles analytics consent for your visitors.
      </p>

      <div className="grid gap-3 md:grid-cols-3" aria-label="Consent mode options">
        {modes.map((m) => {
          const active = activeModeId === m.id;
          const isCurrent = currentModeId === m.id;

          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedMode(m.id)}
              className={`rounded-lg border p-4 transition-all text-left ${
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                {m.icon}
                <div className="flex flex-wrap justify-end gap-1">
                  {m.badge && (
                    <Badge variant="outline" className={`text-[10px] ${m.badgeColor} border-0`}>
                      {m.badge}
                    </Badge>
                  )}
                  {isCurrent && (
                    <Badge variant="outline" className="text-[10px]">
                      Current setup
                    </Badge>
                  )}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{m.title}</h3>
              <p className="text-xs text-muted-foreground mb-2">{m.description}</p>
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
                  <Check className="h-3 w-3 mr-0.5" /> {isCurrent ? "Active" : "Selected"}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   CUSTOM COOKIE SETTINGS LINK
   ══════════════════════════════════════════════════ */

function CustomCookieSettingsLink() {
  const linkSnippet = `<a href="#" onclick="if(window.mmConsentBanner && typeof window.mmConsentBanner.open === 'function'){ window.mmConsentBanner.open(); } return false;">\n  Cookie Settings\n</a>`;
  const buttonSnippet = `<button type="button" onclick="if(window.mmConsentBanner && typeof window.mmConsentBanner.open === 'function'){ window.mmConsentBanner.open(); }">\n  Cookie Settings\n</button>`;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" /> Custom Cookie Settings Link
      </h2>
      <p className="text-sm text-muted-foreground">
        Launch the ACTV TRKR cookie settings popup from your own footer, theme, or site link. Use one of the snippets below.
      </p>
      <p className="text-xs text-muted-foreground">
        If you use your own Cookie Settings link, you can hide the built-in ACTV TRKR footer link in the plugin settings.
      </p>

      {[
        { label: "Link (for footer / navigation)", snippet: linkSnippet },
        { label: "Button", snippet: buttonSnippet },
      ].map((item) => (
        <Card key={item.label} className="border-border">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{item.label}</span>
              <CopyButton text={item.snippet} />
            </div>
            <pre className="bg-muted/50 border border-border rounded-md p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {item.snippet}
            </pre>
          </CardContent>
        </Card>
      ))}
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
            ACTV TRKR only controls ACTV TRKR analytics. Other tools, such as Google Analytics or Facebook Pixel, must be configured separately in your consent plugin or tracking setup.
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
   FOOTER LINK SNIPPET (Privacy Policy)
   ══════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════
   BANNER WORDING — deep links to WP plugin editor
   ══════════════════════════════════════════════════ */

function normalizeSiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function BannerWording() {
  const { orgId } = useOrg();

  const { data: sites, isLoading } = useQuery({
    queryKey: ["compliance_banner_sites", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("id, domain, url, display_name, name")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Anchor support so Monitoring's deep-link (#banner-wording) scrolls here
  useEffect(() => {
    if (window.location.hash === "#banner-wording") {
      const el = document.getElementById("banner-wording");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary/40");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 2500);
      }
    }
  }, [isLoading]);

  const validSites = (sites || [])
    .map((s) => ({
      ...s,
      origin: normalizeSiteUrl(s.url || s.domain),
      label: s.display_name || s.name || s.domain || s.url || "Site",
    }))
    .filter((s) => !!s.origin);

  return (
    <Card id="banner-wording" className="glass-card scroll-mt-20 transition-shadow">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              Customize banner wording
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Banner copy lives in the WordPress plugin so changes go live instantly without redeploying anything here. Open the plugin's Consent Banner settings on each site to edit:
            </p>
            <ul className="text-xs text-muted-foreground mt-2 grid gap-1 sm:grid-cols-2">
              <li>• Title &amp; body text</li>
              <li>• Accept / Reject / Manage Preferences labels</li>
              <li>• Privacy Policy &amp; Cookie Policy URLs</li>
              <li>• "Privacy Settings" link label (US opt-out)</li>
              <li>• Position (top / bottom) &amp; expiry days</li>
              <li>• Re-opener "Cookie Settings" label</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading your sites…</p>
          ) : validSites.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Connect a site first — once the plugin reports in, you'll get a one-click link here to its banner editor.
            </p>
          ) : validSites.length === 1 ? (
            <Button asChild size="sm" className="gap-1.5">
              <a
                href={`${validSites[0].origin}/wp-admin/options-general.php?page=actvtrkr-consent`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Edit banner on {validSites[0].label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Edit on WordPress (per site):</p>
              <div className="grid gap-1.5">
                {validSites.map((s) => (
                  <a
                    key={s.id}
                    href={`${s.origin}/wp-admin/options-general.php?page=actvtrkr-consent`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground truncate">{s.label}</span>
                      <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                        {s.origin?.replace(/^https?:\/\//, "")}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-primary group-hover:underline shrink-0">
                      Edit on WordPress <ExternalLink className="h-3 w-3" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">
            Changes save in WordPress and take effect immediately on the live site — no plugin update or redeploy needed.
          </p>
        </div>
      </CardContent>
    </Card>
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

      {/* 2. Start Here — decision flow */}
      <StartHere />

      {/* 3. Consent Mode */}
      <ConsentModeSection />

      {/* 4. Custom Cookie Settings Link */}
      <CustomCookieSettingsLink />

      {/* 5. Other Tracking Tools */}
      <ExternalTrackingWarning />

      {/* 6. Data Retention (collapsed) */}
      <DataRetention />

      {/* 7. Legal Pages (collapsed) */}
      <LegalPages />


      {/* Disclaimer */}
      <p className="text-[11px] text-muted-foreground">
        This guide is not legal advice. ACTV TRKR acts as a data processor — you are responsible for consent and compliance on your site.
      </p>
    </div>
  );
}
