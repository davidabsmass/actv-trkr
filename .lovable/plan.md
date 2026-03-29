

## Plan: Filter out numeric-only field keys from form entries table

### Problem
The entries table shows both raw numeric field keys (28, 29, 30, 31, 32) from `lead_fields_flat` AND fallback "Field 1–5" columns parsed from `leads.data` JSONB. This creates duplicate data columns — the same values appear twice under different headers.

### Root cause
Some leads have `lead_fields_flat` records with meaningful labels (Name, Email, etc.) while others from the same form have raw numeric keys (28, 29, 30) that are internal Gravity Forms / Avada field IDs. The fallback parser then creates additional "Field X" columns for leads without flat records, doubling the columns.

### Fix — `src/pages/Entries.tsx`

1. **Skip purely-numeric field keys** in the `lead_fields_flat` processing loop (line ~380). If `f.field_key` matches `/^\d+$/` and `f.field_label` is also numeric or empty, skip it — these are raw form builder IDs, not display-worthy columns.

2. **Deduplicate by value**: When a lead already has flat field data with real labels, don't also parse its `leads.data` fallback. The existing `leadsWithFlatFields` check handles this, but the numeric-keyed flat fields are still being included. Filtering them at the source fixes the duplication.

### Technical detail

In the `useMemo` block (~line 379), add a filter:

```typescript
// Skip raw numeric field IDs (e.g. "28", "29") — these are internal form builder keys
const isNumericKey = /^\d+$/.test(f.field_key);
const hasRealLabel = f.field_label && !/^\d+$/.test(f.field_label) && f.field_label !== f.field_key;
if (isNumericKey && !hasRealLabel) continue;
```

This ensures only fields with meaningful labels (Name, Email, Phone, etc.) appear as columns, eliminating the duplicate numbered columns.

