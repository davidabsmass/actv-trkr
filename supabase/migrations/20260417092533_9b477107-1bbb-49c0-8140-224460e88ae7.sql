-- ============================================================================
-- RETENTION SYSTEM — Phase 1 + 2 schema (retry with orphan-safe backfill)
-- ============================================================================

CREATE TABLE public.retention_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id      uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  user_id      uuid,
  customer_id  uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  event_name   text NOT NULL,
  event_category text NOT NULL DEFAULT 'lifecycle',
  event_value  jsonb NOT NULL DEFAULT '{}'::jsonb,
  source       text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_retention_events_org_occurred ON public.retention_events (org_id, occurred_at DESC);
CREATE INDEX idx_retention_events_event_name   ON public.retention_events (event_name, occurred_at DESC);
CREATE INDEX idx_retention_events_org_event    ON public.retention_events (org_id, event_name, occurred_at DESC);
CREATE INDEX idx_retention_events_customer     ON public.retention_events (customer_id) WHERE customer_id IS NOT NULL;
ALTER TABLE public.retention_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all retention events" ON public.retention_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Org members can view their own retention events" ON public.retention_events FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.retention_account_health (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  customer_id              uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  health_score             integer NOT NULL DEFAULT 100,
  risk_level               text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  activation_stage         text NOT NULL DEFAULT 'new',
  lifecycle_stage          text NOT NULL DEFAULT 'new',
  last_data_received_at    timestamptz,
  last_login_at            timestamptz,
  last_summary_opened_at   timestamptz,
  last_payment_failed_at   timestamptz,
  churn_risk_reasons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancellation_intent      boolean NOT NULL DEFAULT false,
  billing_risk             boolean NOT NULL DEFAULT false,
  engagement_risk          boolean NOT NULL DEFAULT false,
  setup_risk               boolean NOT NULL DEFAULT false,
  reviewed_at              timestamptz,
  reviewed_by_user_id      uuid,
  internal_note            text,
  computed_at              timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rah_risk_level   ON public.retention_account_health (risk_level, health_score);
CREATE INDEX idx_rah_lifecycle    ON public.retention_account_health (lifecycle_stage);
CREATE INDEX idx_rah_health_score ON public.retention_account_health (health_score);
ALTER TABLE public.retention_account_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all account health" ON public.retention_account_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update account health" ON public.retention_account_health FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Org members can view own account health" ON public.retention_account_health FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER trg_rah_updated_at BEFORE UPDATE ON public.retention_account_health FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.retention_flows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  trigger_type  text NOT NULL,
  trigger_event text,
  absence_event text,
  absence_window_hours integer,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  audience_type text,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  goal          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retention_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage retention flows" ON public.retention_flows FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_retention_flows_updated_at BEFORE UPDATE ON public.retention_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.retention_flow_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         uuid NOT NULL REFERENCES public.retention_flows(id) ON DELETE CASCADE,
  step_order      integer NOT NULL,
  delay_minutes   integer NOT NULL DEFAULT 0,
  channel         text NOT NULL DEFAULT 'email',
  template_name   text,
  subject         text,
  body            text NOT NULL DEFAULT '',
  internal_name   text,
  send_condition  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, step_order)
);
CREATE INDEX idx_rfs_flow_order ON public.retention_flow_steps (flow_id, step_order);
ALTER TABLE public.retention_flow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage flow steps" ON public.retention_flow_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_retention_flow_steps_updated_at BEFORE UPDATE ON public.retention_flow_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.retention_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        uuid REFERENCES public.retention_flows(id) ON DELETE SET NULL,
  flow_step_id   uuid REFERENCES public.retention_flow_steps(id) ON DELETE SET NULL,
  org_id         uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  user_id        uuid,
  recipient_email text NOT NULL,
  channel        text NOT NULL DEFAULT 'email',
  message_type   text NOT NULL DEFAULT 'flow',
  subject        text,
  body           text,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped','suppressed')),
  scheduled_for  timestamptz,
  sent_at        timestamptz,
  email_message_id text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rm_org             ON public.retention_messages (org_id, created_at DESC);
CREATE INDEX idx_rm_status_sched    ON public.retention_messages (status, scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_rm_flow            ON public.retention_messages (flow_id);
CREATE UNIQUE INDEX uq_rm_dedupe    ON public.retention_messages (flow_step_id, org_id) WHERE flow_step_id IS NOT NULL;
ALTER TABLE public.retention_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all retention messages" ON public.retention_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Org members can view their own retention messages" ON public.retention_messages FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.retention_message_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES public.retention_messages(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_rml_message ON public.retention_message_log (message_id, event_timestamp DESC);
ALTER TABLE public.retention_message_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view message logs" ON public.retention_message_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.retention_account_flow_status (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  flow_id      uuid NOT NULL REFERENCES public.retention_flows(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','exited')),
  entered_at   timestamptz NOT NULL DEFAULT now(),
  exited_at    timestamptz,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (org_id, flow_id)
);
CREATE INDEX idx_rafs_status ON public.retention_account_flow_status (status, flow_id);
ALTER TABLE public.retention_account_flow_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage account flow status" ON public.retention_account_flow_status FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Org members can view their own flow status" ON public.retention_account_flow_status FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.cancellation_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  user_id         uuid,
  subscription_id text,
  reason          text NOT NULL,
  reason_detail   text,
  selected_offer  text,
  outcome         text NOT NULL DEFAULT 'abandoned' CHECK (outcome IN ('saved','paused','downgraded','canceled','abandoned')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cf_org ON public.cancellation_feedback (org_id, created_at DESC);
CREATE INDEX idx_cf_outcome ON public.cancellation_feedback (outcome, created_at DESC);
ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all cancellation feedback" ON public.cancellation_feedback FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Org members can view their own cancellation feedback" ON public.cancellation_feedback FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert their own cancellation feedback" ON public.cancellation_feedback FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_cf_updated_at BEFORE UPDATE ON public.cancellation_feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.billing_recovery_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  customer_id            uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_invoice_id      text,
  event_type             text NOT NULL,
  status                 text,
  amount                 numeric,
  currency               text,
  details                jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bre_org ON public.billing_recovery_events (org_id, occurred_at DESC);
CREATE INDEX idx_bre_stripe_customer ON public.billing_recovery_events (stripe_customer_id);
CREATE INDEX idx_bre_event_type ON public.billing_recovery_events (event_type, occurred_at DESC);
ALTER TABLE public.billing_recovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all billing recovery events" ON public.billing_recovery_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.emit_retention_event(
  p_org_id uuid, p_event_name text, p_event_category text DEFAULT 'lifecycle',
  p_event_value jsonb DEFAULT '{}'::jsonb, p_site_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_customer_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL, p_occurred_at timestamptz DEFAULT now(),
  p_first_time_only boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing_id uuid; v_id uuid;
BEGIN
  -- Skip if org doesn't exist
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = p_org_id) THEN RETURN NULL; END IF;
  IF p_first_time_only THEN
    SELECT id INTO v_existing_id FROM public.retention_events WHERE org_id = p_org_id AND event_name = p_event_name LIMIT 1;
    IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  END IF;
  INSERT INTO public.retention_events (org_id, site_id, user_id, customer_id, event_name, event_category, event_value, source, occurred_at)
  VALUES (p_org_id, p_site_id, p_user_id, p_customer_id, p_event_name, p_event_category, p_event_value, p_source, p_occurred_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.compute_account_lifecycle_stage(p_org_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_has_data boolean; v_has_login boolean; v_has_engaged boolean; v_cancellation boolean;
BEGIN
  SELECT s.status INTO v_status
  FROM public.subscribers s
  JOIN public.profiles p ON LOWER(p.email) = LOWER(s.email)
  JOIN public.org_users ou ON ou.user_id = p.user_id
  WHERE ou.org_id = p_org_id LIMIT 1;

  IF v_status = 'churned' THEN RETURN 'canceled'; END IF;
  IF v_status = 'paused' THEN RETURN 'paused'; END IF;
  IF v_status = 'past_due' THEN RETURN 'billing_risk'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name = 'cancellation_flow_started') INTO v_cancellation;
  IF v_cancellation THEN RETURN 'cancellation_pending'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name = 'first_data_received') INTO v_has_data;
  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name IN ('second_login','first_dashboard_view')) INTO v_has_login;
  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name IN ('first_report_generated','weekly_summary_opened') AND occurred_at > now() - interval '30 days') INTO v_has_engaged;

  IF v_has_engaged THEN RETURN 'engaged'; END IF;
  IF v_has_data AND v_has_login THEN RETURN 'live'; END IF;
  IF v_has_data THEN RETURN 'connected'; END IF;
  IF EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name IN ('plugin_downloaded','plugin_installed')) THEN RETURN 'setup_started'; END IF;
  RETURN 'new';
END; $$;

CREATE OR REPLACE FUNCTION public.recompute_account_health(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_score integer := 100; v_reasons jsonb := '[]'::jsonb;
  v_setup_risk boolean := false; v_engagement_risk boolean := false;
  v_billing_risk boolean := false; v_cancel_intent boolean := false;
  v_risk_level text; v_lifecycle text;
  v_org_age_hours numeric; v_last_data timestamptz; v_last_login timestamptz;
  v_last_summary timestamptz; v_last_pay_fail timestamptz;
  v_subscriber_id uuid; v_sub_status text;
  v_has_plugin boolean; v_has_first_data boolean; v_has_second_login boolean;
  v_logins_count integer; v_org_created timestamptz;
BEGIN
  SELECT created_at INTO v_org_created FROM public.orgs WHERE id = p_org_id;
  IF v_org_created IS NULL THEN RETURN; END IF;
  v_org_age_hours := EXTRACT(EPOCH FROM (now() - v_org_created)) / 3600.0;

  SELECT s.id, s.status INTO v_subscriber_id, v_sub_status
  FROM public.subscribers s
  JOIN public.profiles p ON LOWER(p.email) = LOWER(s.email)
  JOIN public.org_users ou ON ou.user_id = p.user_id
  WHERE ou.org_id = p_org_id LIMIT 1;

  SELECT MAX(occurred_at) INTO v_last_data FROM public.retention_events WHERE org_id = p_org_id AND event_name IN ('first_data_received','heartbeat_received');
  IF v_last_data IS NULL THEN SELECT MAX(submitted_at) INTO v_last_data FROM public.leads WHERE org_id = p_org_id; END IF;
  SELECT MAX(logged_in_at) INTO v_last_login FROM public.login_events WHERE org_id = p_org_id;
  SELECT COUNT(*) INTO v_logins_count FROM public.login_events WHERE org_id = p_org_id;
  SELECT MAX(occurred_at) INTO v_last_summary FROM public.retention_events WHERE org_id = p_org_id AND event_name IN ('weekly_summary_opened','monthly_summary_opened');
  SELECT MAX(occurred_at) INTO v_last_pay_fail FROM public.billing_recovery_events WHERE org_id = p_org_id AND event_type IN ('invoice_payment_failed','payment_retry_failed');
  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name IN ('plugin_connected','license_connected','first_data_received')) INTO v_has_plugin;
  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name = 'first_data_received') INTO v_has_first_data;
  SELECT EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name = 'second_login') INTO v_has_second_login;

  IF v_org_age_hours > 24 AND NOT v_has_plugin THEN
    v_score := v_score - 15; v_setup_risk := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','No plugin connection','category','setup'));
  END IF;
  IF v_org_age_hours > 48 AND NOT v_has_first_data THEN
    v_score := v_score - 15; v_setup_risk := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','No data received','category','setup'));
  END IF;
  IF v_org_age_hours > 24*7 AND NOT v_has_second_login AND v_logins_count <= 1 THEN
    v_score := v_score - 10; v_engagement_risk := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','No second login','category','engagement'));
  END IF;
  IF v_last_login IS NOT NULL AND v_last_login < now() - interval '30 days' THEN
    v_score := v_score - 15; v_engagement_risk := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','Inactive 30+ days','category','engagement'));
  END IF;
  IF v_last_summary IS NOT NULL AND v_last_summary < now() - interval '30 days' THEN
    v_score := v_score - 5; v_engagement_risk := true;
  ELSIF v_last_summary IS NULL AND v_org_age_hours > 24*30 THEN
    v_score := v_score - 5; v_engagement_risk := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','No summary opened','category','engagement'));
  END IF;
  IF v_sub_status = 'past_due' THEN
    v_score := v_score - 25; v_billing_risk := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','Failed payment','category','billing'));
  END IF;
  IF v_last_pay_fail IS NOT NULL AND v_last_pay_fail > now() - interval '3 days' THEN v_billing_risk := true; END IF;
  IF v_last_pay_fail IS NOT NULL AND v_last_pay_fail < now() - interval '3 days' AND v_sub_status = 'past_due' THEN
    v_score := v_score - 10;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','Unresolved payment 3d+','category','billing'));
  END IF;
  IF EXISTS(SELECT 1 FROM public.retention_events WHERE org_id = p_org_id AND event_name = 'cancellation_flow_started' AND occurred_at > now() - interval '30 days') THEN
    v_score := v_score - 30; v_cancel_intent := true;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('label','Cancellation started','category','cancellation'));
  END IF;

  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;
  v_risk_level := CASE WHEN v_score >= 80 THEN 'low' WHEN v_score >= 60 THEN 'medium' WHEN v_score >= 40 THEN 'high' ELSE 'critical' END;
  v_lifecycle := public.compute_account_lifecycle_stage(p_org_id);

  INSERT INTO public.retention_account_health (
    org_id, customer_id, health_score, risk_level, lifecycle_stage,
    last_data_received_at, last_login_at, last_summary_opened_at, last_payment_failed_at,
    churn_risk_reasons, cancellation_intent, billing_risk, engagement_risk, setup_risk, computed_at
  ) VALUES (
    p_org_id, v_subscriber_id, v_score, v_risk_level, v_lifecycle,
    v_last_data, v_last_login, v_last_summary, v_last_pay_fail,
    v_reasons, v_cancel_intent, v_billing_risk, v_engagement_risk, v_setup_risk, now()
  )
  ON CONFLICT (org_id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id, health_score = EXCLUDED.health_score,
    risk_level = EXCLUDED.risk_level, lifecycle_stage = EXCLUDED.lifecycle_stage,
    last_data_received_at = EXCLUDED.last_data_received_at, last_login_at = EXCLUDED.last_login_at,
    last_summary_opened_at = EXCLUDED.last_summary_opened_at, last_payment_failed_at = EXCLUDED.last_payment_failed_at,
    churn_risk_reasons = EXCLUDED.churn_risk_reasons, cancellation_intent = EXCLUDED.cancellation_intent,
    billing_risk = EXCLUDED.billing_risk, engagement_risk = EXCLUDED.engagement_risk,
    setup_risk = EXCLUDED.setup_risk, computed_at = now(), updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.recompute_all_account_health()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org RECORD; v_count integer := 0;
BEGIN
  FOR v_org IN SELECT id FROM public.orgs LOOP
    PERFORM public.recompute_account_health(v_org.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_login_emit_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = NEW.org_id) THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM public.login_events WHERE org_id = NEW.org_id;
  IF v_count = 2 THEN
    PERFORM public.emit_retention_event(NEW.org_id, 'second_login', 'engagement', '{}'::jsonb, NULL, NEW.user_id, NULL, 'login_events_trigger', NEW.logged_in_at, true);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_login_emit_retention AFTER INSERT ON public.login_events FOR EACH ROW EXECUTE FUNCTION public.trg_login_emit_retention();

CREATE OR REPLACE FUNCTION public.trg_lead_emit_first_data()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = NEW.org_id) THEN RETURN NEW; END IF;
  PERFORM public.emit_retention_event(NEW.org_id, 'first_data_received', 'activation', jsonb_build_object('lead_id', NEW.id), NEW.site_id, NULL, NULL, 'leads_trigger', NEW.submitted_at, true);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_lead_emit_first_data AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trg_lead_emit_first_data();

CREATE OR REPLACE FUNCTION public.trg_org_emit_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_retention_event(NEW.id, 'signup_completed', 'lifecycle', '{}'::jsonb, NULL, NULL, NULL, 'orgs_trigger', NEW.created_at, true);
  INSERT INTO public.retention_account_health (org_id, health_score, risk_level, lifecycle_stage)
  VALUES (NEW.id, 100, 'low', 'new') ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_org_emit_signup AFTER INSERT ON public.orgs FOR EACH ROW EXECUTE FUNCTION public.trg_org_emit_signup();

CREATE OR REPLACE FUNCTION public.trg_cf_emit_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.emit_retention_event(NEW.org_id, 'cancellation_flow_started', 'cancellation', jsonb_build_object('reason', NEW.reason, 'detail', NEW.reason_detail), NULL, NEW.user_id, NEW.customer_id, 'cancellation_feedback', NEW.created_at, false);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cf_emit_retention AFTER INSERT ON public.cancellation_feedback FOR EACH ROW EXECUTE FUNCTION public.trg_cf_emit_retention();

CREATE OR REPLACE FUNCTION public.trg_bre_emit_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.emit_retention_event(NEW.org_id,
    CASE NEW.event_type WHEN 'invoice_payment_failed' THEN 'billing_failed' WHEN 'payment_recovered' THEN 'payment_recovered' WHEN 'card_updated' THEN 'card_updated' ELSE NEW.event_type END,
    'billing', NEW.details, NULL, NULL, NEW.customer_id, 'billing_recovery_trigger', NEW.occurred_at, false);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_bre_emit_retention AFTER INSERT ON public.billing_recovery_events FOR EACH ROW EXECUTE FUNCTION public.trg_bre_emit_retention();

-- ============================================================================
-- BACKFILL (orphan-safe — only orgs that exist)
-- ============================================================================
INSERT INTO public.retention_events (org_id, event_name, event_category, source, occurred_at)
SELECT id, 'signup_completed', 'lifecycle', 'backfill', created_at FROM public.orgs;

INSERT INTO public.retention_events (org_id, site_id, event_name, event_category, source, occurred_at)
SELECT DISTINCT ON (l.org_id) l.org_id, l.site_id, 'first_data_received', 'activation', 'backfill', l.submitted_at
FROM public.leads l
JOIN public.orgs o ON o.id = l.org_id
ORDER BY l.org_id, l.submitted_at ASC;

INSERT INTO public.retention_events (org_id, user_id, event_name, event_category, source, occurred_at)
SELECT le.org_id, le.user_id, 'second_login', 'engagement', 'backfill', le.logged_in_at
FROM (
  SELECT le2.org_id, le2.user_id, le2.logged_in_at,
         ROW_NUMBER() OVER (PARTITION BY le2.org_id ORDER BY le2.logged_in_at) AS rn
  FROM public.login_events le2
  JOIN public.orgs o ON o.id = le2.org_id
  WHERE le2.org_id IS NOT NULL
) le
WHERE le.rn = 2;

INSERT INTO public.billing_recovery_events (org_id, customer_id, stripe_customer_id, event_type, status, occurred_at)
SELECT ou.org_id, s.id, s.stripe_customer_id, 'invoice_payment_failed', 'past_due', now()
FROM public.subscribers s
JOIN public.profiles p ON LOWER(p.email) = LOWER(s.email)
JOIN public.org_users ou ON ou.user_id = p.user_id
JOIN public.orgs o ON o.id = ou.org_id
WHERE s.status = 'past_due';

INSERT INTO public.retention_events (org_id, customer_id, event_name, event_category, source, occurred_at)
SELECT ou.org_id, s.id, 'subscription_canceled', 'lifecycle', 'backfill', COALESCE(s.churn_date, now())
FROM public.subscribers s
JOIN public.profiles p ON LOWER(p.email) = LOWER(s.email)
JOIN public.org_users ou ON ou.user_id = p.user_id
JOIN public.orgs o ON o.id = ou.org_id
WHERE s.status = 'churned';

INSERT INTO public.retention_account_health (org_id, health_score, risk_level, lifecycle_stage)
SELECT id, 100, 'low', 'new' FROM public.orgs
ON CONFLICT (org_id) DO NOTHING;

SELECT public.recompute_all_account_health();

-- ============================================================================
-- SEED FLOWS
-- ============================================================================
INSERT INTO public.retention_flows (slug, name, trigger_type, trigger_event, absence_event, absence_window_hours, description, goal, audience_type) VALUES
  ('welcome',                'Welcome Flow',             'event',   'signup_completed',          NULL,                  NULL, 'Greet new signups and guide setup',                'Get setup completed',            'all'),
  ('connection-success',     'Connection Success Flow',  'event',   'first_data_received',       NULL,                  NULL, 'Celebrate first data and recommend next steps',    'Reinforce success',              'all'),
  ('no-data-rescue',         'No Data Rescue Flow',      'absence', NULL,                        'first_data_received', 48,   'Recover setup failures when no data after 48h',    'Recover setup failures',         'all'),
  ('no-second-login',        'No Second Login Flow',     'absence', NULL,                        'second_login',        168,  'Re-engage signups who never came back',            'Bring user back',                'all'),
  ('first-insight',          'First Insight Flow',       'event',   'first_report_generated',    NULL,                  NULL, 'Highlight first useful insight',                   'Create excitement',              'all'),
  ('weekly-summary',         'Weekly Summary Flow',      'schedule',NULL,                        NULL,                  NULL, 'Recurring weekly performance summary',             'Habit formation',                'all'),
  ('failed-payment-recovery','Failed Payment Recovery',  'event',   'billing_failed',            NULL,                  NULL, 'Recover involuntary churn after failed billing',   'Recover involuntary churn',      'all'),
  ('cancellation-save',      'Cancellation Save Flow',   'event',   'cancellation_flow_started', NULL,                  NULL, 'Reduce cancellations with tailored save offers',   'Reduce cancellations',           'all')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-welcome', 'Welcome to ACTV TRKR — let''s get you set up', 'Welcome aboard. Here''s how to install the plugin and start tracking in under 5 minutes.', 'welcome-step-1'
FROM public.retention_flows f WHERE f.slug = 'welcome';

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-connection-success', 'You''re live — first data received', 'Great news — we just received your first data. Here''s what to look at next.', 'connection-success-step-1'
FROM public.retention_flows f WHERE f.slug = 'connection-success';

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-no-data-rescue', 'Need a hand getting set up?', 'We noticed your dashboard hasn''t received data yet. Here''s a quick checklist to get you live.', 'no-data-rescue-step-1'
FROM public.retention_flows f WHERE f.slug = 'no-data-rescue';

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-no-second-login', 'Your dashboard is waiting', 'Your insights are ready — here''s a quick look at what we''ve been tracking.', 'no-second-login-step-1'
FROM public.retention_flows f WHERE f.slug = 'no-second-login';

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-first-insight', 'Your first insight is in', 'Take a look — here''s the first useful pattern we''ve spotted in your data.', 'first-insight-step-1'
FROM public.retention_flows f WHERE f.slug = 'first-insight';

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-failed-payment', 'Action needed — payment failed', 'We weren''t able to process your last payment. Update your card to keep everything running.', 'failed-payment-step-1'
FROM public.retention_flows f WHERE f.slug = 'failed-payment-recovery';

INSERT INTO public.retention_flow_steps (flow_id, step_order, delay_minutes, channel, template_name, subject, body, internal_name)
SELECT f.id, 1, 0, 'email', 'retention-cancellation-save', 'Before you go — can we help?', 'We''d hate to lose you. Here are a few options that might fit better.', 'cancellation-save-step-1'
FROM public.retention_flows f WHERE f.slug = 'cancellation-save';