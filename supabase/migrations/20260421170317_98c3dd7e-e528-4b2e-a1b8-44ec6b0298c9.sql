
CREATE OR REPLACE FUNCTION public.admin_wipe_org_data(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tables text[] := ARRAY[
    -- High-volume children FIRST, in batches via the same statement
    'pageviews','sessions','events','kpi_daily','monthly_aggregates','monthly_summaries',
    'nightly_summaries','weekly_summaries','traffic_daily','conversions_daily',
    'ingestion_anomalies','tracking_interruptions','user_input_events','user_activity_log',
    'site_visitors',
    'lead_fields_flat','lead_events_raw','leads',
    'form_entries','form_submission_logs','form_health_checks','form_import_jobs',
    'field_mappings','form_integrations','forms',
    'goal_completions','conversion_goals','goals_config','goals',
    'broken_links','incidents','monitoring_alerts','domain_health','ssl_health',
    'tracker_alerts','site_tracking_status','site_wp_environment',
    'plugin_health_reports','plugin_download_failures',
    'alerts','acquisition_metric_snapshots',
    'report_runs','report_schedules','report_custom_templates','saved_views',
    'archive_manifest','export_jobs','dashboard_snapshots','ai_usage_log',
    'site_credentials','site_ingest_tokens','site_settings','site_notification_rules',
    'credential_rotation_events',
    'consent_config','customer_profiles','customer_contracts','customer_health_snapshots',
    'onboarding_responses',
    'security_findings','security_alerts','security_events','security_release_checks',
    'security_audit_log',
    'retention_events','retention_messages','retention_account_health',
    'retention_account_flow_status',
    'seo_scans','seo_fix_queue','seo_fix_history',
    'ad_spend','api_keys','invite_codes','feedback','admin_notes','white_label_settings',
    'billing_recovery_events','cancellation_feedback','support_tickets',
    'subscription_status','renewals','orders','order_items','url_rules',
    'magic_login_tokens','signed_request_nonces','feature_requests','backup_health',
    'sites','org_users'
  ];
  v_table text;
  v_count bigint;
  v_total bigint;
  v_batch bigint;
  v_report jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_exists boolean;
  v_has_org_id boolean;
BEGIN
  -- Allow up to 5 min for big wipes
  PERFORM set_config('statement_timeout', '300000', true);

  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) INTO v_exists;
    IF NOT v_exists THEN
      v_report := v_report || jsonb_build_object('tbl_'||v_table, 'skipped: missing');
      CONTINUE;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'org_id'
    ) INTO v_has_org_id;
    IF NOT v_has_org_id THEN
      v_report := v_report || jsonb_build_object('tbl_'||v_table, 'skipped: no org_id');
      CONTINUE;
    END IF;

    BEGIN
      v_total := 0;
      -- Batch delete to avoid lock/row-count blowups on huge tables
      LOOP
        EXECUTE format(
          'WITH d AS (SELECT ctid FROM public.%I WHERE org_id = $1 LIMIT 5000) DELETE FROM public.%I t USING d WHERE t.ctid = d.ctid',
          v_table, v_table
        ) USING p_org_id;
        GET DIAGNOSTICS v_batch = ROW_COUNT;
        v_total := v_total + v_batch;
        EXIT WHEN v_batch = 0;
      END LOOP;
      v_report := v_report || jsonb_build_object('tbl_'||v_table, v_total);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_array(v_table || ': ' || SQLERRM);
      v_report := v_report || jsonb_build_object('tbl_'||v_table, 'error: ' || SQLERRM);
    END;
  END LOOP;

  -- Finally delete the org itself
  BEGIN
    DELETE FROM public.orgs WHERE id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_report := v_report || jsonb_build_object('tbl_orgs', v_count);
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_array('orgs: ' || SQLERRM);
    v_report := v_report || jsonb_build_object('tbl_orgs', 'error: ' || SQLERRM);
  END;

  RETURN jsonb_build_object('report', v_report, 'errors', v_errors);
END;
$function$;
