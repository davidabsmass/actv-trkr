

## Add "Need Help?" Callout to Homepage Footer

### What We're Building
A small secondary line in the homepage footer that reads **"Need Help? We build websites."** alongside the uploaded New Uniform Design logo, which links to `newuniformdesign.com`.

### Steps

1. **Copy the logo** into `src/assets/newuni-logo.png` from the uploaded file.

2. **Update the footer** in `src/pages/Index.tsx` (lines 510-528):
   - Add a centered row below the existing footer content
   - Display the text "Need Help? We build websites." in small muted text
   - Place the New Uniform Design logo (small, ~20px height) next to or near the text
   - Wrap the logo in an `<a>` tag linking to `https://newuniformdesign.com` with `target="_blank"`
   - Style to be subtle and not overpower the ACTV TRKR branding — small font, muted colors, separated by a thin top border or spacing

### Layout
```text
┌─────────────────────────────────────────────┐
│  [ACTV TRKR logo]   © 2026...   Privacy Terms│
│─────────────────────────────────────────────│
│     Need Help? We build websites. [NU logo] │
└─────────────────────────────────────────────┘
```

