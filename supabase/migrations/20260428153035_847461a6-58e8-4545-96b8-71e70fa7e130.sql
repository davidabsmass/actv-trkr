
-- 1) rate_limits: RLS enabled but no policies. Restrict to service role only via deny policies.
CREATE POLICY "rate_limits_no_select" ON public.rate_limits FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "rate_limits_no_insert" ON public.rate_limits FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "rate_limits_no_update" ON public.rate_limits FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "rate_limits_no_delete" ON public.rate_limits FOR DELETE TO authenticated, anon USING (false);

-- 2) Drop overly broad email-assets listing policy. Bucket is public so URLs still resolve.
DROP POLICY IF EXISTS "email_assets_select_authenticated" ON storage.objects;

-- 3) Lock search_path on the only function missing it
ALTER FUNCTION public.touch_user_two_factor_updated_at() SET search_path = public;

-- 4) Revoke EXECUTE from anon (and PUBLIC) on internal-only SECURITY DEFINER functions.
--    These are triggers, internal helpers, or admin-only RPCs. None are called from
--    unauthenticated frontend code. We keep authenticated grants intact where appropriate.
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    -- Trigger functions (only fired by DB triggers, never via API)
    'create_default_notification_prefs()',
    'handle_new_user()',
    'handle_support_message_inserted()',
    'handle_support_ticket_after_insert()',
    'handle_support_ticket_after_update()',
    'handle_support_ticket_created()',
    'log_deal_stage_change()',
    'org_users_first_member_owner()',
    'org_users_protect_owner_and_last_admin()',
    'sync_form_is_active_from_integration()',
    'touch_user_two_factor_updated_at()',
    'trg_bre_emit_retention()',
    'trg_cf_emit_retention()',
    'trg_lead_emit_first_data()',
    'trg_login_emit_retention()',
    'trg_org_emit_signup()',
    -- Internal/admin helpers (called from edge functions w/ service role, or scheduled)
    'admin_delete_org_record(uuid)',
    'admin_wipe_org_chunk(uuid, text, integer)',
    'expire_old_support_grants()',
    'purge_auth_hardening_stale()',
    'purge_expired_mfa_codes()',
    'qa_check_pgmq_queue_depth()',
    'qa_get_cron_last_runs()',
    'qa_list_cron_jobs()',
    'recompute_all_account_health()',
    'set_org_lifecycle_status(uuid, text, text)',
    'check_password_reset_rate_limit(text)',
    'call_edge_function(text, jsonb)',
    'emit_retention_event(uuid, text, text, jsonb, uuid, uuid, uuid, text, timestamp with time zone, boolean)',
    'ensure_org_consent_config(uuid)',
    -- pgmq wrappers (called by edge functions w/ service role only)
    'enqueue_email(text, jsonb)',
    'delete_email(text, bigint)',
    'read_email_batch(text, integer, integer)',
    'move_to_dlq(text, text, bigint, jsonb)',
    -- increment helpers (called by edge functions w/ service role)
    'increment_invite_use(uuid)',
    'increment_rate_limit(uuid, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skipping missing function: %', fn;
    END;
  END LOOP;
END $$;
