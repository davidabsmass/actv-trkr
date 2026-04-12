import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: April 12, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Cookie Policy explains how <strong className="text-foreground">ACTV TRKR</strong> uses cookies and similar technologies on Customer websites ("Tracked Sites") and on the ACTV TRKR dashboard application. ACTV TRKR uses <strong className="text-foreground">first-party cookies only</strong>. We do not use third-party cookies, advertising trackers, or cross-site tracking pixels.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Cookies Set by the Tracking Plugin</h2>
            <p className="text-muted-foreground leading-relaxed">
              The ACTV TRKR WordPress tracking plugin sets the following cookies on Tracked Sites:
            </p>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Cookie</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Duration</th>
                    <th className="text-left py-2 font-semibold text-foreground">Type</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-mono text-xs">mm_vid</td>
                    <td className="py-2 pr-4">Visitor identifier — a randomly generated UUID to distinguish unique visitors across sessions.</td>
                    <td className="py-2 pr-4">365 days</td>
                    <td className="py-2">Analytics</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-mono text-xs">mm_sid</td>
                    <td className="py-2 pr-4">Session identifier — groups page visits within a single browsing session. Resets after 30 minutes of inactivity or when UTM parameters change.</td>
                    <td className="py-2 pr-4">Session (1 day)</td>
                    <td className="py-2">Analytics</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-mono text-xs">mm_utm</td>
                    <td className="py-2 pr-4">Stores the current UTM parameters (source, medium, campaign, term, content) for attribution tracking.</td>
                    <td className="py-2 pr-4">30 days</td>
                    <td className="py-2">Analytics</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">mm_ts</td>
                    <td className="py-2 pr-4">Timestamp of the last tracked interaction, used for session timeout detection.</td>
                    <td className="py-2 pr-4">Session (1 day)</td>
                    <td className="py-2">Functional</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. localStorage Usage</h2>
            <p className="text-muted-foreground leading-relaxed">
              In addition to cookies, the tracking plugin uses browser <strong className="text-foreground">localStorage</strong> for the following purposes:
            </p>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Key</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                    <th className="text-left py-2 font-semibold text-foreground">Cleared</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 font-mono text-xs">mm_event_queue</td>
                    <td className="py-2 pr-4">Persists unsent tracking events across page reloads to prevent data loss when network connectivity is interrupted.</td>
                    <td className="py-2">After successful flush</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">mm_consent</td>
                    <td className="py-2 pr-4">Stores the End User's analytics consent decision (granted/denied) when consent mode is enabled.</td>
                    <td className="py-2">When consent is revoked</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Consent Behavior</h2>
            <p className="text-muted-foreground leading-relaxed">
              The ACTV TRKR tracking plugin supports a configurable consent mode:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong className="text-foreground">Strict mode (GDPR default):</strong> No cookies are set, no tracking events are fired, and no localStorage data is stored until the End User has granted analytics consent. The tracker remains completely inert until consent is received.</li>
              <li><strong className="text-foreground">Relaxed mode:</strong> Tracking initializes on page load without waiting for explicit consent. This mode is intended for jurisdictions where analytics cookies do not require prior consent.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              When consent is denied or revoked in strict mode, the tracker clears all analytics cookies (<code>mm_vid</code>, <code>mm_sid</code>, <code>mm_utm</code>, <code>mm_ts</code>), removes the event queue from localStorage, and stops all tracking activity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Dashboard Application Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              The ACTV TRKR dashboard application (used by Customers, not End Users) uses standard authentication cookies/tokens managed by the authentication provider to maintain login sessions. These are essential for the operation of the service and do not track browsing behavior.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. What We Do NOT Use</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>No third-party cookies (Google Analytics, Facebook Pixel, etc.)</li>
              <li>No advertising or retargeting cookies</li>
              <li>No cross-site tracking</li>
              <li>No fingerprinting techniques</li>
              <li>No tracking pixels or web beacons</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Managing Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              End Users can manage or delete cookies through their browser settings. Clearing cookies will reset the visitor ID and break the association between the visitor's identity and future browsing activity. Most browsers also allow blocking cookies entirely, which will prevent the ACTV TRKR tracker from functioning.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Customer Responsibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              Customers are responsible for implementing cookie consent mechanisms (e.g., Complianz, CookieYes, or similar tools) on their Tracked Sites where required by applicable law. The ACTV TRKR tracker provides JavaScript hooks for consent integration and will respect the consent state communicated through these mechanisms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about this Cookie Policy:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong className="text-foreground">ACTV TRKR</strong><br />
              Email: privacy@actvtrkr.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
