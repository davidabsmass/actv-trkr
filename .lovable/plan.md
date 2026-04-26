# Accessibility Compliance Rollout

Goal: reach **WCAG 2.1 AA conformance**, document the effort, and dramatically reduce ADA / EAA / state-law lawsuit exposure. We'll do this in 4 phases. Phase 1 ships this loop; the rest can ship in follow-up loops once you're ready.

---

## Phase 1 — Quick-Win Pass (this loop)

The single highest-leverage block of work. Knocks out 90% of demand-letter triggers.

### 1A. Public Accessibility Statement

- New page at `/accessibility` with sections:
  - Our commitment
  - Conformance target (WCAG 2.1 Level AA)
  - Measures we take (semantic HTML, keyboard nav, contrast, automated + manual testing, third-party libs that are accessible by default)
  - Known limitations (honest list — chart tooltips, complex data tables, third-party embeds)
  - Compatibility (browsers + assistive tech we test against)
  - How to report an issue (email link to support, link to support form)
  - Last reviewed date
- Add `/accessibility` link to the marketing footer in `src/pages/Index.tsx` (alongside Privacy / Terms / Contact)
- Add it to the in-app footer/legal area where Privacy + Terms already live

### 1B. Audit + automated scan pass

Run **axe-core** against the running app (auth, signup, checkout, dashboard core, settings, account, marketing landing) and fix the top findings. Typical wins:

- Missing/incorrect `alt` attributes (decorative images should be `alt=""`)
- Icon-only buttons missing `aria-label` or visually-hidden text
- Form fields without associated `<label>` or `aria-label`
- Color-only state indicators (add icon or text)
- Insufficient color contrast (verify warning/destructive tokens against the surface tokens)
- Missing `lang` attribute updates when language switches
- Skip-to-content link on the app shell + marketing pages
- Focus-visible styles confirmed on all interactive elements
- Heading hierarchy regressions (h1 → h2 → h3)
- `<main>` landmark on each routed page

### 1C. Keyboard + screen-reader sanity sweep

- Tab through Auth → Signup → Checkout → Dashboard → Account
- Verify every interactive element is reachable, has visible focus, no keyboard traps, ESC closes dialogs
- Confirm Radix-based components (shadcn/ui Dialog, Sheet, Dropdown, Popover, Select, Tabs) keep their default ARIA wiring intact in our customizations
- Spot-check with VoiceOver on the public landing + sign-in flow

### 1D. Marketing copy + meta

- Add `lang` attribute sync to `<html>` when i18n switches language
- Confirm page titles update per route (helps screen readers announce navigation)

---

## Phase 2 — CI Accessibility Gate (next loop)

Lock in the gains so we don't regress on every release.

- Add `vitest-axe` (component-level) for any new UI primitive added to `src/components/ui`
- Add `@axe-core/playwright` smoke test that crawls Auth, Dashboard, Performance, Settings, Account, Index and fails the build on new "serious" or "critical" findings
- Wire into `.github/workflows/ci.yml`
- Document the a11y baseline — known existing issues recorded as "expected" so the gate only catches new regressions (mirrors how `phpcs-baseline.mjs` works for the WP plugin)

---

## Phase 3 — Formal Documentation (next loop)

Defensible paper trail for enterprise prospects and lawsuit defense.

- **VPAT 2.5 / ACR** in `/docs/accessibility/VPAT.md` covering WCAG 2.1 AA + Section 508 criteria, marked Supports / Partially Supports / Does Not Support / Not Applicable per criterion
- Link the VPAT from the public `/accessibility` page
- Internal **a11y runbook** in `/docs/accessibility/runbook.md`:
  - Per-release manual checklist
  - Screen-reader test scripts for critical flows
  - How to add accessible variants of new components
- Add **App Bible** section so a11y becomes part of the release sign-off process

---

## Phase 4 — Third-Party Audit Prep (when ready)

Optional but worth the spend before going hard on enterprise/EU sales.

- Pre-audit internal pass against the WCAG 2.1 AA checklist
- Engage Deque, TPGi, or Level Access for a formal audit + report
- Track remediation in a public roadmap on the `/accessibility` page
- Re-audit annually + after any major UI overhaul

---

## What we explicitly will NOT do

- **No accessibility overlay widgets** (AccessiBe, UserWay, EqualWeb). They've been named in more lawsuits than they've defended against and the disability community widely opposes them. Real fixes only.
- **No claims of conformance we haven't verified.** The statement will say "we target WCAG 2.1 AA" and list known gaps honestly.

---

## Technical Details

**New files**
- `src/pages/Accessibility.tsx` — public statement, styled to match Privacy/Terms
- Route added in `src/App.tsx`
- (Phase 3) `docs/accessibility/VPAT.md`, `docs/accessibility/runbook.md`

**Edited files (Phase 1)**
- `src/pages/Index.tsx` — add `/accessibility` link to marketing footer
- `src/components/AppLayout.tsx` (or wherever the in-app footer/legal links live) — same link
- `src/components/i18n/AutoTranslateDom.tsx` (or `src/i18n.ts`) — sync `<html lang>` on language change
- Component-level fixes flagged by the axe scan — likely small touches across `src/components/AppSidebar.tsx`, header/nav, KPI cards, dialogs, icon buttons in Dashboard / Account / Settings
- `src/locales/en/common.json` + other locales — copy for the statement page
- Add `index.html` skip-link target if missing

**Phase 2 deps to add later**
- `vitest-axe`, `@axe-core/playwright`, `playwright`

**Phase 1 acceptance criteria**
- `/accessibility` renders in light + dark mode, linked from public footer + in-app legal area
- axe-core run against the 7 main flows shows zero "critical" and zero "serious" findings (or remaining ones documented in the statement under "Known Limitations")
- Tab-traversal of Auth + Checkout + Dashboard works end-to-end with visible focus rings
- `<html lang>` updates when language is switched
- Skip-to-content link present on app shell + marketing pages

Approve this and I'll switch to build mode and ship Phase 1. Phases 2–4 each get their own loop when you're ready.
