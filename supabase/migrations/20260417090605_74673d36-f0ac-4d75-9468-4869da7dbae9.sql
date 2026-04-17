
-- =========================================================
-- SUPPORT SYSTEM SCHEMA
-- =========================================================

-- Sequence for human-readable ticket numbers
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START WITH 1001 INCREMENT BY 1;

-- =========================================================
-- TABLE: support_tickets
-- =========================================================
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint NOT NULL UNIQUE DEFAULT nextval('public.support_ticket_number_seq'),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NULL REFERENCES public.sites(id) ON DELETE SET NULL,
  submitted_by_user_id uuid NOT NULL,
  submitted_by_name text,
  submitted_by_email text,
  type text NOT NULL CHECK (type IN ('bug','feature','question','billing','setup')),
  category text NULL,
  subject text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','waiting_on_us','waiting_on_customer','planned','in_progress','resolved','closed')),
  queue text NULL,
  assigned_to_user_id uuid NULL,
  plan_name text NULL,
  website_url text NULL,
  current_app_path text NULL,
  browser_info text NULL,
  app_version text NULL,
  is_feature_request boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  closed_at timestamptz NULL
);

CREATE INDEX idx_support_tickets_org ON public.support_tickets(org_id, created_at DESC);
CREATE INDEX idx_support_tickets_user ON public.support_tickets(submitted_by_user_id, created_at DESC);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status, priority);
CREATE INDEX idx_support_tickets_type ON public.support_tickets(type);

-- =========================================================
-- TABLE: support_ticket_messages
-- =========================================================
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid NULL,
  author_name text,
  author_email text,
  author_type text NOT NULL CHECK (author_type IN ('customer','admin','system')),
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_ticket ON public.support_ticket_messages(ticket_id, created_at);

-- =========================================================
-- TABLE: support_ticket_attachments
-- =========================================================
CREATE TABLE public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid NULL REFERENCES public.support_ticket_messages(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_attachments_ticket ON public.support_ticket_attachments(ticket_id);

-- =========================================================
-- TABLE: support_ticket_events (audit / activity)
-- =========================================================
CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_value text NULL,
  new_value text NULL,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_events_ticket ON public.support_ticket_events(ticket_id, created_at DESC);

-- =========================================================
-- TABLE: feature_requests
-- =========================================================
CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid UNIQUE NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NULL REFERENCES public.sites(id) ON DELETE SET NULL,
  title text NOT NULL,
  request_summary text NOT NULL,
  business_reason text NULL,
  product_status text NOT NULL DEFAULT 'under_consideration'
    CHECK (product_status IN ('under_consideration','planned','in_progress','shipped','not_planned')),
  vote_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_requests_status ON public.feature_requests(product_status);

-- =========================================================
-- TABLE: support_ticket_satisfaction
-- =========================================================
CREATE TABLE public.support_ticket_satisfaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid UNIQUE NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  rating text NULL CHECK (rating IN ('helpful','not_helpful')),
  feedback text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- TRIGGERS: updated_at
-- =========================================================
CREATE TRIGGER trg_support_tickets_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_feature_requests_updated
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ENABLE RLS
-- =========================================================
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_satisfaction ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- RLS: support_tickets
-- =========================================================
-- Subscribers see tickets they submitted in their org
CREATE POLICY st_select_own ON public.support_tickets
  FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND submitted_by_user_id = auth.uid());

-- Admins see all
CREATE POLICY st_select_admin ON public.support_tickets
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Subscribers create tickets for their org as themselves
CREATE POLICY st_insert_own ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id) AND submitted_by_user_id = auth.uid());

-- Admins can update any ticket
CREATE POLICY st_update_admin ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- RLS: support_ticket_messages
-- =========================================================
-- Customers can read NON-internal messages on their tickets
CREATE POLICY stm_select_customer ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

-- Admins read all messages including internal
CREATE POLICY stm_select_admin ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Customers can insert non-internal replies on their own tickets
CREATE POLICY stm_insert_customer ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_type = 'customer'
    AND is_internal = false
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

-- Admins can insert any message
CREATE POLICY stm_insert_admin ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- RLS: support_ticket_attachments
-- =========================================================
CREATE POLICY sta_select_customer ON public.support_ticket_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

CREATE POLICY sta_select_admin ON public.support_ticket_attachments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY sta_insert_customer ON public.support_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

CREATE POLICY sta_insert_admin ON public.support_ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- RLS: support_ticket_events (read-only audit)
-- =========================================================
CREATE POLICY ste_select_customer ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

CREATE POLICY ste_select_admin ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ste_insert_admin ON public.support_ticket_events
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- RLS: feature_requests
-- =========================================================
CREATE POLICY fr_select_org ON public.feature_requests
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY fr_select_admin ON public.feature_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY fr_update_admin ON public.feature_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY fr_insert_admin ON public.feature_requests
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- RLS: support_ticket_satisfaction
-- =========================================================
CREATE POLICY sts_select_customer ON public.support_ticket_satisfaction
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

CREATE POLICY sts_select_admin ON public.support_ticket_satisfaction
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY sts_insert_customer ON public.support_ticket_satisfaction
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.submitted_by_user_id = auth.uid()
        AND is_org_member(t.org_id)
    )
  );

-- =========================================================
-- TRIGGER: auto-create feature_request row + activity log
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_support_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-set queue based on type
  IF NEW.queue IS NULL THEN
    NEW.queue := CASE NEW.type
      WHEN 'bug' THEN 'support_product'
      WHEN 'feature' THEN 'product'
      WHEN 'question' THEN 'support'
      WHEN 'billing' THEN 'billing'
      WHEN 'setup' THEN 'onboarding'
      ELSE 'support'
    END;
  END IF;

  IF NEW.type = 'feature' THEN
    NEW.is_feature_request := true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_tickets_before_insert
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_support_ticket_created();

-- After insert: create feature_request row + activity event
CREATE OR REPLACE FUNCTION public.handle_support_ticket_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_feature_request THEN
    INSERT INTO public.feature_requests (ticket_id, org_id, site_id, title, request_summary, business_reason)
    VALUES (NEW.id, NEW.org_id, NEW.site_id, NEW.subject, NEW.message,
            NULLIF(NEW.metadata->>'business_reason', ''))
    ON CONFLICT (ticket_id) DO NOTHING;
  END IF;

  INSERT INTO public.support_ticket_events (ticket_id, event_type, new_value, created_by_user_id)
  VALUES (NEW.id, 'created', NEW.status, NEW.submitted_by_user_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_tickets_after_insert
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_support_ticket_after_insert();

-- After update: log status/priority/assignment changes + auto-stamp resolved/closed
CREATE OR REPLACE FUNCTION public.handle_support_ticket_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_events (ticket_id, event_type, old_value, new_value, created_by_user_id)
    VALUES (NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid());

    IF NEW.status = 'resolved' AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.support_ticket_events (ticket_id, event_type, old_value, new_value, created_by_user_id)
    VALUES (NEW.id, 'priority_changed', OLD.priority, NEW.priority, auth.uid());
  END IF;

  IF NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id THEN
    INSERT INTO public.support_ticket_events (ticket_id, event_type, old_value, new_value, created_by_user_id)
    VALUES (NEW.id, 'assigned',
            COALESCE(OLD.assigned_to_user_id::text, ''),
            COALESCE(NEW.assigned_to_user_id::text, ''),
            auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_tickets_before_update
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_support_ticket_after_update();

-- After message insert: log + bump ticket updated_at + status flip
CREATE OR REPLACE FUNCTION public.handle_support_message_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  evt text;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  evt := CASE NEW.author_type
    WHEN 'customer' THEN 'customer_replied'
    WHEN 'admin' THEN 'admin_replied'
    ELSE 'system_message'
  END;

  INSERT INTO public.support_ticket_events (ticket_id, event_type, created_by_user_id)
  VALUES (NEW.ticket_id, evt, NEW.author_user_id);

  -- Bump updated_at and toggle status if appropriate
  UPDATE public.support_tickets
  SET updated_at = now(),
      status = CASE
        WHEN NEW.author_type = 'customer' AND status IN ('waiting_on_customer','resolved')
          THEN 'waiting_on_us'
        WHEN NEW.author_type = 'admin' AND status IN ('new','in_review')
          THEN 'waiting_on_customer'
        ELSE status
      END
  WHERE id = NEW.ticket_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_messages_after_insert
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_support_message_inserted();
