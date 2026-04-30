-- One-time heal: this Gravity form is Active in WP but stuck as inactive
-- in the dashboard. Discovery scan never re-flipped it because the scan that
-- first observed it ran while the form was momentarily disabled.
UPDATE public.forms
   SET is_active = true
 WHERE id = '0ec8596f-de99-4db6-adc7-81a6fa5aef11';

UPDATE public.form_integrations
   SET is_active = true
 WHERE form_id = '0ec8596f-de99-4db6-adc7-81a6fa5aef11';