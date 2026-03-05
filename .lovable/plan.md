

## Plan: Replace App Logo with Uploaded SVG

The uploaded SVG is a full "ACTV TRKR" wordmark logo with a gradient icon. It will replace the current text-only "ACTV TRKR" label in the sidebar header.

### Steps

1. **Copy the SVG** from `user-uploads://ACTV-TRKR-white.svg` to `src/assets/actv-trkr-logo.svg`

2. **Update `AppSidebar.tsx`** — Import the SVG and replace the text `<span>ACTV TRKR</span>` with an `<img>` tag rendering the logo at an appropriate height (~24px).

3. **Update Auth page** — If the Auth/Login page also shows the "ACTV TRKR" text branding, replace it with the same logo import.

4. **Update email templates** — Replace the `⚡ ACTV TRKR` text in the 5 email templates (`signup.tsx`, `recovery.tsx`, `magic-link.tsx`, `invite.tsx`, `reauthentication.tsx`) with an inline reference or keep as text (since email clients have limited SVG support, we'll keep the text fallback there).

