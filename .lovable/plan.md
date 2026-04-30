## Real root cause (revised)

I was wrong before. This is **not** a Gravity Forms label-collision issue. The scrambled entries are all **Avada** (`provider=avada`, `external_entry_id=avada_db_*`) pulled in by the WP-side backfill, and the bug is in **one function** in the plugin: `parse_avada_csv_format()` in `mission-metrics-wp-plugin/includes/class-forms.php`.

### The bug

When Avada stores a submission, it stores three parallel CSV strings: `data`, `field_types`, `field_labels`. The parser:

1. Builds `real_types` = field_types **filtered** to drop `submit/notice/html/hidden/captcha/honeypot/section/page` entries, **remembering each kept entry's original index**.
2. Then, for each kept type at filtered index `fi`:
   - reads `values[fi]` ← **filtered** index
   - reads `labels[ real_types[fi].index ]` ← **original** index

Values use the filtered index; labels use the original index. As soon as a skipped slot exists in the middle of the form (e.g. a hidden consent field, an HTML divider, a captcha), every value past that point shifts one slot to the left of its label. The real Phone/Zip values then fall off the visible labels and surface as "Field 11" / "Field 12".

The Apyx forms ("Physician General", "Patient General", "Renew You, Near You") had a consent checkbox / hidden field added recently — that's why **only the newest entries** are scrambled while older entries on the same form look fine. Same pattern, same root cause, every affected form.

The Gravity Forms patch I proposed earlier is **not needed**. The Gravity entries we sampled all parse correctly.

## Fix — single PHP function

In `parse_avada_csv_format()`, when iterating `real_types`, read **both** the value and the label from the original index:

```php
for ( $fi = 0; $fi < count( $real_types ); $fi++ ) {
    $orig_idx = $real_types[ $fi ]['index'];     // original column position
    $type     = strtolower( $real_types[ $fi ]['type'] );
    $val      = trim( (string) ( $values[ $orig_idx ] ?? '' ) );  // ← was $values[$fi]
    if ( $val === '' || strtolower( $val ) === 'array' ) continue;

    $raw_label = $labels[ $orig_idx ] ?? '';
    $label     = $raw_label ?: self::infer_avada_field_name( $type, $val, $orig_idx + 1 );

    $fields[] = array(
        'id'    => $orig_idx,
        'name'  => $label,
        'label' => $label,
        'type'  => $real_types[ $fi ]['type'],
        'value' => $val,
    );
}
```

That's the entire functional change. Defensive guard: if `values` array is shorter than `field_types` (older entries), the `?? ''` skip keeps us safe.

## Steps

1. **Plugin patch (v1.21.4)** — fix `parse_avada_csv_format()` in `class-forms.php` as above. Bump version in all 4 places per the Plugin Version Checklist memory.
2. **Run** `node scripts/plugin-artifacts.mjs` to sync the deploy artifact (per Plugin Version Sync memory — never manually edit then deploy).
3. **Heal historical data** — once Apyx updates to v1.21.4, re-run backfill for the 3 affected Avada forms (10098 Physician General, 10102 Patient General, 54 Renew You, Near You). The existing leads (matched by `external_entry_key`) will be **enriched/overwritten** by `ingest-form` with the corrected fields. No DB delete needed; the upsert already handles re-import.
4. **No Lovable-side code changes.** No edge function changes. No queue changes (the queue advance-after-3-retries fix from the prior loop already handled the stuck-job symptom and stays in place).

## What you'll need to do

- Update the plugin on apyxmedical.com to v1.21.4 (this fixes future submissions immediately).
- After update, I'll trigger a re-backfill on the 3 Avada forms to repair the existing scrambled entries.

## Affected scope

| Form | Provider | Currently affected entries |
|---|---|---|
| Physician General (10098) | Avada | latest ~3–5 entries |
| Patient General (10102) | Avada | latest entries with consent field |
| Renew You, Near You (54) | Avada | any new entries with skipped slots |
| Apyx Contact Page (Gravity) | gravity_forms | **not affected** — was a stuck-queue symptom, already fixed |
| All other Gravity forms | gravity_forms | **not affected** |

Approve and I'll ship v1.21.4 + trigger the heal pass.