

## Streamline the Get Started Page

### Changes

**1. Remove FAQ section from the page** (`src/pages/GetStarted.tsx`)
- Remove the `FaqSection` import and its usage, leaving only `<GetStartedGuide />`.

**2. Remove subtitle from Step 1** (`src/components/onboarding/GetStartedGuide.tsx`)
- Delete the paragraph on line 52-54: "Log into your ACTV TRKR account and download the WordPress plugin."

**3. Show the actual API key inline in Step 2** (`src/components/onboarding/GetStartedGuide.tsx`)
- Import `useOrg`, `useQuery`, `supabase`, and clipboard utilities.
- Fetch the active API key hash for the current org (the raw key is only available at generation time, so we display the hash with a copy button — same pattern as WebsiteSetup).
- Replace the first bullet "Copy your API Key from your ACTV TRKR dashboard" with:
  - Bold text: **"Copy this API Key:"**
  - A styled code block showing the key hash with a copy-to-clipboard button
- Keep the remaining two bullets ("Paste it into the plugin settings" and "Click Connect").
- If no active key exists, show a short message directing the user to Settings > API Keys to generate one.

### Technical note
The system stores only a SHA-256 hash of the API key — the raw key is shown once at creation and cannot be retrieved afterward. The key hash displayed here is what WebsiteSetup already shows. If you'd prefer users to be able to copy a usable raw key from this page, we would need to either store the raw key (security tradeoff) or add a "Generate New Key" button directly on this page. The current plan mirrors what WebsiteSetup does.

