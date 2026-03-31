

## Remove Client-Side Lead Deduplication

### Problem
The app applies client-side deduplication that merges/removes leads which actually exist in WordPress (Avada, Gravity, etc.). WordPress is the source of truth — if it shows 16 entries, we show 16. If there are duplicates in WordPress, we show those duplicates.

### Solution
Stop deduplicating leads on the frontend. Show exactly what's in the database.

### Changes

**`src/pages/Forms.tsx`**
- Remove import of `deduplicateLeads`
- Replace `const dedupedLeads = useMemo(() => deduplicateLeads(leads), [leads])` with direct use of `leads` (or a simple sort-only memo)
- Update all downstream references from `dedupedLeads` to `leads`

**`src/pages/Entries.tsx`**
- Same removal of `deduplicateLeads` import and usage
- Use `leads` directly instead of `dedupedLeads`

**`src/lib/dedup-leads.ts`**
- Delete the file entirely (no longer used anywhere)

### What This Changes
- Entry counts will match exactly what WordPress reports
- Duplicate rows in Avada/Gravity will be shown as-is — because that's the truth
- No more silent merging of records the user expects to see

