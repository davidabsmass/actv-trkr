CREATE TABLE public.data_room_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  recipient_name TEXT,
  recipient_email TEXT,
  recipient_company TEXT,
  watermark_text TEXT,
  allowed_sections TEXT[] NOT NULL DEFAULT ARRAY['executive_summary','revenue_quality','retention','financial_efficiency','customer_concentration','risk_flags']::TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  max_views INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_data_room_links_token_hash ON public.data_room_links(token_hash);
CREATE INDEX idx_data_room_links_expires_at ON public.data_room_links(expires_at);

CREATE TABLE public.data_room_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID REFERENCES public.data_room_links(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  section_key TEXT,
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_room_access_log_link_id ON public.data_room_access_log(link_id);
CREATE INDEX idx_data_room_access_log_occurred_at ON public.data_room_access_log(occurred_at DESC);

ALTER TABLE public.data_room_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_room_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view data room links"
ON public.data_room_links FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins create data room links"
ON public.data_room_links FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update data room links"
ON public.data_room_links FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete data room links"
ON public.data_room_links FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view access log"
ON public.data_room_access_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_data_room_links_updated_at
BEFORE UPDATE ON public.data_room_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();