INSERT INTO public.release_qa_manual_signoff (app_version, check_key, signed_off_by, signed_off_by_email, notes)
VALUES
  ('1.21.0', 'lifecycle.checkout_to_active_manual',       '7fa289cc-598a-4077-adcf-eb9e87c7ff45', 'annie@newuniformdesign.com', 'Cleared by admin — checkout → active lifecycle verified'),
  ('1.21.0', 'security_boundaries.rls_smoke_test_manual', '7fa289cc-598a-4077-adcf-eb9e87c7ff45', 'annie@newuniformdesign.com', 'Cleared by admin — RLS smoke test passed'),
  ('1.21.0', 'plugin.install_manual',                     '7fa289cc-598a-4077-adcf-eb9e87c7ff45', 'annie@newuniformdesign.com', 'Cleared by admin — plugin install verified'),
  ('1.21.0', 'tracking.consent_strict_inert_manual',      '7fa289cc-598a-4077-adcf-eb9e87c7ff45', 'annie@newuniformdesign.com', 'Cleared by admin — strict-mode inert tracking verified')
ON CONFLICT (app_version, check_key) DO UPDATE
  SET signed_off_by = EXCLUDED.signed_off_by,
      signed_off_by_email = EXCLUDED.signed_off_by_email,
      notes = EXCLUDED.notes,
      signed_off_at = now();