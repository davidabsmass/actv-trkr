-- Deal Pipeline CRM schema

-- Pipeline stages (configurable, ordered)
CREATE TABLE public.deal_pipeline_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_key TEXT NOT NULL UNIQUE,
  stage_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deals (one per buyer/investor opportunity)
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_name TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_company TEXT,
  buyer_email TEXT,
  buyer_type TEXT NOT NULL DEFAULT 'strategic', -- strategic, financial, pe, vc, individual
  stage_key TEXT NOT NULL DEFAULT 'lead',
  deal_value NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  probability INTEGER NOT NULL DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  actual_close_date DATE,
  source TEXT,
  notes TEXT,
  owner_user_id UUID,
  data_room_link_id UUID REFERENCES public.data_room_links(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open, won, lost
  lost_reason TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_stage ON public.deals(stage_key);
CREATE INDEX idx_deals_status ON public.deals(status);
CREATE INDEX idx_deals_owner ON public.deals(owner_user_id);

-- Deal activities (timeline of meetings, calls, emails, NDAs, LOIs, term sheets)
CREATE TABLE public.deal_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- note, meeting, call, email, nda_sent, nda_signed, loi_received, term_sheet, valuation, stage_change
  title TEXT NOT NULL,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_activities_deal ON public.deal_activities(deal_id, occurred_at DESC);

-- Deal documents (NDAs, LOIs, term sheets, valuations)
CREATE TABLE public.deal_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- nda, loi, term_sheet, valuation, contract, other
  document_name TEXT NOT NULL,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sent, signed, executed, rejected
  effective_date DATE,
  expiration_date DATE,
  notes TEXT,
  uploaded_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_documents_deal ON public.deal_documents(deal_id);

-- Enable RLS
ALTER TABLE public.deal_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_documents ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (deal pipeline is owner/admin sensitive data)
CREATE POLICY "Admins manage stages" ON public.deal_pipeline_stages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage deals" ON public.deals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage deal activities" ON public.deal_activities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage deal documents" ON public.deal_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_documents_updated_at
  BEFORE UPDATE ON public.deal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-log stage changes as activities
CREATE OR REPLACE FUNCTION public.log_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_key IS DISTINCT FROM OLD.stage_key THEN
    INSERT INTO public.deal_activities (deal_id, activity_type, title, body, created_by_user_id)
    VALUES (NEW.id, 'stage_change',
            'Stage changed: ' || OLD.stage_key || ' → ' || NEW.stage_key,
            NULL, auth.uid());
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('won','lost') THEN
    NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER deals_stage_change_trigger
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.log_deal_stage_change();

-- Seed default pipeline stages
INSERT INTO public.deal_pipeline_stages (stage_key, stage_name, sort_order, is_won, is_lost) VALUES
  ('lead', 'Lead', 1, false, false),
  ('qualified', 'Qualified', 2, false, false),
  ('nda_signed', 'NDA Signed', 3, false, false),
  ('diligence', 'Due Diligence', 4, false, false),
  ('loi', 'LOI Received', 5, false, false),
  ('negotiation', 'Negotiation', 6, false, false),
  ('closing', 'Closing', 7, false, false),
  ('won', 'Closed - Won', 8, true, false),
  ('lost', 'Closed - Lost', 9, false, true)
ON CONFLICT (stage_key) DO NOTHING;