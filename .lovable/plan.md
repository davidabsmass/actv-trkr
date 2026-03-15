

# AI-Powered SEO Fix Suggestions

## Problem
Currently, clicking "Fix This" opens the modal with an empty field. The user wants AI to pre-generate a smart suggestion (optimized title, meta description, etc.) that they can review and optionally edit before applying.

## Approach

### 1. New Edge Function: `seo-suggest-fix`
A lightweight function that fetches the page HTML, sends it to Lovable AI (gemini-3-flash-preview), and returns an optimized value for the specific fix type.

- **Inputs**: `page_url`, `fix_type`, `issue_id`
- **AI prompt**: Tailored per fix type — e.g., "Write an SEO-optimized page title under 60 characters for this page" with the page's H1, current title, and first paragraph as context
- **Returns**: `{ suggested_value: string }`
- For `add_canonical`: no AI needed, just returns the page URL
- For `add_og_tags`: generates title + description from page content

### 2. Update `SeoFixModal` 
- Add a loading state that shows while the suggestion is being fetched
- On modal open, call `seo-suggest-fix` to get the AI suggestion
- Pre-populate the input with the AI-generated value
- User can edit freely before clicking "Apply Fix"
- Show a small "AI suggested" label next to the field

### 3. Update `SeoTab` (wiring)
- When `handleFixClick` is called, open the modal and trigger the suggestion fetch
- Pass `pageUrl` to the modal so it can request the suggestion

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/seo-suggest-fix/index.ts` | New — fetches page, calls AI for optimized value |
| `src/components/reports/SeoFixModal.tsx` | Add loading state, fetch suggestion on open, pre-populate field |
| `src/components/reports/SeoTab.tsx` | Pass `pageUrl` to modal |
| `supabase/config.toml` | Register new function |

