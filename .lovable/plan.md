

## Fix Avada Form Field Labels

### Problem
The Avada form sends empty `field_labels` (`, , , , , , , , , ,`). This causes two issues:
- The ingestion creates generic `field_1`, `field_2` etc. keys
- Some leads were double-ingested (JS capture + server hook) with incorrect label-to-value mapping (e.g., "Email" field contains a phone number, "City" contains an email)

### Root Cause
The Avada comma-separated format has empty labels. Both the PHP plugin and the edge function fall back to `field_X` names. The wrongly-named fields (name, email, city, phone, etc.) came from a dual-ingestion where labels were applied out of order.

### Fix Plan

**1. Database Cleanup** (SQL data operations)
- Delete the incorrectly-mapped named fields (`name`, `email`, `city`, `phone`, `description`, `state`, `country`, `subject`, `zip_code`) for all leads in this form — these have wrong values in wrong columns
- Update the `field_X` records with correct labels based on position:
  - `field_1` → Name, `field_2` → Phone, `field_3` → Email, `field_4` → Category, `field_5` → City, `field_6` → Zip Code, `field_7` → State, `field_8` → Country, `field_9` → Subject, `field_10` → Message

**2. Fix Avada Ingestion** (`supabase/functions/ingest-form/index.ts`)
- When Avada labels are all empty, apply type-based heuristics:
  - `email` type → "Email"
  - `textarea` type → "Message"
  - `select` type → "Category"
  - For `text` types, use value pattern matching (email regex → "Email", phone regex → "Phone", etc.)
- This prevents future submissions from getting generic labels

**3. Fix PHP Plugin** (`mission-metrics-wp-plugin/includes/class-forms.php`)
- Apply the same type-based heuristic fallback in `handle_avada()` when labels are empty strings

**4. Fix Display Merging** (`src/pages/Forms.tsx`)
- In `FormEntries`, when building columns, normalize `field_X` keys: if the same form has both `field_3` and `email` as columns, merge them positionally
- Simpler alternative: after the backfill, the data will be clean so no display changes needed — the column builder will pick up the proper labels automatically

