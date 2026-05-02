I can fix the parts of this that are under the app’s control. The remaining 403 appears to be coming from the hosting edge layer, but I’ll harden the project so Facebook and other social crawlers have every possible app-level allowance.

## Plan

1. Update crawler/static hosting hints
   - Keep `facebookexternalhit` explicitly allowed in `public/robots.txt`.
   - Add the newer Meta crawler user agents if missing, including `Facebot` and `FacebookBot` alongside `facebookexternalhit` and `Meta-ExternalAgent`.
   - Add social crawler allowances to `public/_headers` where Lovable hosting supports static header hints.
   - Ensure `robots.txt`, the home page, and the OG image are served with indexable/no-block headers.

2. Harden social preview metadata
   - Re-check the home page Open Graph tags.
   - Keep absolute URLs for `og:url`, `og:image`, and `og:image:secure_url`.
   - Ensure Twitter/social metadata remains aligned with the same image.

3. Publish requirement
   - Because these are frontend/static asset changes, you’ll need to click **Publish → Update** afterward for the custom domain to receive the new files.

4. Verification after publish
   - Confirm these URLs return `200 OK`:
     - `https://actvtrkr.com/robots.txt`
     - `https://actvtrkr.com/`
     - `https://actvtrkr.com/actv-trkr-og.jpg`
   - Test with a Facebook crawler user agent.
   - Re-run Facebook Sharing Debugger.

## Important limitation

If Facebook’s actual scraper still receives `403` after these changes and after publishing, that confirms the block is outside the app files and must be lifted by Lovable hosting support. In that case I’ll provide the exact support message with the deployment ID and reproduction details.