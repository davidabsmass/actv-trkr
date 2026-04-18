# ACTV TRKR — Quality & Security Pipeline

> **Purpose:** make every release safer without slowing the team down. This document is the operating manual for our scan, lint, and release-gate stack.
>
> **Posture:** *block on critical, warn on the rest, baseline the legacy.* No theatre, no fake guarantees.

---

## 0. TL;DR

| You did this | …this runs | …blocks if |
|---|---|---|
| Open / push to a PR | Lint, typecheck, unit tests, ESLint+Semgrep, PHPCS+PHPStan, gitleaks, npm audit, Lighthouse on changed routes | **Critical** finding in any layer (see §6) |
| Merge to `main` | All of the above + ZIP build + plugin-artifact verify | Same gates + missing artifact sync |
| Tag a release (`v*.*.*`) | Full suite + ZAP baseline against staging + signed plugin ZIP publish | Any unresolved blocker from §6 |
| Nightly | Full suite + ZAP full scan + dependency re-scan against the *currently shipped* version | Reports only — opens issues, never auto-fails |

Everything is in `.github/workflows/`. Configs live at the repo root and under `mission-metrics-wp-plugin/`.

---

## 1. Scan architecture

We scan in **seven layers**. No single tool covers everything; redundancy is the point.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1  Source quality        ESLint, tsc --noEmit, vitest         │
│ Layer 2  Static security       Semgrep (TS/React), PHPStan          │
│ Layer 3  Standards / style     Prettier, PHPCS + WPCS               │
│ Layer 4  Dependency CVEs       npm audit (audit-ci), Dependabot     │
│ Layer 5  Secret leakage        gitleaks (history + delta)           │
│ Layer 6  Frontend product      Lighthouse CI (perf, a11y, SEO)      │
│ Layer 7  Runtime / DAST        OWASP ZAP baseline against staging   │
└─────────────────────────────────────────────────────────────────────┘
                          ↓ all funnel into ↓
                ┌─────────────────────────────────┐
                │ GitHub Checks UI + PR comment   │
                │ Issues opened for nightly drift │
                └─────────────────────────────────┘
```

### Layer-by-layer responsibility

| Layer | Tool | Scope | Where it runs |
|---|---|---|---|
| 1 | **ESLint** (`eslint.config.js`) | App TS/React + edge functions | PR + main |
| 1 | **TypeScript** (`tsc --noEmit`) | All TS | PR + main |
| 1 | **Vitest** | Unit + edge function tests | PR + main |
| 2 | **Semgrep** (`p/typescript`, `p/react`, `p/owasp-top-ten`) | App TS + edge functions | PR + main |
| 2 | **PHPStan** (`phpstan.neon`, level 5) | WP plugin | PR (plugin paths) + main |
| 3 | **PHPCS + WPCS** (`.phpcs.xml`) | WP plugin | PR (plugin paths) + main |
| 3 | **Prettier** | App TS/CSS/JSON | PR (warn only) |
| 4 | **audit-ci** (wraps `npm audit`) | App + scripts | PR + main + nightly |
| 4 | **Dependabot** | App + GitHub Actions | continuous PRs |
| 5 | **gitleaks** | Full history + diff | PR + main + nightly |
| 6 | **Lighthouse CI** (`lighthouserc.json`) | 5 key routes against preview build | PR + main |
| 7 | **OWASP ZAP** baseline | `https://mshnctrl.lovable.app` (staging) | release + nightly |

### What runs where

| Trigger | Layers run | Purpose |
|---|---|---|
| **Local pre-commit** (optional, `lefthook`) | 1, 3, 5 (delta) | Catch obvious mess before push |
| **PR open / sync** | 1, 2, 3, 4, 5, 6 | Block bad merges |
| **Push to `main`** | 1–6 + plugin-artifact verify | Confirm trunk is clean |
| **Tag `v*`** | 1–7 | Final release gate |
| **Nightly cron** | 4, 5, 7 | Detect newly-disclosed CVEs and runtime drift |

---

## 2. Source-code quality (Layer 1+2)

### App / frontend (TS + React)

- **ESLint** — already present at `eslint.config.js`. We tighten it (see §10) to error on `no-explicit-any`, `no-floating-promises`, `react-hooks/exhaustive-deps`, `no-unused-vars`.
- **Semgrep** with three rulesets:
  - `p/typescript` — generic TS bugs
  - `p/react` — hook misuse, dangerous innerHTML, key warnings escalated
  - `p/owasp-top-ten` — XSS, SSRF, path traversal patterns
- **TypeScript strict** — `tsc --noEmit` runs in CI even though Vite never type-checks.

### Backend / Supabase edge functions

- Same ESLint + Semgrep. Plus:
- **Vitest / Deno tests** under `supabase/functions/*/test.ts` — invoked by `supabase test` in the existing test runner.
- Manual CORS allowlist check (Semgrep custom rule, see `.semgrep/`).

### Severity model

| Level | What it means | CI behavior |
|---|---|---|
| **error** | Real bug or security pattern — must fix before merge | Fails the job |
| **warning** | Smell or maintainability issue | Posted in PR comment, does not fail |
| **info** | Style or convention | Surfaced in summary only |

Reports surface in three places:
1. **PR check** — pass/fail per layer
2. **PR comment** — summary table from `quality-summary` job
3. **Job artifact** — full SARIF / JSON for deeper digging

---

## 3. WordPress / PHP layer (Layer 2+3)

The plugin lives at `mission-metrics-wp-plugin/` and is mirrored to `supabase/functions/serve-plugin-zip/plugin-template/`. Both paths are scanned.

### Stack

| Tool | Job |
|---|---|
| **PHPCS + WordPress-Coding-Standards + WordPress-Plugin-VIP-Go** | Style, sanitization, escaping, nonces, capability checks |
| **PHPStan** (level 5, with `szepeviktor/phpstan-wordpress`) | Type/null safety, dead code, undefined methods |
| **PHP parallel-lint** | Catches parse errors before PHPStan even loads |

### What we specifically catch

These are the recurring WP plugin foot-guns this layer flags:

- Missing `wp_verify_nonce` / `check_ajax_referer` on AJAX handlers
- Missing `current_user_can()` capability checks
- `$_GET` / `$_POST` / `$_REQUEST` used without `sanitize_*` or `wp_unslash`
- Output without `esc_html` / `esc_attr` / `esc_url` / `wp_kses_post`
- `wp_remote_get` / `wp_remote_post` with no timeout
- Direct `$wpdb->query` with interpolated variables (forces `$wpdb->prepare`)
- `extract()`, `eval()`, backticks, `assert()`
- `error_log` left in shipped code (warning, not error)
- Static analysis: undefined methods, wrong-typed args, null derefs

### Baseline strategy for the existing plugin

The plugin is ~30+ files and predates this pipeline. We do **not** require zero violations on day one.

1. **Generate baselines:**
   - PHPStan: `phpstan analyse --generate-baseline`
   - PHPCS: `phpcs --report=json > .phpcs-baseline.json` (custom diff script, see `scripts/phpcs-baseline.mjs`)
2. **Commit the baselines.** New code is clean from the start; legacy is grandfathered.
3. **Phased ratchet** (see §9): every release shrinks the baseline by at least 5%.

---

## 4. Dependency + secret scanning (Layer 4+5)

### Dependencies

| Tool | Trigger | What it does |
|---|---|---|
| **Dependabot** (`.github/dependabot.yml`) | Daily | Opens PRs for npm + GitHub Actions updates |
| **audit-ci** | PR + main + nightly | Runs `npm audit`, fails on `high`/`critical` |
| **GitHub Dependency Review** | PR | Blocks PRs that introduce new high/critical CVEs |

### Secrets

| Tool | Trigger | Scope |
|---|---|---|
| **gitleaks** | PR (delta) | New commits only — fast |
| **gitleaks** | Nightly | Full git history — catches things we missed |
| **GitHub Secret Scanning** (built-in) | Continuous | Provider-issued tokens (Stripe, GitHub, etc.) |

`.gitleaks.toml` allow-lists known-safe patterns: the publishable Supabase anon key, the `SUPABASE_URL`, anything in `*.test.ts` fixtures.

### Severity → action

| Finding | Action |
|---|---|
| Critical CVE in production dep | **Block** PR/release |
| High CVE in production dep | **Block** PR/release |
| High/critical CVE in dev dep | **Warn** (still triaged within a week) |
| Any leaked live secret | **Block** + immediate rotation via Connectors |
| Test fixture / placeholder secret | **Warn** + add to `.gitleaks.toml` allow-list |

---

## 5. Frontend product checks (Layer 6)

**Lighthouse CI** runs against a local production build (`npm run build && npm run preview`) on five representative routes:

```
/
/auth
/dashboard
/settings
/reports
```

### Tracked metrics (`lighthouserc.json`)

| Metric | Target | Action on miss |
|---|---|---|
| Performance | ≥ 0.80 | Warn |
| Accessibility | ≥ 0.95 | **Block** (regressions only) |
| Best Practices | ≥ 0.90 | Warn |
| SEO | ≥ 0.95 | Warn |
| LCP | ≤ 2500 ms | Warn |
| CLS | ≤ 0.1 | Warn |
| TBT | ≤ 300 ms | Warn |

**Regression detection**: LHCI compares each PR's median run against the last 5 runs from `main`. A drop of >5 absolute points on any score posts a comment.

a11y is the only frontend gate that **blocks** — and only on regression, not on absolute score. The product is large enough that demanding 0.95 everywhere on day one would be theatre.

---

## 6. Running-app security (Layer 7)

**OWASP ZAP** runs in two modes:

| Mode | Trigger | Target | Duration |
|---|---|---|---|
| Baseline | Release tag + nightly | `https://mshnctrl.lovable.app` | ~2 min |
| Authenticated | Manual (`workflow_dispatch`) | Same, with magic-link login | ~10 min |

ZAP runs as a **passive** scan — no active exploitation against staging. It catches:

- Missing security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- Mixed content / unsafe links
- Cookies missing `Secure` / `HttpOnly` / `SameSite`
- Information disclosure (server banners, stack traces)
- Outdated JS libs detected via fingerprint

Ignored alerts live in `.zap/rules.tsv` with a written justification.

For the WordPress plugin specifically, the staging Lovable preview hits the same edge functions the plugin calls, so plugin-connected flows (`/check-site-status`, `/ingest-heartbeat`, `/track-pageview`) get header/CORS/auth coverage by extension.

---

## 7. CI/CD release gates (the pass / warn / fail matrix)

This is the **single source of truth** for what blocks a release. Workflow files implement exactly this matrix.

| Layer | Finding | PR | `main` | Release tag |
|---|---|---|---|---|
| ESLint | error rule | ❌ block | ❌ block | ❌ block |
| ESLint | warn rule | ⚠ warn | ⚠ warn | ⚠ warn |
| TypeScript | any error | ❌ block | ❌ block | ❌ block |
| Unit tests | any failure | ❌ block | ❌ block | ❌ block |
| Semgrep | `ERROR` severity | ❌ block | ❌ block | ❌ block |
| Semgrep | `WARNING` | ⚠ warn | ⚠ warn | ⚠ warn |
| PHPStan | level-5 error | ❌ block (new only) | ❌ block | ❌ block |
| PHPCS | error rule | ❌ block (new only) | ❌ block | ❌ block |
| PHPCS | warning rule | ⚠ warn | ⚠ warn | ⚠ warn |
| audit-ci | critical CVE prod | ❌ block | ❌ block | ❌ block |
| audit-ci | high CVE prod | ❌ block | ❌ block | ❌ block |
| audit-ci | high CVE dev | ⚠ warn | ⚠ warn | ⚠ warn |
| gitleaks | live secret | ❌ block | ❌ block | ❌ block |
| gitleaks | placeholder | ⚠ warn | ⚠ warn | ⚠ warn |
| Lighthouse | a11y regression > 5pt | ⚠ warn | ⚠ warn | ❌ block |
| Lighthouse | other score regression | ⚠ warn | ⚠ warn | ⚠ warn |
| ZAP baseline | High alert | n/a | n/a | ❌ block |
| ZAP baseline | Medium alert | n/a | n/a | ⚠ warn |
| Plugin artifact | version mismatch | ❌ block | ❌ block | ❌ block |

**"new only"** for PHP layers means: violations introduced by the diff fail; legacy violations in the baseline only warn until the ratchet schedule promotes them.

---

## 8. Reporting, triage, and developer workflow

### Where results show up

1. **GitHub Checks** — one check per layer, color-coded.
2. **PR comment** — single summary table posted by the `quality-summary` job. Updated, not duplicated, on each push.
3. **Workflow artifacts** — full SARIF/JSON reports, kept 30 days.
4. **GitHub Security tab** — Semgrep, gitleaks, and CodeQL findings (if enabled later) feed Code Scanning Alerts via SARIF upload.
5. **Issues** — nightly workflow opens an issue with label `quality:nightly` when ZAP, gitleaks history scan, or `npm audit` find something new.

### Triage process

1. Critical / blocker → fixed in the PR that introduced it, or reverted.
2. Nightly-only finding → assigned via labels `severity:critical|high|medium`, owner from `CODEOWNERS`.
3. Legacy / baseline finding → tracked in `docs/QUALITY_BASELINE.md` (auto-generated). Burned down per the ratchet schedule.
4. False positive → suppressed in the tool's own ignore file (`.semgrepignore`, `.zap/rules.tsv`, `.gitleaks.toml`) **with a comment explaining why**. No bare suppressions.

### Baseline strategy for legacy code

| Tool | Baseline file | Update cadence |
|---|---|---|
| PHPStan | `mission-metrics-wp-plugin/phpstan-baseline.neon` | Regenerated on each minor release; never auto-grows |
| PHPCS | `mission-metrics-wp-plugin/.phpcs-baseline.json` | Same |
| Lighthouse | Last 5 runs from `main` (LHCI server) | Continuous |
| ZAP | `.zap/rules.tsv` ignored alert IDs | Reviewed quarterly |

The baselines never *grow* — adding a baseline entry requires removing one or more during the same release. This is enforced by `scripts/check-baseline-shrink.mjs` in the release workflow.

---

## 9. Phased rollout (4 weeks)

| Week | Action | Posture |
|---|---|---|
| **1** | Land all configs + workflows. Generate baselines. Everything is **warn-only** in the report job, but PR check still shows pass/fail | Observe noise |
| **2** | Promote Layer 4 (deps) and Layer 5 (secrets) to **blocking**. Tune `.gitleaks.toml` allow-list | Real gates begin |
| **3** | Promote Layer 1 (lint, tsc, tests) and Layer 2 (Semgrep `ERROR`) to **blocking** | Code-quality floor enforced |
| **4** | Promote Layer 3 (PHPCS/PHPStan, **new violations only**) and Layer 7 (ZAP on release) to **blocking** | Full §7 matrix in effect |

After week 4, the **ratchet** kicks in: each minor release shrinks the PHP baselines by ≥5% or the release fails.

---

## 10. Implementation checklist

Drop-in files added by this change:

- [x] `docs/APP_BIBLE.md` — single source of truth for every subscriber-facing function and process; reviewed in-app at `/admin-setup → App Bible` before each release (per-release sign-off enforced)

- [x] `docs/QUALITY_PIPELINE.md` (this file)
- [x] `.github/workflows/ci.yml` — PR + push to main, layers 1–6
- [x] `.github/workflows/release.yml` — tag-triggered, full suite + ZAP
- [x] `.github/workflows/nightly.yml` — drift detection
- [x] `.github/workflows/codeql.yml` — GitHub-native SAST
- [x] `.github/dependabot.yml`
- [x] `eslint.config.js` — tightened ruleset
- [x] `.semgrep/actv-trkr.yml` — custom rules (CORS, supabase patterns)
- [x] `.semgrepignore`
- [x] `mission-metrics-wp-plugin/.phpcs.xml`
- [x] `mission-metrics-wp-plugin/phpstan.neon`
- [x] `mission-metrics-wp-plugin/composer.json` — pulls PHPCS, WPCS, PHPStan
- [x] `.gitleaks.toml`
- [x] `lighthouserc.json`
- [x] `.zap/rules.tsv`
- [x] `scripts/phpcs-baseline.mjs` — diff-only PHPCS reporter
- [x] `scripts/check-baseline-shrink.mjs` — ratchet enforcer
- [x] `scripts/quality-summary.mjs` — aggregates all layer outputs into PR comment

To enable **after** merging this PR (manual, one-time):

- [ ] Settings → Code security → enable Dependabot alerts + security updates
- [ ] Settings → Code security → enable Secret scanning + Push protection
- [ ] Settings → Code security → enable CodeQL default setup (or use the workflow added here)
- [ ] Settings → Branches → require status checks: `ci / quality-summary`, `ci / php`, `ci / lighthouse`
- [ ] Add repo secret `SEMGREP_APP_TOKEN` (free tier) if you want findings in Semgrep Cloud (optional)
- [ ] Confirm `https://mshnctrl.lovable.app` is reachable from GitHub Actions runners (it is — public URL)

---

## 11. Validation checklist (does the pipeline actually catch things?)

This is the **acceptance test**. After landing this PR, run each of these against a throwaway branch and confirm the corresponding gate fires:

| # | Seeded issue | Expected gate | Result |
|---|---|---|---|
| 1 | Add `const x: any = 1` in `src/` | ESLint job fails | |
| 2 | Add a failing `expect(1).toBe(2)` in any test | Vitest job fails | |
| 3 | Add `dangerouslySetInnerHTML={{__html: userInput}}` | Semgrep `ERROR` | |
| 4 | Bump a dep to a known-bad version (`lodash@4.17.20`) | audit-ci fails | |
| 5 | Commit a fake AWS key `AKIA[A-Z0-9]{16}` | gitleaks fails | |
| 6 | Add `<?php echo $_GET['x']; ?>` to a plugin file | PHPCS error | |
| 7 | Remove a nonce check from an existing AJAX handler | PHPCS error (WP.Security.NonceVerification) | |
| 8 | Add `<img alt="">` to a key route | Lighthouse a11y dips | |
| 9 | Push a tag and ZAP runs against staging | ZAP report uploaded as artifact | |
| 10 | Bump plugin `mission-metrics.php` version without running `plugin-artifacts.mjs` | release job fails on artifact mismatch | |

Each line in this table maps to a real workflow job. If any line doesn't fire as expected, the gate is broken — fix the workflow before relying on it.
