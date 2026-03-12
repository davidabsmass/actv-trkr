

## Form Liveness Monitoring

### The Problem
You can't tell if forms are actually working on the live sites. The current Form Health panel only looks at submission volume trends — it can't distinguish between "fewer real visitors" and "the form is broken."

### Approach: Plugin-Side Form Presence Check

The WP plugin already has a cron heartbeat running every 5 minutes. We can extend it to also verify that forms are still rendered and functional on the site's pages, then report that status back to the dashboard.

### How It Works

**1. WP Plugin — Form Probe** (`class-forms.php`)
- Add a scheduled task (piggyback on existing 5-min cron or run hourly) that:
  - For each known form on the site, fetches the page URL where the form lives (stored during form discovery)
  - Does a local `wp_remote_get()` on that page and checks if the form's HTML container/shortcode is still present in the response
  - Sends a `form-health-check` payload to a new edge function with results per form: `{ form_id, rendered: true/false, page_url, checked_at }`

**2. Edge Function — `ingest-form-health`**
- Receives the probe results, authenticates via API key
- Upserts into a new `form_health_checks` table with columns: `id, org_id, site_id, form_id, is_rendered, page_url, last_checked_at, last_rendered_at`
- If a form transitions from rendered → not rendered, insert a monitoring alert

**3. Database — `form_health_checks` table**
- Stores the latest probe result per form
- RLS: org members can SELECT

**4. Dashboard UI Updates**
- **FormHealthPanel**: Add a new status `"not_rendered"` (red) when the probe reports the form is missing from its page
- **Monitoring page**: Add a "Form Checks" tab showing last probe time and status per form, with a manual "Re-check Now" button that triggers the site sync endpoint

### What Gets Checked
- The plugin fetches the page where each form was last seen
- Looks for the form's shortcode or HTML container (e.g., `[gravityform id="3"]`, `class="wpcf7"`, Avada form wrapper, etc.)
- Reports rendered/not-rendered per form

### Technical Details

| Component | Change |
|---|---|
| `class-forms.php` | Add `probe_form_pages()` method + hourly cron hook |
| New edge function `ingest-form-health` | Auth + upsert probe results + alert on transitions |
| SQL migration | Create `form_health_checks` table with RLS |
| `forms` table | Add nullable `page_url` column (populated during form discovery) |
| `FormHealthPanel.tsx` | Query `form_health_checks`, add `not_rendered` status |
| `Monitoring.tsx` | Add "Form Checks" tab |

### Limitations
- This checks that the form HTML is present on the page — it doesn't submit a test entry
- If a form is behind a login or modal, the probe may not detect it (we can note this in the UI)
- Initial run requires forms to have a known page URL (populated from form discovery or manually set)

