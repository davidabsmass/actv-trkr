
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    -- Authenticated-only RPCs (frontend always signed in)
    'get_session_journeys(uuid, timestamp with time zone, timestamp with time zone, uuid, text, integer, integer)',
    'get_session_journey_stats(uuid, timestamp with time zone, timestamp with time zone, uuid)',
    'get_site_contacts(uuid, integer, integer, text)',
    'get_support_activity_for_org(uuid, integer)',
    'get_top_exit_pages(uuid, timestamp with time zone, timestamp with time zone, integer)',
    'get_lead_counts_by_form(uuid)',
    'get_retention_cohorts(integer)',
    'compute_account_lifecycle_stage(uuid)',
    'recompute_account_health(uuid)',
    'customer_resolve_ticket(uuid)',
    'calculate_engagement_score(text, uuid)',
    'create_org_with_admin(uuid, text, text)',
    'create_org_with_admin(uuid, text, text, boolean)',
    'ensure_org_consent_config()',
    'upsert_session(uuid, uuid, text, text, timestamp with time zone, text, text, text, text, text)',
    -- Admin/internal-only helpers (called by service role inside edge functions)
    'admin_wipe_org_data(uuid)',
    'set_org_lifecycle_status(uuid, org_lifecycle_status, text)',
    'replace_org_api_key(uuid, text, text)',
    'log_security_event(text, text, uuid, uuid, uuid, text, text, jsonb, text, text, text)',
    'qa_get_cron_last_runs(text[])',
    'compute_security_score(uuid)',
    'record_security_release_check(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Skip missing: %', fn;
    END;
  END LOOP;
END $$;
