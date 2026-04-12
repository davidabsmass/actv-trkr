import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dpa() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Data Processing Agreement</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: April 12, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Parties & Scope</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Data Processing Agreement ("DPA") forms part of the Terms of Service between <strong className="text-foreground">the Customer</strong> ("Data Controller") and <strong className="text-foreground">ACTV TRKR</strong> ("Data Processor"). It governs the processing of personal data that ACTV TRKR performs on behalf of the Customer through the analytics and lead intelligence platform (the "Service").
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Definitions</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong className="text-foreground">"Personal Data"</strong> means any information relating to an identified or identifiable natural person ("End User") collected via the Customer's Tracked Sites.</li>
              <li><strong className="text-foreground">"Processing"</strong> means any operation performed on Personal Data, including collection, storage, retrieval, analysis, and deletion.</li>
              <li><strong className="text-foreground">"Sub-processor"</strong> means any third party engaged by ACTV TRKR to process Personal Data on behalf of the Customer.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Data Processed</h2>
            <p className="text-muted-foreground leading-relaxed">ACTV TRKR processes the following categories of End User data on behalf of the Customer:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong className="text-foreground">Browsing behavior:</strong> Pages visited, time on page, click events, scroll depth, navigation patterns.</li>
              <li><strong className="text-foreground">Session identifiers:</strong> Randomly generated visitor IDs and session IDs stored in first-party cookies.</li>
              <li><strong className="text-foreground">Traffic attribution:</strong> Referrer domain, UTM parameters, device type, country (derived from IP geolocation — raw IPs are not stored).</li>
              <li><strong className="text-foreground">Form submissions:</strong> Data voluntarily provided by End Users through forms on Tracked Sites, excluding sensitive fields (passwords, credit cards) which are automatically redacted.</li>
              <li><strong className="text-foreground">WordPress user identity:</strong> User ID, role, and a one-way hash of the email address (plain-text emails are not stored).</li>
              <li><strong className="text-foreground">E-commerce data:</strong> Order totals, product names, customer email for revenue attribution (WooCommerce sites only).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Processing Instructions</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR processes Personal Data solely for the purpose of providing the Service as configured by the Customer. Processing includes: ingesting tracking events, generating analytics dashboards, computing lead scores, producing automated reports, and delivering monitoring alerts. ACTV TRKR will not process Personal Data for any other purpose without the Customer's prior written instruction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Security Measures</h2>
            <p className="text-muted-foreground leading-relaxed">ACTV TRKR implements the following technical and organizational security measures:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Encryption in transit (TLS) and at rest for all stored data.</li>
              <li>Row-level security (RLS) policies enforcing multi-tenant data isolation on all database tables.</li>
              <li>API key authentication with SHA-256 hashed storage (plain-text keys never stored).</li>
              <li>IP addresses are hashed with a salted SHA-256 algorithm; raw IPs are never persisted.</li>
              <li>PII redaction on ingestion: sensitive form fields (passwords, credit card numbers, SSNs) are automatically detected and replaced with [REDACTED].</li>
              <li>Per-IP, per-site, and per-organization rate limiting on all ingestion endpoints.</li>
              <li>Domain validation ensuring tracking data is only accepted from authorized domains.</li>
              <li>Anomaly detection logging for suspicious ingestion patterns.</li>
              <li>Bot traffic filtering using user-agent analysis and referrer spam blocklists.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Detailed activity data (pageviews, events, leads): <strong className="text-foreground">60 days</strong> in live dashboard, then archived.</li>
              <li>Aggregated reporting data (daily/weekly rollups): <strong className="text-foreground">12 months</strong>.</li>
              <li>Archived data: Available for export, removed from primary query paths.</li>
              <li>Upon account termination: All Customer data deleted within 90 days.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Customers may configure retention periods through their consent configuration settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Sub-processors</h2>
            <p className="text-muted-foreground leading-relaxed">ACTV TRKR uses the following sub-processors:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li><strong className="text-foreground">Supabase (via Lovable Cloud):</strong> Database hosting, authentication, edge function execution, file storage. Location: United States.</li>
              <li><strong className="text-foreground">Stripe:</strong> Payment processing for subscription billing. No End User data is shared with Stripe.</li>
              <li><strong className="text-foreground">AI Model Providers (via Lovable AI Gateway):</strong> Aggregated, anonymized metrics are processed to generate insights. No personally identifiable End User data is included.</li>
              <li><strong className="text-foreground">Resend:</strong> Transactional email delivery for Customer account communications. No End User data is included.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              ACTV TRKR will notify the Customer of any changes to sub-processors with at least 30 days' notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data Subject Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR will assist the Customer in responding to data subject access, correction, deletion, portability, and objection requests. The Customer, as Data Controller, is responsible for receiving and validating such requests from End Users. ACTV TRKR will implement deletion or correction within 30 days of receiving a verified instruction from the Customer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Breach Notification</h2>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a personal data breach, ACTV TRKR will notify the Customer without undue delay (and in any event within 72 hours) after becoming aware of the breach. The notification will include: the nature of the breach, categories and approximate number of affected records, likely consequences, and measures taken or proposed to address the breach.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Audits</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR will make available to the Customer all information necessary to demonstrate compliance with this DPA. The Customer may conduct audits (or appoint an independent auditor) with reasonable notice, during business hours, and subject to confidentiality obligations. Audits shall not unreasonably disrupt ACTV TRKR's operations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Data is processed in the United States. For transfers from the EEA, UK, or Switzerland, the parties rely on the EU Standard Contractual Clauses (Module 2: Controller to Processor) as incorporated by reference into this DPA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Term & Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              This DPA remains in effect for the duration of the Customer's use of the Service. Upon termination, ACTV TRKR will delete or return all Personal Data within 90 days, unless retention is required by applicable law. The Customer may request a data export prior to termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For DPA-related inquiries:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong className="text-foreground">ACTV TRKR</strong><br />
              Email: dpa@actvtrkr.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
