import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Download, Trash2, Eye, Edit3, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DataRights() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Your Data Rights</h1>
        <p className="text-sm text-muted-foreground mb-10">
          How to exercise your privacy rights with ACTV TRKR.
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">Who this applies to</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR is an analytics service installed by website operators ("Customers") on their own
              websites. Two groups can exercise rights here:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li>
                <strong className="text-foreground">Customers</strong> — businesses that hold an ACTV TRKR account.
                Contact us directly using the email below.
              </li>
              <li>
                <strong className="text-foreground">End Users</strong> — visitors to a Tracked Site. Because the
                website operator is the data controller, please contact them first. We will assist them
                in fulfilling your request.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Rights you can exercise</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {[
                { icon: <Eye className="h-4 w-4 text-primary" />, title: "Access", body: "Request a copy of personal data we hold about you." },
                { icon: <Edit3 className="h-4 w-4 text-primary" />, title: "Rectification", body: "Ask us to correct inaccurate personal data." },
                { icon: <Trash2 className="h-4 w-4 text-primary" />, title: "Erasure", body: "Request deletion of your personal data ('right to be forgotten')." },
                { icon: <Download className="h-4 w-4 text-primary" />, title: "Portability", body: "Receive your data in a structured, machine-readable format." },
                { icon: <Ban className="h-4 w-4 text-primary" />, title: "Object / Opt-out", body: "Object to processing or opt out of the sale/sharing of personal data." },
                { icon: <Mail className="h-4 w-4 text-primary" />, title: "Restrict", body: "Ask us to limit how we use your personal data." },
              ].map((r) => (
                <div key={r.title} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    {r.icon} {r.title}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How to submit a request</h2>
            <p className="text-muted-foreground leading-relaxed">
              Email us at <a href="mailto:privacy@actvtrkr.com" className="text-primary underline">privacy@actvtrkr.com</a> with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Your full name and the email address used (if you were identified through a form)</li>
              <li>The website (Tracked Site) on which you interacted</li>
              <li>The right you wish to exercise</li>
              <li>Any details that will help us locate your data (approximate dates, page URLs, etc.)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We respond to verified requests within <strong className="text-foreground">30 days</strong>.
              Identity verification may be required to protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Self-service options</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>
                <strong className="text-foreground">Clear cookies:</strong> Deleting cookies in your browser
                resets your visitor ID and breaks the link between your identity and future browsing on the
                Tracked Site.
              </li>
              <li>
                <strong className="text-foreground">Withdraw consent:</strong> If the Tracked Site uses our
                consent banner, click "Decline" or "Reject" to revoke analytics consent. We immediately
                clear all analytics cookies and stop tracking.
              </li>
              <li>
                <strong className="text-foreground">Email unsubscribe:</strong> Use the unsubscribe link in
                any email we send to stop further communications.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Right to lodge a complaint</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are not satisfied with our response, you have the right to lodge a complaint with
              your local data protection authority (e.g., your country's DPA in the EU/UK, or your state
              attorney general in the US).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-muted-foreground">
              <strong className="text-foreground">ACTV TRKR — Privacy Team</strong><br />
              Email: <a href="mailto:privacy@actvtrkr.com" className="text-primary underline">privacy@actvtrkr.com</a>
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              See also: <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>{" · "}
              <Link to="/cookie-policy" className="text-primary underline">Cookie Policy</Link>{" · "}
              <Link to="/terms" className="text-primary underline">Terms</Link>{" · "}
              <Link to="/dpa" className="text-primary underline">DPA</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
