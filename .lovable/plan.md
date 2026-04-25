## What's already there

The consent banner copy IS editable today — just not in this dashboard. Every string (title, body, Accept/Reject/Manage Preferences labels, Privacy Settings link, Privacy Policy URL, US opt-out notice, position, expiry) is configured in **WordPress Admin → ACTV TRKR → Consent Banner**, shipped by `class-consent-banner.php`.

The dashboard only stores the *mode* (Strict / Relaxed) in `consent_config`. No copy fields.

## What this plan does

Surface the existing WP editor from inside the dashboard so users don't go hunting. No DB changes, no plugin changes.

### 1. Settings → Compliance → "Banner text & links" card

Add a card on the existing Compliance Setup page (`/compliance-setup`) titled **"Customize banner wording"**. It shows:

- A short list of what's editable (title, body, button labels, Privacy Policy URL, US Privacy Settings label)
- Per-site list (one row per connected site) with an **"Edit on WordPress →"** button that opens that site's plugin settings in a new tab:
  `https://{site_url}/wp-admin/options-general.php?page=actvtrkr-consent`
- Inline note: "Changes take effect immediately on the live site."

If only one site is connected, render it as a single primary button instead of a list.

### 2. Monitoring page — small pointer

On the Monitoring page, add a one-line helper near the compliance / consent status area:

> Banner wording (title, buttons, links) is set per site in WordPress. **Customize banner →** *(links to /compliance-setup#banner-wording)*

No new monitoring widget — just a contextual link so people stop wondering where it lives.

### 3. App Bible + help content

- Add a Q&A entry to `helpContent.ts`: *"Where do I edit the consent banner text?"* → explains the WP path and that future versions may move it into the dashboard.
- Update `mem://compliance/built-in-banner-spec` to note the dashboard now points users to the WP editor.

## Out of scope (ask separately if you want it)

- Editing banner copy *from* the dashboard (would need: new `consent_banner_copy` table, edit UI, plugin v1.10+ to fetch copy via API on page load, cache strategy, multi-language support).
- Per-language translations.
- A live preview of the banner inside the dashboard.

## Files touched

- `src/pages/ComplianceSetup.tsx` — add "Customize banner wording" card with per-site deep links
- `src/pages/Monitoring.tsx` (or its consent/compliance widget) — add the one-line pointer
- `src/components/support/helpContent.ts` — new Q&A entry
- `mem://compliance/built-in-banner-spec` — note the new dashboard pointer

No migrations. No edge function changes. No plugin update required.
