
-- Fix Apyx Medical: rename two Avada forms whose names were stuck on the
-- "Form (avada)" stub created by realtime ingest before the WP plugin
-- discovery filled in the proper title.
UPDATE public.forms
SET name = 'Renew You, Near You'
WHERE id = '6c57ef45-66bb-47f2-9638-afb659d5a040'
  AND name = 'Form (avada)';

UPDATE public.forms
SET name = 'Physician General'
WHERE id = 'c0a2196a-afe6-462a-9655-1def05382390'
  AND name = 'Form (avada)';

UPDATE public.form_integrations
SET form_name = 'Renew You, Near You'
WHERE id = '488f0e10-ce7a-4c8a-a529-f1e09fdb6867'
  AND form_name = 'Form (avada)';

UPDATE public.form_integrations
SET form_name = 'Physician General'
WHERE id = '7981e12f-a4ae-4621-b71b-f64628b4786d'
  AND form_name = 'Form (avada)';
