import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 28, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By creating an account or using ACTV TRKR (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR is a website analytics, lead intelligence, and performance monitoring platform. The Service includes:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>A WordPress tracking plugin that captures visitor behavior, form submissions, click events, and e-commerce data on Customer websites ("Tracked Sites").</li>
              <li>A cloud-based dashboard for viewing analytics, reports, conversion metrics, SEO analysis, uptime monitoring, and AI-powered insights.</li>
              <li>Visitor identification and behavioral profiling linked to form submissions and WordPress logins.</li>
              <li>Automated reporting, alerting, and notification features.</li>
              <li>Optional white-label branding capabilities.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Account Registration</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account. You must notify us immediately of any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Customer Obligations</h2>
            <p className="text-muted-foreground leading-relaxed">
              As a Customer, you agree to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong className="text-foreground">Comply with applicable laws:</strong> You are responsible for ensuring your use of the Service complies with all applicable privacy and data protection laws, including GDPR, CCPA, PIPEDA, and any other relevant regulations in the jurisdictions where your Tracked Sites operate.</li>
              <li><strong className="text-foreground">Disclose tracking practices:</strong> You must maintain a privacy policy on each Tracked Site that accurately describes the data collection performed by the ACTV TRKR plugin, including the capture of form data, behavioral tracking, visitor identification, and the linking of browsing activity to identified individuals.</li>
              <li><strong className="text-foreground">Obtain consent:</strong> Where required by law, you must obtain valid consent from End Users before collecting their data, particularly for post-identification behavioral tracking where a visitor's browsing history is linked to their personal information after a form submission or login.</li>
              <li><strong className="text-foreground">Handle data subject requests:</strong> You are responsible for responding to access, deletion, correction, and opt-out requests from End Users regarding data collected on your Tracked Sites.</li>
              <li><strong className="text-foreground">Use data appropriately:</strong> You will not use data obtained through the Service for purposes that violate applicable law, including unsolicited communications where prohibited.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Processing Relationship</h2>
            <p className="text-muted-foreground leading-relaxed">
              With respect to End User data collected on Tracked Sites, you are the <strong className="text-foreground">data controller</strong> and ACTV TRKR is the <strong className="text-foreground">data processor</strong>. We process End User data solely on your behalf and according to your instructions as implemented through the Service's configuration. We will not use End User data for our own independent purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Behavioral Tracking & Visitor Identification</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service includes functionality that links a visitor's anonymous browsing behavior to their personal identity once they submit a form or log in as a WordPress user on a Tracked Site. You acknowledge and agree that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li>This linkage creates a behavioral profile that may include pages visited, buttons clicked, time spent, and navigation patterns both before and after identification.</li>
              <li>You are solely responsible for determining whether this tracking is lawful in your jurisdiction and for obtaining any required consent.</li>
              <li>In jurisdictions that require explicit opt-in consent for behavioral profiling (e.g., under GDPR), you must implement appropriate consent mechanisms on your Tracked Sites before enabling identification features.</li>
              <li>ACTV TRKR provides the technical capability; legal compliance is your responsibility as the data controller.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Subscriptions & Payments</h2>
            <p className="text-muted-foreground leading-relaxed">
              Access to the Service requires a paid subscription. Subscription fees are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law. We reserve the right to change pricing with 30 days' notice. Failure to pay may result in suspension or termination of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service, including all software, designs, documentation, and branding, is owned by ACTV TRKR and protected by intellectual property laws. Your subscription grants you a limited, non-exclusive, non-transferable license to use the Service for its intended purpose. You may not reverse-engineer, decompile, or create derivative works based on the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. White-Label Usage</h2>
            <p className="text-muted-foreground leading-relaxed">
              If your subscription includes white-label features, you may replace ACTV TRKR branding with your own in client-facing reports and dashboards. You remain bound by these Terms and may not misrepresent the Service as your own proprietary technology in contractual agreements with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Prohibited Uses</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may not use the Service to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Track websites you do not own or have authorization to monitor.</li>
              <li>Collect data from websites directed at children under 16.</li>
              <li>Engage in any activity that violates applicable law or third-party rights.</li>
              <li>Attempt to access other Customers' data or circumvent security measures.</li>
              <li>Resell or redistribute raw data obtained through the Service.</li>
              <li>Use the Service to facilitate spam, harassment, or deceptive practices.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Service Availability & Support</h2>
            <p className="text-muted-foreground leading-relaxed">
              We strive to maintain high availability but do not guarantee uninterrupted service. Scheduled maintenance, infrastructure issues, and force majeure events may cause temporary disruptions. We provide uptime monitoring as a feature of the Service but are not liable for downtime of your Tracked Sites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Data Retention & Deletion</h2>
            <p className="text-muted-foreground leading-relaxed">
              Detailed activity data is retained in the live dashboard for 60 days, after which it is archived. Aggregated reporting data is retained for 12 months. Upon account termination, we will delete your data within 90 days, except as required by law. You may request data export before termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, ACTV TRKR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify and hold harmless ACTV TRKR from any claims, damages, or expenses arising from your use of the Service, your violation of these Terms, or your failure to comply with applicable data protection laws — including claims from End Users related to data collected on your Tracked Sites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">15. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              Either party may terminate the subscription at any time. You may cancel through your account settings. We may suspend or terminate your account for material breach of these Terms, non-payment, or illegal activity. Upon termination, your access to the Service will cease and data will be handled per Section 12.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">16. Modifications to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these Terms from time to time. Material changes will be communicated via email at least 30 days before taking effect. Continued use of the Service after the effective date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">17. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of the State of Georgia, United States, without regard to conflict of law principles. Any disputes shall be resolved in the state or federal courts located in Georgia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">18. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms, contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong className="text-foreground">ACTV TRKR</strong><br />
              Email: legal@actvtrkr.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
