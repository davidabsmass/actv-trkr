
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    -- Triggers (never called via API)
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
    -- Admin/service-role only (called by edge functions)
    'admin_delete_org_record(uuid)',
    'admin_wipe_org_chunk(uuid, text, integer)',
    'admin_wipe_org_data(uuid)',
    'expire_old_support_grants()',
    'purge_auth_hardening_stale()',
    'purge_expired_mfa_codes()',
    'qa_check_pgmq_queue_depth()',
    'qa_get_cron_last_runs(text[])',
    'qa_list_cron_jobs()',
    'recompute_all_account_health()',
    'set_org_lifecycle_status(uuid, org_lifecycle_status, text)',
    'check_password_reset_rate_limit(text)',
    'call_edge_function(text, jsonb)',
    'emit_retention_event(uuid, text, text, jsonb, uuid, uuid, uuid, text, timestamp with time zone, boolean)',
    'log_security_event(text, text, uuid, uuid, uuid, text, text, jsonb, text, text, text)',
    'replace_org_api_key(uuid, text, text)',
    'compute_security_score(uuid)',
    'record_security_release_check(uuid)',
    -- pgmq wrappers (service role only)
    'enqueue_email(text, jsonb)',
    'delete_email(text, bigint)',
    'read_email_batch(text, integer, integer)',
    'move_to_dlq(text, text, bigint, jsonb)',
    -- internal increment helpers
    'increment_invite_use(uuid)',
    'increment_rate_limit(uuid, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skip missing: %', fn;
    END;
  END LOOP;
END $$;
