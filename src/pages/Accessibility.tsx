import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Accessibility() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Accessibility Statement</h1>
        <p className="text-sm text-muted-foreground mb-10">Last reviewed: April 26, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Our Commitment</h2>
            <p className="text-muted-foreground leading-relaxed">
              ACTV TRKR is committed to making our analytics platform accessible to people of all abilities, including those who rely on assistive technologies. We believe that accessibility is a fundamental part of building good software, and we treat it as a continuous engineering practice rather than a one-time project.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Conformance Target</h2>
            <p className="text-muted-foreground leading-relaxed">
              We target conformance with the{" "}
              <a
                href="https://www.w3.org/TR/WCAG21/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                Web Content Accessibility Guidelines (WCAG) 2.1, Level AA
              </a>
              . WCAG 2.1 AA is the standard referenced by the U.S. Department of Justice for ADA Title III compliance, by the European Accessibility Act (EAA), and by Section 508 of the U.S. Rehabilitation Act.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Measures We Take</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong className="text-foreground">Semantic HTML:</strong> Pages use proper landmarks (<code>main</code>, <code>nav</code>, <code>header</code>, <code>footer</code>), heading hierarchy, and ARIA roles where native semantics are insufficient.</li>
              <li><strong className="text-foreground">Keyboard navigation:</strong> All interactive elements are reachable and operable using a keyboard alone, with visible focus indicators on every focusable control.</li>
              <li><strong className="text-foreground">Screen-reader support:</strong> Form fields are associated with labels, icon-only buttons carry accessible names, and dynamic regions announce updates appropriately.</li>
              <li><strong className="text-foreground">Color and contrast:</strong> Our design tokens are tuned to meet WCAG AA contrast ratios in both light and dark modes. Information is never conveyed by color alone.</li>
              <li><strong className="text-foreground">Internationalization:</strong> The <code>lang</code> attribute on the document is updated whenever the user switches the interface language, so screen readers pronounce content correctly.</li>
              <li><strong className="text-foreground">Accessible component library:</strong> We build on Radix UI primitives, which ship with WAI-ARIA Authoring Practices conformance for dialogs, menus, popovers, tabs, and tooltips.</li>
              <li><strong className="text-foreground">Automated testing:</strong> We run axe-core scans against critical user flows and are expanding this into a CI gate that fails builds on new serious or critical regressions.</li>
              <li><strong className="text-foreground">Manual testing:</strong> Critical flows (sign-up, sign-in, checkout, dashboard, account) are periodically reviewed with keyboard-only navigation and macOS VoiceOver.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Compatibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              The dashboard is designed to be compatible with the latest two major versions of:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1 mt-2">
              <li>Google Chrome, Microsoft Edge, Mozilla Firefox, and Apple Safari</li>
              <li>VoiceOver on macOS and iOS</li>
              <li>NVDA and JAWS on Windows</li>
              <li>TalkBack on Android</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              The dashboard is not designed for Internet Explorer or browsers more than two major versions out of date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Known Limitations</h2>
            <p className="text-muted-foreground leading-relaxed">
              We aim to be transparent about gaps we are still working to close. Current known limitations include:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-2">
              <li><strong className="text-foreground">Data visualizations:</strong> Some interactive charts (Recharts) expose data primarily through visual hover tooltips. We provide accompanying KPI summaries and downloadable CSV exports as text-based alternatives, and we are working to add accessible chart descriptions.</li>
              <li><strong className="text-foreground">Complex data tables:</strong> Long sortable tables in Performance and Forms are reachable by keyboard, but may not yet announce sort state changes optimally.</li>
              <li><strong className="text-foreground">Third-party embeds:</strong> Embedded widgets we do not control (e.g., Stripe Checkout) inherit their own accessibility characteristics.</li>
              <li><strong className="text-foreground">Auto-translated content:</strong> Non-English text rendered through our automatic translation layer may occasionally lose semantic emphasis or formatting cues that exist in the English source.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. What We Do Not Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do <strong className="text-foreground">not</strong> use accessibility overlay widgets (sometimes marketed as "one-line accessibility solutions"). The disability community widely opposes them, they have been named in numerous lawsuits, and they do not address the underlying issues. We address accessibility in the source code itself.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Reporting an Issue</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you encounter an accessibility barrier on ACTV TRKR, please tell us. We treat accessibility reports as priority bugs and aim to acknowledge them within two business days.
            </p>
            <div className="mt-4 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-foreground font-medium mb-2">Contact our accessibility team:</p>
              <a
                href="mailto:support@actvtrkr.com?subject=Accessibility%20Issue"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Mail className="h-4 w-4" /> support@actvtrkr.com
              </a>
              <p className="text-xs text-muted-foreground mt-3">
                When reporting, please include the page URL, the browser and assistive technology you are using, and a brief description of the barrier.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Formal Approval</h2>
            <p className="text-muted-foreground leading-relaxed">
              This statement was prepared on April 26, 2026 and is reviewed at least annually, as well as after any major release that changes core navigation, layout, or interaction patterns. The statement reflects our self-assessed conformance and is not a substitute for an independent third-party audit.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
