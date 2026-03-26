

# CTA Goal Tracking — Plan

## What's happening now

The tracker already captures `cta_click` for any `<button>` outside a form and any element with `data-actv="cta"`. The "Book Online" button on Georgia Bone & Joint is likely an `<a>` tag (not a `<button>`, not outbound, not tel/mailto/download), so it falls through all classification rules and is never tracked.

## The fix — two parts

### Part 1: Expand tracker to support `data-actv-label` and catch more CTAs

**tracker.js changes:**
- Add support for a `data-actv-label` attribute so clients can tag any element with a custom label (e.g., `data-actv="cta" data-actv-label="Book Online - Dr. Smith"`)
- When `data-actv-label` is present, use it as `target_text` instead of the element's inner text
- Also capture `data-actv-label` as a separate `target_label` field in the event payload for grouping
- Expand `classifyClick` to also detect internal `<a>` tags that look like CTAs — specifically links with classes containing "btn", "button", "cta", or "book", or links with `role="button"`

**track-event edge function:**
- Add `target_label` to the sanitized fields stored in the `events` table (the column `meta` jsonb already exists and can hold this, or we store it there)

### Part 2: Goals system — let users define trackable goals in Settings

**Database: new `goals_config` table**
```
goals_config:
  id uuid PK
  org_id uuid
  site_id uuid (nullable)
  name text (e.g., "Book Online")
  match_type text ('target_text_contains' | 'target_label_exact' | 'page_path_contains')
  match_value text (e.g., "Book Online" or "dr-smith")
  event_type text default 'cta_click'
  is_conversion boolean default true
  created_at timestamptz
```
RLS: org members can read, admins can write.

**Settings UI: new "Goals" tab or section**
- Simple form: Name, Match rule (button text contains / label equals / page path contains), Event type dropdown
- List of configured goals with delete

**Dashboard: Goals widget**
- New `GoalConversions` component on Performance page
- Queries `events` table, filters by the goal match rules, shows a leaderboard: goal name, count, trend
- For the doctor use case: if buttons are tagged `data-actv-label="Dr. Smith"`, goals auto-group by label

### Part 3: WordPress setup instructions

Add a note in the Settings > Website Setup page explaining:
- To track any element as a CTA: add `data-actv="cta"` to it
- To add a custom label for grouping: add `data-actv-label="Your Label"`
- Example HTML shown in a code block

## Files changed

| File | Change |
|------|--------|
| `mission-metrics-wp-plugin/assets/tracker.js` | Expand `classifyClick` to catch CTA-like `<a>` tags; read `data-actv-label` |
| `supabase/functions/track-event/index.ts` | Store `target_label` in `meta` jsonb |
| New migration | Create `goals_config` table with RLS |
| `src/components/settings/GoalsSection.tsx` | New component: CRUD goals |
| `src/pages/Settings.tsx` | Add Goals section to general tab |
| `src/components/dashboard/GoalConversions.tsx` | New widget: goal leaderboard |
| `src/pages/Performance.tsx` | Add GoalConversions widget |
| `src/components/dashboard/ClickActivity.tsx` | Show `target_label` when available in drill-down |
| Locale files (all languages) | Add translation keys for goals UI |

