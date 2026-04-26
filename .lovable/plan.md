## What I found when I tested it

I just fetched the URL the system has on file for the form:

```
URL stored:  https://livesinthebalance.org/advocacy/bill-of-rights/
HTTP result: 404
Page title:  "Page not found - LIVES IN THE BALANCE"
```

I tested twice — once with the monitoring probe's user-agent, once with a normal Chrome user-agent. Both got the same 404. I also pulled the site's sitemap (`page-sitemap.xml`, 129 URLs) and `/advocacy/bill-of-rights/` is **not in it**. Neither is anything else with "bill" or "rights" in the slug.

So from the server's perspective the page at the recorded URL really is gone. Monitoring isn't lying — it's just probing the wrong URL.

The likely cause: the page was renamed, moved, or the form was embedded on a new page, and the system never updated the form's stored `page_url`. The 67 historical leads were collected back in 2021 when the old URL was live (most recent submission: Nov 17, 2021).

## I need one piece of information from you

**What is the actual current URL where this form lives?** Once I know that, I can either:

- Update the form's stored page URL directly, or
- Fix the discovery logic so the WordPress plugin reports the correct URL automatically.

If you can paste the live URL (or just the page slug), I'll verify the form is detectable there and update the record.

## While I'm in there, I'll also ship these fixes

So this kind of confusion stops happening:

### 1. Show the actual reason in Monitoring
Today the row just says "Not Found" with an `EyeOff` icon. Change it to show the underlying signal — for example: "Page returned 404" or "Page returned 200 but form markup not detected" plus the timestamp. Same on the Dashboard "Form Health" panel. This single change would have made the cause obvious without needing this conversation.

### 2. Auto-relearn the page URL when the stored one 404s
When the liveness probe gets a 404 from the recorded `page_url`, automatically check the `forms` table's other known URL signals (recent leads' `page_url`, `lead_events_raw.payload.source_url`, recent `pageviews` referencing that form) before declaring the form not rendered. The Avada code path already does this kind of multi-source URL hydration (`buildKnownAvadaFormMappings` in `trigger-site-sync`); apply the same approach to Gravity Forms / WPForms / CF7 / Ninja / Fluent.

### 3. "Fix URL" action in the Monitoring row
When a form is flagged as not rendered, add an inline action that lets the user paste the correct URL and re-probe immediately, instead of having to dig into Settings.

### 4. Tighten Gravity Forms detection
The current fallback regex (`/gform_wrapper/i && /gfield/i`) is loose — many WP themes leave Gravity Forms scaffolding on pages where the form isn't actually present. Require the specific form ID in the match (`gform_wrapper_${id}`, `id="gform_${id}"`, or `gform_submit_button_${id}`) and only accept the loose match if a `<form>` element with a `gform_*` id is also present.

### Files touched

- `supabase/functions/trigger-site-sync/index.ts` — store HTTP status, add multi-source URL relearning for non-Avada providers, tighten `detectFormInHtml`.
- `supabase/functions/ingest-form-health/index.ts` — accept and store HTTP status from the WP plugin probe.
- Migration: add nullable `last_http_status int` to `form_health_checks`.
- `src/pages/Monitoring.tsx` (`FormChecksTab`) — surface HTTP status, last-rendered timestamp, and "Fix URL" action.
- `src/components/dashboard/FormHealthPanel.tsx` — explain the failure reason in the row.

No changes to lead/import logic.

---

Just confirm the current page URL for "Bill of Rights" and I'll proceed.
