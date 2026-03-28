import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 28, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR ("we," "us," or "our") provides a website analytics and lead intelligence platform (the "Service") to businesses ("Customers") who install our tracking plugin on their websites ("Tracked Sites"). This Privacy Policy explains how we collect, use, store, and protect information from:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong className="text-foreground">Customers</strong> — businesses and individuals who create an ACTV TRKR account.</li>
              <li><strong className="text-foreground">End Users</strong> — visitors to Tracked Sites whose browsing activity is captured by our plugin.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>

            <h3 className="text-base font-medium mt-4 mb-2">2.1 Customer Account Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you create an account, we collect your name, email address, organization name, and billing information. This data is used to authenticate your access, deliver the Service, and process payments.
            </p>

            <h3 className="text-base font-medium mt-4 mb-2">2.2 Anonymous Visitor Data (Before Identification)</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our tracking plugin collects the following from End Users visiting Tracked Sites:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Pages visited, time on page, and scroll depth</li>
              <li>Click events (buttons, CTAs, phone links, email links, outbound links)</li>
              <li>Traffic source, referrer domain, and UTM parameters</li>
              <li>Device type, browser, and country (derived from IP)</li>
              <li>A randomly generated visitor ID stored in a first-party cookie</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              <strong className="text-foreground">We do not collect IP addresses.</strong> We store a one-way hash of the IP for session grouping only; the raw IP is never retained.
            </p>

            <h3 className="text-base font-medium mt-4 mb-2">2.3 Identified Visitor Data (After Form Submission or Login)</h3>
            <p className="text-muted-foreground leading-relaxed">
              When an End User submits a form on a Tracked Site, the data they voluntarily provide (e.g., name, email, phone number, message) is captured and stored. If the End User is a logged-in WordPress user, their WordPress user ID, name, email, and role may also be captured.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              <strong className="text-foreground">Post-identification tracking:</strong> Once an End User is identified through a form submission or WordPress login, their randomly generated visitor ID is associated with their personal information. This means that <strong className="text-foreground">subsequent browsing activity on the Tracked Site — including page visits, clicks, and navigation patterns — is linked to their identity</strong> for the purpose of building a lead activity timeline and attribution analysis.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              This linkage persists for the duration of the visitor cookie (up to 12 months) or until the cookie is cleared by the End User.
            </p>

            <h3 className="text-base font-medium mt-4 mb-2">2.4 E-Commerce Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              For Tracked Sites running WooCommerce, we capture order data including order totals, product names, quantities, and customer email addresses for revenue attribution purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong className="text-foreground">Analytics & Reporting:</strong> To generate dashboards, trend charts, conversion tracking, SEO analysis, and AI-powered insights for our Customers.</li>
              <li><strong className="text-foreground">Lead Attribution:</strong> To show Customers which traffic sources, pages, and campaigns led to form submissions and conversions.</li>
              <li><strong className="text-foreground">Behavioral Profiles:</strong> To build chronological activity timelines showing an identified visitor's journey before and after a conversion event.</li>
              <li><strong className="text-foreground">Monitoring & Alerts:</strong> To detect uptime issues, broken links, broken forms, SSL certificate problems, and domain expiry for Tracked Sites.</li>
              <li><strong className="text-foreground">AI Insights:</strong> To generate automated recommendations and performance summaries using aggregated metrics.</li>
              <li><strong className="text-foreground">Account Operations:</strong> To process payments, send transactional emails, and provide customer support.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Legal Basis for Processing</h2>
            <p className="text-muted-foreground leading-relaxed">
              We process data under the following legal bases:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong className="text-foreground">Contract Performance:</strong> Processing Customer account data to deliver the Service.</li>
              <li><strong className="text-foreground">Legitimate Interest:</strong> Processing anonymous visitor analytics data to provide website performance insights to Customers.</li>
              <li><strong className="text-foreground">Consent:</strong> Where required by applicable law (e.g., GDPR), processing identified visitor data and post-identification tracking requires that the Customer obtain appropriate consent from End Users through their own privacy policy and cookie consent mechanisms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Customer Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Customers are the data controllers</strong> for End User data collected on their Tracked Sites. ACTV TRKR acts as a <strong className="text-foreground">data processor</strong> on behalf of the Customer. Customers are responsible for:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li>Maintaining a privacy policy on their Tracked Sites that discloses the use of analytics tracking, form data collection, and post-identification behavioral tracking.</li>
              <li>Obtaining any required consent from End Users under applicable privacy laws (GDPR, CCPA, PIPEDA, etc.), including consent for linking form submissions to browsing history.</li>
              <li>Providing End Users with the ability to opt out of tracking where required by law.</li>
              <li>Responding to data subject access requests (DSARs) and deletion requests from End Users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong className="text-foreground">Detailed activity data</strong> (individual pageviews, events, lead records) is retained in the live dashboard for <strong className="text-foreground">60 days</strong>, after which it is moved to an archive layer.</li>
              <li><strong className="text-foreground">Aggregated reporting data</strong> (daily/weekly rollups, trend summaries) is retained for <strong className="text-foreground">12 months</strong>.</li>
              <li><strong className="text-foreground">Archived data</strong> remains available for export but is removed from primary query paths.</li>
              <li><strong className="text-foreground">Customer account data</strong> is retained for the duration of the account and deleted upon account termination, subject to legal retention requirements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Cookies & Tracking Technologies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our tracking plugin uses <strong className="text-foreground">first-party cookies only</strong>. No third-party cookies, advertising trackers, or cross-site tracking pixels are used. The cookies we set include:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong className="text-foreground">Visitor ID cookie:</strong> A randomly generated identifier to distinguish unique visitors. Expires after 12 months.</li>
              <li><strong className="text-foreground">Session ID cookie:</strong> A temporary identifier to group page visits within a single browsing session. Expires after 30 minutes of inactivity.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We do not use Google Analytics, Facebook Pixel, or any other third-party analytics service. All data remains first-party and under the Customer's control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data Sharing & Third Parties</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell, rent, or trade End User data. We share data only with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong className="text-foreground">Infrastructure providers:</strong> Cloud hosting and database services necessary to operate the platform.</li>
              <li><strong className="text-foreground">Payment processors:</strong> To process Customer subscription payments.</li>
              <li><strong className="text-foreground">AI model providers:</strong> Aggregated, anonymized metrics may be sent to AI services to generate insights. No personally identifiable End User data is included in AI prompts.</li>
              <li><strong className="text-foreground">Law enforcement:</strong> When required by valid legal process.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We employ industry-standard security measures including encryption in transit (TLS), encryption at rest, row-level security policies on all database tables, API key authentication with hashed storage, and regular security monitoring. Access to Customer data is restricted by organization-level isolation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. End User Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              End Users who wish to exercise their privacy rights (access, correction, deletion, objection, or portability) should contact the Customer (the website operator) directly. Customers may contact us at the email below to facilitate data subject requests.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              End Users can clear their browser cookies at any time to reset their visitor ID and break the link between their identity and future browsing activity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Data may be processed in the United States. For transfers from the EEA, UK, or Switzerland, we rely on standard contractual clauses or other approved transfer mechanisms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is not directed to children under 16. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. Material changes will be communicated via email to registered Customers. Continued use of the Service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              For privacy inquiries, data subject requests, or questions about this policy, contact us at:
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
