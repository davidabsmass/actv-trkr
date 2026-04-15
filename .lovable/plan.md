

# Comprehensive Testing Plan

Right now the project has **zero real tests** — just a placeholder `example.test.ts` that asserts `true === true`. The testing infrastructure (Vitest, jsdom, testing-library) is already configured. Here's how far we can push it.

---

## What We Can Test

### Tier 1 — Pure Logic (highest value, zero mocking needed)

These are deterministic functions with no Supabase or React dependencies. They're the easiest to test and the most likely to catch real regressions.

| Module | What to test |
|--------|-------------|
| `src/lib/seo-scoring.ts` | `calculateScore`, `getScoreGrade`, `getScoreStatus`, `calculateSeverityMultiplier` — edge cases like 0 issues, max deductions, boundary scores (39/40/59/60/74/75/89/90) |
| `src/lib/insight-engine.ts` | `generateFindings` — traffic up/down thresholds, org-too-new suppression, zero-baseline handling, device/form/SEO branches |
| `src/lib/form-field-display.ts` | Field filtering, label deduplication, weak-label upgrades, skip-type/key logic |
| `src/lib/mock-data.ts` | `generateDailySeries` shape, `getMockOpportunities` gap calculation |
| `src/lib/utils.ts` | `cn()` class merging edge cases |
| `supabase/functions/_shared/ingestion-security.ts` | Rate limit logic, domain validation, PII redaction, payload size checks (Deno tests) |
| `supabase/functions/_shared/rate-limiter.ts` | Window expiry, limit enforcement, default fallbacks (Deno tests) |

### Tier 2 — React Component Unit Tests (medium effort)

Render components in isolation with mocked Supabase/hooks. Catches UI regressions.

| Component | What to test |
|-----------|-------------|
| `KPIRow` | Renders correct labels, delta colors (green/red), handles missing data |
| `DateRangeSelector` | Emits correct date ranges, preset buttons work |
| `GoalConversions` | Empty state, goal display, progress bars |
| `GetStartedBanner` | Shows/hides based on onboarding state |
| `SmartUpdates` | Renders insights, truncates at 5, action buttons |
| `SeoScoreCard` | Grade letter, color mapping, score boundaries |

### Tier 3 — Hook Tests (medium-high effort)

Test hooks with mocked Supabase responses using `renderHook`.

| Hook | What to test |
|------|-------------|
| `use-subscription` | Bypass logic for owner/billing-exempt, expired states |
| `use-plan-tier` | Correct tier derivation from subscription data |
| `use-compliance-status` | Status derivation from consent config combinations |
| `use-user-role` | Admin vs member role resolution |

### Tier 4 — Edge Function Tests (Deno)

Test critical backend logic with Deno's test runner via the `test_edge_functions` tool.

| Function | What to test |
|----------|-------------|
| `actv-webhook` | Checkout.session.completed provisioning, subscription.deleted churn, duplicate user handling |
| `ingest-form` | Deduplication, Avada field parsing, fingerprint hashing |
| `track-pageview` | Bot filtering, domain validation, rate limiting |
| `check-subscription` | Active/inactive/missing customer scenarios |

### Tier 5 — Integration / Flow Tests

Full page renders with routing, testing critical user journeys.

| Flow | What to test |
|------|-------------|
| Auth → Dashboard redirect | Authenticated user lands on dashboard |
| Signup → Checkout redirect | `/signup` now redirects to `/checkout` |
| Onboarding completion | Org creation, compliance mode persistence |
| CheckoutSuccess validation | Redirects without session_id |

---

## Implementation Approach

1. **Start with Tier 1** — write ~40-50 test cases across the pure logic modules. No mocking needed, fast execution, highest bug-catching value.
2. **Add Tier 2-3** — component and hook tests with a shared test utilities file for mocking Supabase.
3. **Add Tier 4** — Deno test files alongside edge functions.
4. **Add Tier 5** — integration tests with `MemoryRouter` wrappers.

### Files to create

- `src/lib/__tests__/seo-scoring.test.ts` (~15 tests)
- `src/lib/__tests__/insight-engine.test.ts` (~15 tests)
- `src/lib/__tests__/form-field-display.test.ts` (~10 tests)
- `src/lib/__tests__/utils.test.ts` (~5 tests)
- `src/test/test-utils.tsx` — shared render wrapper with providers
- `src/components/dashboard/__tests__/KPIRow.test.tsx` (~8 tests)
- `src/components/dashboard/__tests__/SmartUpdates.test.tsx` (~6 tests)
- `src/components/reports/__tests__/SeoScoreCard.test.tsx` (~5 tests)
- `src/hooks/__tests__/use-subscription.test.ts` (~6 tests)
- `src/pages/__tests__/Signup.test.tsx` (~3 tests — redirect behavior)
- `src/pages/__tests__/CheckoutSuccess.test.tsx` (~3 tests)
- `supabase/functions/actv-webhook/webhook_test.ts` (Deno, ~8 tests)

**Estimated total: ~120+ test cases** covering scoring math, insight generation, field parsing, component rendering, subscription gating, and webhook provisioning.

### Execution order

1. Tier 1 pure logic tests (can be done immediately)
2. Tier 2 component tests
3. Tier 3 hook tests
4. Tier 5 page/flow tests
5. Tier 4 Deno edge function tests

