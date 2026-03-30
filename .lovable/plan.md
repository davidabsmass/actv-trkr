

## Fix Form Entries Display — Root Cause and Plan

### The Real Problem

The form entries display has been patched repeatedly with heuristic filters that keep breaking. Here is the actual data flow and where it fails:

```text
WordPress Plugin → ingest-form Edge Function → lead_fields_flat table → Frontend display
                   (stores fields correctly)    (data IS there)         (FILTERS IT OUT)
```

The data is being stored correctly in `lead_fields_flat`. The frontend display logic in both `Forms.tsx` and `Entries.tsx` contains ~180 lines of filtering heuristics that aggressively skip fields based on whether the `field_key` looks "numeric" or the `field_label` looks like a "placeholder." This causes entire field values to vanish.

Specific lines causing data loss:
- **Line 1177 (Forms.tsx)**: `if (isNumericLike(rawKey) && !meaningfulLabel) continue;` — Drops any field where the key is a number (like Gravity Forms field IDs: "33", "34", "36") and the label wasn't stored perfectly
- **Line 1172**: `if (!rawKey || !value) continue;` — Drops fields with empty values instead of showing a blank
- The "rank" system (rank 0 vs 1 vs 2) causes column ordering instability across loads

### The Fix: Simplify to a deterministic, non-lossy display

**Principle**: Show ALL `lead_fields_flat` data. Never filter out a field value. Only filter column *headers* for known metadata keys.

#### Step 1: Rewrite the `fieldColumns`/`leadFieldMap` useMemo in both files

Replace the current ~180 lines with a simple, deterministic approach:

1. **Collect ALL flat field records** — no skipping based on key format
2. **Build column list from field_label** (preferred) or field_key (fallback) — deduplicate by normalized label
3. **Only skip known metadata keys** (the existing `SKIP_KEYS_SET`: "data", "submission", "field_labels", etc.) and **known non-data types** ("submit", "html", "hidden", "captcha", "honeypot", "section", "page")
4. **Never skip a field just because its key is numeric** — Gravity Forms uses numeric IDs as keys, and this is the #1 cause of the bug
5. **Column ordering**: Use the `field_key` numeric value (for Gravity Forms natural ordering) or first-seen order
6. **For leads without flat fields**: Fall back to JSON payload parsing (existing logic, but simplified)
7. **Show blank ("—")** for any lead missing a column value — never hide the row

#### Step 2: Extract shared logic into a utility

Create `src/lib/form-field-display.ts` containing the single source of truth for:
- `buildFieldColumns(fieldsRaw, leads)` → `{ fieldColumns, leadFieldMap }`
- Shared skip-sets, label normalization

Both `Forms.tsx` and `Entries.tsx` will import from this shared file, eliminating the duplicated ~180-line blocks that keep diverging.

#### Step 3: Fix the "show blank" behavior

Remove any remaining filter that hides leads when their field map is empty. Every non-trashed lead must appear in the table. Missing values show "—".

### Technical Detail

The new `buildFieldColumns` function (~60 lines vs current ~180):

```text
Input: fieldsRaw (lead_fields_flat rows), leads (lead rows with JSON data)
Output: { fieldColumns: [{key, label}], leadFieldMap: Map<leadId, Record<colKey, value>> }

Algorithm:
1. Group flat fields by lead_id
2. For each field: skip if key in SKIP_KEYS or type in SKIP_TYPES
3. Build column key = "flat:{field_key}", label = field_label || field_key
4. Deduplicate columns by normalized label (case-insensitive)
5. Sort columns: numeric keys in ascending order, then alpha keys by first-seen
6. For leads without flat fields: parse JSON payload, same skip rules
7. Return all columns and all lead→field mappings (no value filtering)
```

### Files Changed

1. **New: `src/lib/form-field-display.ts`** — shared field display logic
2. **Edit: `src/pages/Forms.tsx`** — replace `fieldColumns`/`leadFieldMap` useMemo with call to shared utility
3. **Edit: `src/pages/Entries.tsx`** — same replacement

### What This Fixes

- Numeric field keys (Gravity Forms IDs like "33", "34") no longer get dropped
- Fields with empty labels but valid values are shown (label falls back to key)
- Column order is stable and deterministic
- No more "most entries are missing" — every lead with data appears
- Both Forms and Entries pages stay in sync permanently

