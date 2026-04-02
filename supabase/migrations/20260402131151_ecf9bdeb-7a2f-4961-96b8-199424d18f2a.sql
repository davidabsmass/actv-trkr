
DO $$
DECLARE
  v_site_id uuid := 'c56915b0-b0d6-40c6-b20c-876a1fa151c3';
  v_org_id uuid := 'f1481904-5c78-4a02-8b91-7012c9d5da96';
BEGIN
  -- Site-level cleanup
  DELETE FROM public.lead_fields_flat WHERE org_id = v_org_id;
  DELETE FROM public.lead_events_raw WHERE site_id = v_site_id;
  DELETE FROM public.leads WHERE site_id = v_site_id;
  DELETE FROM public.form_health_checks WHERE site_id = v_site_id;
  DELETE FROM public.form_submission_logs WHERE site_id = v_site_id;
  DELETE FROM public.forms WHERE site_id = v_site_id;
  DELETE FROM public.pageviews WHERE site_id = v_site_id;
  DELETE FROM public.sessions WHERE site_id = v_site_id;
  DELETE FROM public.events WHERE site_id = v_site_id;
  DELETE FROM public.broken_links WHERE site_id = v_site_id;
  DELETE FROM public.seo_scans WHERE site_id = v_site_id;
  DELETE FROM public.seo_fix_history WHERE site_id = v_site_id;
  DELETE FROM public.seo_fix_queue WHERE site_id = v_site_id;
  DELETE FROM public.security_events WHERE site_id = v_site_id;
  DELETE FROM public.incidents WHERE site_id = v_site_id;
  DELETE FROM public.monitoring_alerts WHERE site_id = v_site_id;
  DELETE FROM public.domain_health WHERE site_id = v_site_id;
  DELETE FROM public.ssl_health WHERE site_id = v_site_id;
  DELETE FROM public.site_heartbeats WHERE site_id = v_site_id;
  DELETE FROM public.site_wp_environment WHERE site_id = v_site_id;
  DELETE FROM public.site_visitors WHERE site_id = v_site_id;
  DELETE FROM public.site_notification_rules WHERE site_id = v_site_id;
  DELETE FROM public.notification_inbox WHERE site_id = v_site_id;
  DELETE FROM public.conversions_daily WHERE site_id = v_site_id;
  DELETE FROM public.goal_completions WHERE site_id = v_site_id;
  DELETE FROM public.goals_config WHERE site_id = v_site_id;
  DELETE FROM public.order_items WHERE org_id = v_org_id;
  DELETE FROM public.orders WHERE site_id = v_site_id;
  DELETE FROM public.ad_spend WHERE site_id = v_site_id;
  DELETE FROM public.renewals WHERE site_id = v_site_id;
  DELETE FROM public.user_site_subscriptions WHERE site_id = v_site_id;
  DELETE FROM public.weekly_summaries WHERE site_id = v_site_id;

  -- Org-level cleanup (tables not yet covered by site deletes)
  DELETE FROM public.api_keys WHERE org_id = v_org_id;
  DELETE FROM public.nightly_summaries WHERE org_id = v_org_id;
  DELETE FROM public.monthly_summaries WHERE org_id = v_org_id;
  DELETE FROM public.monthly_aggregates WHERE org_id = v_org_id;
  DELETE FROM public.kpi_daily WHERE org_id = v_org_id;
  DELETE FROM public.alerts WHERE org_id = v_org_id;
  DELETE FROM public.conversion_goals WHERE org_id = v_org_id;
  DELETE FROM public.ai_usage_log WHERE org_id = v_org_id;
  DELETE FROM public.customer_profiles WHERE org_id = v_org_id;
  DELETE FROM public.onboarding_responses WHERE org_id = v_org_id;
  DELETE FROM public.dashboard_snapshots WHERE org_id = v_org_id;
  DELETE FROM public.export_jobs WHERE org_id = v_org_id;
  DELETE FROM public.archive_manifest WHERE org_id = v_org_id;
  DELETE FROM public.deletion_audit WHERE org_id = v_org_id;
  DELETE FROM public.invite_codes WHERE org_id = v_org_id;
  DELETE FROM public.goals WHERE org_id = v_org_id;
  DELETE FROM public.field_mappings WHERE org_id = v_org_id;
  DELETE FROM public.subscription_status WHERE org_id = v_org_id;
  DELETE FROM public.site_settings WHERE org_id = v_org_id;
  DELETE FROM public.report_custom_templates WHERE org_id = v_org_id;
  DELETE FROM public.report_runs WHERE org_id = v_org_id;
  DELETE FROM public.report_schedules WHERE org_id = v_org_id;
  DELETE FROM public.saved_views WHERE org_id = v_org_id;
  DELETE FROM public.traffic_daily WHERE org_id = v_org_id;
  DELETE FROM public.url_rules WHERE org_id = v_org_id;
  DELETE FROM public.user_activity_log WHERE org_id = v_org_id;
  DELETE FROM public.user_input_events WHERE org_id = v_org_id;
  DELETE FROM public.white_label_settings WHERE org_id = v_org_id;

  -- Delete site, org membership, org
  DELETE FROM public.sites WHERE id = v_site_id;
  DELETE FROM public.org_users WHERE org_id = v_org_id;
  DELETE FROM public.orgs WHERE id = v_org_id;
END;
$$;
