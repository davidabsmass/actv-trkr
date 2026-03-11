

## Plan: Add Delete Entries Capability

### Problem
Users cannot delete test/unwanted lead entries from within the app. The `leads` table currently has no DELETE RLS policy, and the UI has no delete controls.

### Changes

**1. Database migration — Add DELETE RLS policy on `leads` table**
```sql
CREATE POLICY "leads_delete" ON public.leads
FOR DELETE TO authenticated
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
```

Also add DELETE policies for the related `lead_fields_flat` and `lead_events_raw` tables so orphan data is cleaned up:
```sql
CREATE POLICY "lff_delete" ON public.lead_fields_flat
FOR DELETE TO authenticated
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

CREATE POLICY "ler_delete" ON public.lead_events_raw
FOR DELETE TO authenticated
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
```

**2. UI changes in `src/pages/Entries.tsx`**

- Add a **checkbox column** to the entries table for multi-select.
- Add a **"Delete selected"** button (with Trash2 icon) in the toolbar that appears when entries are selected.
- Show a confirmation dialog (AlertDialog) before deletion.
- On confirm, delete from `lead_fields_flat` → `lead_events_raw` → `leads` (in that order to respect data dependencies), then invalidate queries.
- Add individual row delete via a dropdown or icon button as well.

### Technical Details

- Selected entries tracked via `useState<Set<string>>`.
- Delete mutation: batch-deletes by `.in("id", selectedIds)` on each table sequentially.
- Import `Trash2`, `Checkbox` components and `AlertDialog` components.
- The "select all" checkbox in the header toggles all visible (filtered) entries.

