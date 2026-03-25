

## Add Full Multi-Language Translation (i18n)

### What We're Building

A complete internationalization system that translates all user-facing strings in the app and lets users switch languages from the sidebar. Includes English (default), Spanish, French, and Portuguese.

### Architecture

```text
src/
├── i18n.ts                    ← i18next config + language detector
├── locales/
│   ├── en/common.json         ← English strings (source of truth)
│   ├── es/common.json         ← Spanish
│   ├── fr/common.json         ← French
│   └── pt/common.json         ← Portuguese
├── main.tsx                   ← import i18n.ts before App
├── components/
│   ├── AppSidebar.tsx         ← language switcher dropdown in footer
│   └── LanguageSwitcher.tsx   ← reusable switcher component
```

### Implementation Steps

**1. Install dependencies**
- `react-i18next`, `i18next`, `i18next-browser-languagedetector`

**2. Create `src/i18n.ts`**
- Initialize i18next with browser language detection, localStorage persistence, and fallback to English
- Import all locale JSON files

**3. Create translation JSON files** (`src/locales/{lang}/common.json`)
- Organized by section: `sidebar.*`, `dashboard.*`, `settings.*`, `account.*`, `reports.*`, `forms.*`, `seo.*`, `monitoring.*`, `security.*`, `auth.*`, `onboarding.*`, `common.*`
- ~300-400 string keys covering all hardcoded text

**4. Create `LanguageSwitcher` component**
- Small dropdown showing language flag/name (EN, ES, FR, PT)
- Calls `i18n.changeLanguage()` on selection
- Placed in the sidebar footer above the sign-out button

**5. Update `main.tsx`**
- Add `import "./i18n"` before App render

**6. Refactor all components to use `t()` function**

Components and pages to update (all hardcoded strings replaced with `t("key")`):

| Area | Files |
|------|-------|
| **Sidebar & Layout** | `AppSidebar.tsx`, `AppLayout.tsx` |
| **Dashboard** | `Dashboard.tsx`, `KPIRow.tsx`, `AiInsights.tsx`, `LatestSummary.tsx`, `FunnelWidget.tsx`, `WhatsWorking.tsx`, `TopPagesAndSources.tsx`, `WeeklySummary.tsx`, `SmartUpdates.tsx`, `GetStartedBanner.tsx`, `AlertsSection.tsx`, `FormHealthPanel.tsx`, `FormLeaderboard.tsx`, `DateRangeSelector.tsx` |
| **Reports** | `Reports.tsx`, `WeeklyTab.tsx`, `MonthlyTab.tsx`, `OverviewTab.tsx`, `SeoTab.tsx`, `SeoFixModal.tsx`, `SeoScoreCard.tsx`, `SeoIssuesList.tsx`, `InsightCard.tsx` |
| **Pages** | `Performance.tsx`, `Forms.tsx`, `Seo.tsx`, `Monitoring.tsx`, `Security.tsx`, `Account.tsx`, `Settings.tsx`, `Auth.tsx`, `Onboarding.tsx`, `GetStarted.tsx`, `Clients.tsx`, `AdminSetup.tsx`, `NotFound.tsx` |
| **Settings** | `ApiKeysSection.tsx`, `SitesSection.tsx`, `PluginSection.tsx`, `FormsSection.tsx`, `NotificationsSection.tsx`, `WhiteLabelSection.tsx` |
| **Other** | `OnboardingModal.tsx`, `FaqSection.tsx`, `ErrorBoundary.tsx`, `NotificationBell.tsx` |

**7. Update AI report prompts for multilingual output**
- In edge functions (`reports-ai-copy`, `nightly-summary`, `weekly-summary`), accept a `language` parameter
- Append "Respond in {language}" to prompts so AI-generated narratives are localized

### Technical Details

- **No additional cost** — `react-i18next` is free; translation JSONs are static files
- **Language persistence** — saved in `localStorage`, detected from browser on first visit
- **Fallback** — any missing key falls back to English
- **AI reports** — pass user's selected language to edge functions; adds ~0 cost since the prompt length change is negligible
- **Dynamic data** (page paths, URLs, source names) stays untranslated — only UI chrome is localized

### What Users See

- A language dropdown in the sidebar footer (globe icon + current language code)
- All labels, headings, descriptions, buttons, tooltips, and empty states switch instantly
- AI-generated summaries and reports render in the selected language

