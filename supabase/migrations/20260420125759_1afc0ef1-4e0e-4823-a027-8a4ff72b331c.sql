DO $$
DECLARE
  v_org_id uuid := '6be2af88-3777-4735-9007-0a05f491d19c';
  v_table text;
  v_tables text[] := ARRAY[
    'pageviews','sessions','events','leads','lead_events_raw','lead_fields_flat',
    'form_entries','form_health_checks','form_submission_logs','form_import_jobs',
    'field_mappings','form_integrations','forms',
    'goal_completions','conversion_goals','goals_config','goals',
    'broken_links','incidents','monitoring_alerts','domain_health',
    'alerts','ingestion_anomalies','kpi_daily','monthly_aggregates',
    'conversions_daily','ad_spend','archive_manifest','export_jobs',
    'ai_usage_log','dashboard_snapshots','consent_config','customer_profiles',
    'api_keys','invite_codes','feedback','sites','org_users'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE org_id = $1', v_table) USING v_org_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.deletion_audit (org_id, action, details)
  VALUES (v_org_id, 'admin_delete_org', jsonb_build_object('org_name', 'My Organization', 'reason', 'Empty shell cleanup'));

  DELETE FROM public.orgs WHERE id = v_org_id;
END $$;