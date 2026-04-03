-- Harden RLS: change all policies from public role to authenticated role
-- This prevents anonymous/unauthenticated users from ever matching any policy

-- ad_spend
DROP POLICY IF EXISTS "as_delete" ON public.ad_spend;
CREATE POLICY "as_delete" ON public.ad_spend FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "as_insert" ON public.ad_spend;
CREATE POLICY "as_insert" ON public.ad_spend FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "as_select" ON public.ad_spend;
CREATE POLICY "as_select" ON public.ad_spend FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "as_update" ON public.ad_spend;
CREATE POLICY "as_update" ON public.ad_spend FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- ai_usage_log
DROP POLICY IF EXISTS "service_insert" ON public.ai_usage_log;
CREATE POLICY "service_insert" ON public.ai_usage_log FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));

-- alerts
DROP POLICY IF EXISTS "alerts_select" ON public.alerts;
CREATE POLICY "alerts_select" ON public.alerts FOR SELECT TO authenticated USING (is_org_member(org_id));

-- broken_links
DROP POLICY IF EXISTS "bl_select" ON public.broken_links;
CREATE POLICY "bl_select" ON public.broken_links FOR SELECT TO authenticated USING (is_org_member(org_id));

-- conversions_daily
DROP POLICY IF EXISTS "cd_select" ON public.conversions_daily;
CREATE POLICY "cd_select" ON public.conversions_daily FOR SELECT TO authenticated USING (is_org_member(org_id));

-- dashboard_snapshots
DROP POLICY IF EXISTS "ds_insert" ON public.dashboard_snapshots;
CREATE POLICY "ds_insert" ON public.dashboard_snapshots FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- domain_health
DROP POLICY IF EXISTS "dh_select" ON public.domain_health;
CREATE POLICY "dh_select" ON public.domain_health FOR SELECT TO authenticated USING (is_org_member(org_id));

-- email_send_log
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT TO authenticated USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

-- email_send_state
DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state FOR ALL TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

-- email_unsubscribe_tokens
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT TO authenticated USING ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE TO authenticated USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

-- export_jobs
DROP POLICY IF EXISTS "ej_write" ON public.export_jobs;
CREATE POLICY "ej_write" ON public.export_jobs FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "ej_select" ON public.export_jobs;
CREATE POLICY "ej_select" ON public.export_jobs FOR SELECT TO authenticated USING (is_org_member(org_id));

-- field_mappings
DROP POLICY IF EXISTS "fm_delete" ON public.field_mappings;
CREATE POLICY "fm_delete" ON public.field_mappings FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "fm_write" ON public.field_mappings;
CREATE POLICY "fm_write" ON public.field_mappings FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "fm_select" ON public.field_mappings;
CREATE POLICY "fm_select" ON public.field_mappings FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "fm_update" ON public.field_mappings;
CREATE POLICY "fm_update" ON public.field_mappings FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- form_submission_logs
DROP POLICY IF EXISTS "fsl_select" ON public.form_submission_logs;
CREATE POLICY "fsl_select" ON public.form_submission_logs FOR SELECT TO authenticated USING (is_org_member(org_id));

-- forms
DROP POLICY IF EXISTS "forms_write" ON public.forms;
CREATE POLICY "forms_write" ON public.forms FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "forms_select" ON public.forms;
CREATE POLICY "forms_select" ON public.forms FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "forms_update" ON public.forms;
CREATE POLICY "forms_update" ON public.forms FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- goals
DROP POLICY IF EXISTS "goals_write" ON public.goals;
CREATE POLICY "goals_write" ON public.goals FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "goals_select" ON public.goals;
CREATE POLICY "goals_select" ON public.goals FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "goals_update" ON public.goals;
CREATE POLICY "goals_update" ON public.goals FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- incidents
DROP POLICY IF EXISTS "inc_insert" ON public.incidents;
CREATE POLICY "inc_insert" ON public.incidents FOR INSERT TO authenticated WITH CHECK (is_org_member(org_id));
DROP POLICY IF EXISTS "inc_select" ON public.incidents;
CREATE POLICY "inc_select" ON public.incidents FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "inc_update" ON public.incidents;
CREATE POLICY "inc_update" ON public.incidents FOR UPDATE TO authenticated USING (is_org_member(org_id));

-- invite_codes
DROP POLICY IF EXISTS "ic_insert" ON public.invite_codes;
CREATE POLICY "ic_insert" ON public.invite_codes FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = 'admin'::text));
DROP POLICY IF EXISTS "ic_select" ON public.invite_codes;
CREATE POLICY "ic_select" ON public.invite_codes FOR SELECT TO authenticated USING ((user_org_role(org_id) = 'admin'::text));
DROP POLICY IF EXISTS "ic_update" ON public.invite_codes;
CREATE POLICY "ic_update" ON public.invite_codes FOR UPDATE TO authenticated USING ((user_org_role(org_id) = 'admin'::text));

-- kpi_daily
DROP POLICY IF EXISTS "kd_select" ON public.kpi_daily;
CREATE POLICY "kd_select" ON public.kpi_daily FOR SELECT TO authenticated USING (is_org_member(org_id));

-- lead_events_raw
DROP POLICY IF EXISTS "ler_select" ON public.lead_events_raw;
CREATE POLICY "ler_select" ON public.lead_events_raw FOR SELECT TO authenticated USING (is_org_member(org_id));

-- lead_fields_flat
DROP POLICY IF EXISTS "lff_select" ON public.lead_fields_flat;
CREATE POLICY "lff_select" ON public.lead_fields_flat FOR SELECT TO authenticated USING (is_org_member(org_id));

-- leads
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- monitoring_alerts
DROP POLICY IF EXISTS "ma2_select" ON public.monitoring_alerts;
CREATE POLICY "ma2_select" ON public.monitoring_alerts FOR SELECT TO authenticated USING (is_org_member(org_id));

-- notification_inbox
DROP POLICY IF EXISTS "ni_select" ON public.notification_inbox;
CREATE POLICY "ni_select" ON public.notification_inbox FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "ni_update" ON public.notification_inbox;
CREATE POLICY "ni_update" ON public.notification_inbox FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

-- onboarding_responses
DROP POLICY IF EXISTS "or_insert" ON public.onboarding_responses;
CREATE POLICY "or_insert" ON public.onboarding_responses FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "or_select" ON public.onboarding_responses;
CREATE POLICY "or_select" ON public.onboarding_responses FOR SELECT TO authenticated USING (is_org_member(org_id));

-- order_items
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated USING (is_org_member(org_id));

-- orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated USING (is_org_member(org_id));

-- pageviews
DROP POLICY IF EXISTS "pv_select" ON public.pageviews;
CREATE POLICY "pv_select" ON public.pageviews FOR SELECT TO authenticated USING (is_org_member(org_id));

-- profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

-- renewals
DROP POLICY IF EXISTS "ren_delete" ON public.renewals;
CREATE POLICY "ren_delete" ON public.renewals FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "ren_insert" ON public.renewals;
CREATE POLICY "ren_insert" ON public.renewals FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "ren_update" ON public.renewals;
CREATE POLICY "ren_update" ON public.renewals FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- report_runs
DROP POLICY IF EXISTS "rr_write" ON public.report_runs;
CREATE POLICY "rr_write" ON public.report_runs FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "rr_select" ON public.report_runs;
CREATE POLICY "rr_select" ON public.report_runs FOR SELECT TO authenticated USING (is_org_member(org_id));

-- report_schedules
DROP POLICY IF EXISTS "rs_delete" ON public.report_schedules;
CREATE POLICY "rs_delete" ON public.report_schedules FOR DELETE TO authenticated USING ((user_org_role(org_id) = 'admin'::text));
DROP POLICY IF EXISTS "rs_write" ON public.report_schedules;
CREATE POLICY "rs_write" ON public.report_schedules FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = 'admin'::text));
DROP POLICY IF EXISTS "rs_update" ON public.report_schedules;
CREATE POLICY "rs_update" ON public.report_schedules FOR UPDATE TO authenticated USING ((user_org_role(org_id) = 'admin'::text));

-- saved_views
DROP POLICY IF EXISTS "sv_delete" ON public.saved_views;
CREATE POLICY "sv_delete" ON public.saved_views FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "sv_write" ON public.saved_views;
CREATE POLICY "sv_write" ON public.saved_views FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "sv_select" ON public.saved_views;
CREATE POLICY "sv_select" ON public.saved_views FOR SELECT TO authenticated USING (is_org_member(org_id));

-- seo_fix_history
DROP POLICY IF EXISTS "sfh_insert" ON public.seo_fix_history;
CREATE POLICY "sfh_insert" ON public.seo_fix_history FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "sfh_select" ON public.seo_fix_history;
CREATE POLICY "sfh_select" ON public.seo_fix_history FOR SELECT TO authenticated USING (is_org_member(org_id));

-- seo_fix_queue
DROP POLICY IF EXISTS "sfq_insert" ON public.seo_fix_queue;
CREATE POLICY "sfq_insert" ON public.seo_fix_queue FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "sfq_select" ON public.seo_fix_queue;
CREATE POLICY "sfq_select" ON public.seo_fix_queue FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "sfq_update" ON public.seo_fix_queue;
CREATE POLICY "sfq_update" ON public.seo_fix_queue FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- sessions
DROP POLICY IF EXISTS "sess_select" ON public.sessions;
CREATE POLICY "sess_select" ON public.sessions FOR SELECT TO authenticated USING (is_org_member(org_id));

-- site_heartbeats
DROP POLICY IF EXISTS "sh_select" ON public.site_heartbeats;
CREATE POLICY "sh_select" ON public.site_heartbeats FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM sites s WHERE ((s.id = site_heartbeats.site_id) AND is_org_member(s.org_id)))));

-- site_notification_rules
DROP POLICY IF EXISTS "snr_delete" ON public.site_notification_rules;
CREATE POLICY "snr_delete" ON public.site_notification_rules FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "snr_insert" ON public.site_notification_rules;
CREATE POLICY "snr_insert" ON public.site_notification_rules FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "snr_select" ON public.site_notification_rules;
CREATE POLICY "snr_select" ON public.site_notification_rules FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "snr_update" ON public.site_notification_rules;
CREATE POLICY "snr_update" ON public.site_notification_rules FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- site_settings
DROP POLICY IF EXISTS "ss_insert" ON public.site_settings;
CREATE POLICY "ss_insert" ON public.site_settings FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "ss_select" ON public.site_settings;
CREATE POLICY "ss_select" ON public.site_settings FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "ss_update" ON public.site_settings;
CREATE POLICY "ss_update" ON public.site_settings FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- sites
DROP POLICY IF EXISTS "sites_delete" ON public.sites;
CREATE POLICY "sites_delete" ON public.sites FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "sites_write" ON public.sites;
CREATE POLICY "sites_write" ON public.sites FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "sites_select" ON public.sites;
CREATE POLICY "sites_select" ON public.sites FOR SELECT TO authenticated USING (is_org_member(org_id));

-- ssl_health
DROP POLICY IF EXISTS "slh_select" ON public.ssl_health;
CREATE POLICY "slh_select" ON public.ssl_health FOR SELECT TO authenticated USING (is_org_member(org_id));

-- suppressed_emails
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT TO authenticated USING ((auth.role() = 'service_role'::text));

-- traffic_daily
DROP POLICY IF EXISTS "td_select" ON public.traffic_daily;
CREATE POLICY "td_select" ON public.traffic_daily FOR SELECT TO authenticated USING (is_org_member(org_id));

-- url_rules
DROP POLICY IF EXISTS "ur_delete" ON public.url_rules;
CREATE POLICY "ur_delete" ON public.url_rules FOR DELETE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "ur_write" ON public.url_rules;
CREATE POLICY "ur_write" ON public.url_rules FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));
DROP POLICY IF EXISTS "ur_select" ON public.url_rules;
CREATE POLICY "ur_select" ON public.url_rules FOR SELECT TO authenticated USING (is_org_member(org_id));
DROP POLICY IF EXISTS "ur_update" ON public.url_rules;
CREATE POLICY "ur_update" ON public.url_rules FOR UPDATE TO authenticated USING ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- user_input_events
DROP POLICY IF EXISTS "uie_insert" ON public.user_input_events;
CREATE POLICY "uie_insert" ON public.user_input_events FOR INSERT TO authenticated WITH CHECK ((user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text])));

-- user_notification_preferences
DROP POLICY IF EXISTS "unp_insert" ON public.user_notification_preferences;
CREATE POLICY "unp_insert" ON public.user_notification_preferences FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "unp_select" ON public.user_notification_preferences;
CREATE POLICY "unp_select" ON public.user_notification_preferences FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "unp_update" ON public.user_notification_preferences;
CREATE POLICY "unp_update" ON public.user_notification_preferences FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

-- user_site_subscriptions
DROP POLICY IF EXISTS "uss_insert" ON public.user_site_subscriptions;
CREATE POLICY "uss_insert" ON public.user_site_subscriptions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "uss_select" ON public.user_site_subscriptions;
CREATE POLICY "uss_select" ON public.user_site_subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "uss_update" ON public.user_site_subscriptions;
CREATE POLICY "uss_update" ON public.user_site_subscriptions FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

-- weekly_summaries
DROP POLICY IF EXISTS "ws_select" ON public.weekly_summaries;
CREATE POLICY "ws_select" ON public.weekly_summaries FOR SELECT TO authenticated USING (is_org_member(org_id));