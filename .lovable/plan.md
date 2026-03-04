

## Problem

The invite links are correctly copied to clipboard using `actvtrkr.com`, but the **displayed** invite URL in the Clients page uses `window.location.origin`, which shows the Lovable preview domain.

## Fix

**`src/pages/Clients.tsx` line 556** — Replace `{window.location.origin}` with the `APP_DOMAIN` constant so the displayed link matches the copied link.

Import `APP_DOMAIN` from `@/lib/utils` and change:
```
{window.location.origin}/auth?invite={ic.code}
```
to:
```
{APP_DOMAIN}/auth?invite={ic.code}
```

One-line change plus adding the import.

