UPDATE public.form_integrations
SET status = 'importing',
    last_error = CASE WHEN total_entries_estimated > 50000
                      THEN 'Capped import — most-recent 8,000 of ' || total_entries_estimated::text
                      ELSE NULL END
WHERE id IN ('76381b6d-f7d2-4052-a4a1-6412c9594d3d','fe9cf6d4-95ed-4c0a-82d6-685d182e4bab');