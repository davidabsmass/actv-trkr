import { Link } from "react-router-dom";
import {
  Shield, CheckCircle2, AlertTriangle, BookOpen,
  ChevronRight, ExternalLink, Info,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useComplianceStatus } from "@/hooks/use-compliance-status";

const statusColors: Record<string, string> = {
  compliant: "text-success",
  needs_attention: "text-warning",
  misconfigured: "text-destructive",
};

const statusLabels: Record<string, string> = {
  compliant: "Compliant",
  needs_attention: "Needs Attention",
  misconfigured: "Not Configured",
};

export default function ComplianceSetup() {
  const { status } = useComplianceStatus();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Compliance Setup Guide
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Follow these steps to make your tracking GDPR-compliant and reduce legal risk.
        </p>
      </div>

      {/* Quick Checklist */}
      <div className="glass-card p-5 border-primary/20">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Quick Checklist
        </h2>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground">Current status:</span>
          <Badge variant="outline" className={statusColors[status.overallStatus]}>
            {statusLabels[status.overallStatus]}
          </Badge>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <ChecklistItem done={status.consentMode === "strict"}>
            Strict consent mode enabled
          </ChecklistItem>
          <ChecklistItem done={status.requireConsent === true}>
            Analytics blocked before consent
          </ChecklistItem>
          <ChecklistItem done={status.consentDetected === true}>
            Consent integration detected
          </ChecklistItem>
          <ChecklistItem done={status.retentionMonths !== null}>
            Data retention configured
          </ChecklistItem>
        </ul>
      </div>

      {/* Step 1 */}
      <Section number={1} title="Install a Cookie Consent Banner">
        <p className="text-muted-foreground text-sm leading-relaxed">
          GDPR, ePrivacy, and many other regulations require that you obtain visitor consent before setting analytics cookies or tracking browsing behavior.
        </p>
        <Alert className="mt-3 border-warning/30 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            <strong className="text-foreground">Without a consent banner, tracking may be unlawful in the EU, UK, and other jurisdictions.</strong> You — the website operator — are the data controller and are responsible for obtaining consent.
          </AlertDescription>
        </Alert>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Recommended:</strong> Install the <strong className="text-foreground">Complianz</strong> WordPress plugin. ACTV TRKR has native integration with Complianz and will automatically respect consent categories.</p>
          <p>Other compatible CMPs: CookieYes, CookieBot, or any tool that fires a JavaScript consent event.</p>
          <p>For custom CMPs, dispatch a <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">mm_consent_update</code> event on <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">document</code> with <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">detail.analytics = true | false</code>.</p>
        </div>
      </Section>

      {/* Step 2 */}
      <Section number={2} title="Configure Consent Mode">
        <p className="text-muted-foreground text-sm leading-relaxed">
          ACTV TRKR supports two consent modes. The mode is configured in your WordPress plugin settings under <strong className="text-foreground">ACTV TRKR → Settings → Consent Mode</strong>.
        </p>
        <div className="grid gap-3 mt-4 md:grid-cols-2">
          <div className="glass-card p-4 border-success/20">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-success" /> Strict Mode
              <Badge variant="outline" className="text-success text-[10px] ml-auto">Recommended</Badge>
            </h4>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• No cookies set before consent</li>
              <li>• No visitor ID created before consent</li>
              <li>• No events queued or sent before consent</li>
              <li>• Full GDPR compliance when combined with a CMP</li>
            </ul>
          </div>
          <div className="glass-card p-4 border-warning/20">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Relaxed Mode
            </h4>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Tracking starts immediately</li>
              <li>• Cookies set on page load</li>
              <li>• May not be GDPR-compliant</li>
              <li>• Suitable for non-EU audiences only</li>
            </ul>
          </div>
        </div>
        {status.consentMode === "relaxed" && (
          <Alert className="mt-3 border-warning/30 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-sm">
              Your current consent mode is set to <strong className="text-foreground">Relaxed</strong>. This may not be GDPR-compliant. Switch to Strict mode in your WordPress plugin settings.
            </AlertDescription>
          </Alert>
        )}
      </Section>

      {/* Step 3 */}
      <Section number={3} title="Verify Your Setup">
        <p className="text-muted-foreground text-sm leading-relaxed">
          After configuring consent mode and installing a CMP, verify everything is working:
        </p>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Visit your website in a private/incognito browser window</li>
          <li>Check that the cookie consent banner appears</li>
          <li><strong className="text-foreground">Before accepting:</strong> open DevTools → Application → Cookies. Confirm no <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">mm_vid</code> or <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">mm_sid</code> cookies exist</li>
          <li>Accept the analytics/statistics category in the banner</li>
          <li>Check that <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">mm_vid</code> and <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">mm_sid</code> cookies now appear</li>
          <li>Navigate to a few pages and confirm pageviews appear in your ACTV TRKR dashboard</li>
        </ol>
      </Section>

      {/* Step 4 */}
      <Section number={4} title="Data Retention">
        <p className="text-muted-foreground text-sm leading-relaxed">
          ACTV TRKR enforces data retention automatically. The retention period is the stricter (shorter) of:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside">
          <li>Your subscription plan's default retention limit</li>
          <li>Any custom override you set in your consent configuration</li>
        </ul>
        <p className="text-muted-foreground text-sm mt-2">
          Current retention: <strong className="text-foreground">{status.retentionMonths ? `${status.retentionMonths} months` : "Plan-tier default"}</strong>
        </p>
        <p className="text-muted-foreground text-sm mt-2">
          Expired data is automatically purged by a daily cleanup job. Aggregated reporting summaries are retained separately.
        </p>
      </Section>

      {/* Step 5 */}
      <Section number={5} title="Legal Pages">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your website must have legal pages that accurately disclose your use of analytics tracking. ACTV TRKR provides templates you can reference:
        </p>
        <div className="mt-3 space-y-2">
          <LegalLink to="/privacy" label="Privacy Policy" />
          <LegalLink to="/cookie-policy" label="Cookie Policy" />
          <LegalLink to="/dpa" label="Data Processing Agreement" />
          <LegalLink to="/terms" label="Terms of Service" />
        </div>
        <Alert className="mt-3 border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            These are reference documents for ACTV TRKR's own practices. As the data controller, you should maintain your own privacy policy on your website that discloses your use of ACTV TRKR analytics.
          </AlertDescription>
        </Alert>
      </Section>

      {/* Disclaimer */}
      <div className="glass-card p-4 border-muted text-xs text-muted-foreground space-y-2">
        <p><strong className="text-foreground">Disclaimer:</strong> This guide provides general compliance guidance based on ACTV TRKR's technical capabilities. It does not constitute legal advice. Consult a qualified legal professional for advice specific to your jurisdiction and business.</p>
        <p>ACTV TRKR acts as a data processor. You — the website operator — are the data controller responsible for obtaining consent, responding to data subject requests, and maintaining compliant privacy policies.</p>
      </div>
    </div>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{number}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function ChecklistItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />
      )}
      <span className={done ? "text-foreground" : ""}>{children}</span>
    </li>
  );
}

function LegalLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <BookOpen className="h-3.5 w-3.5" />
      {label}
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}
