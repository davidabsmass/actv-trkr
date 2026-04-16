-- Admin notes: timestamped log of support touches per org or subscriber.
CREATE TABLE public.admin_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  subscriber_email TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email TEXT,
  category TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX admin_notes_org_idx ON public.admin_notes(org_id, created_at DESC);
CREATE INDEX admin_notes_subscriber_idx ON public.admin_notes(subscriber_id, created_at DESC);
CREATE INDEX admin_notes_email_idx ON public.admin_notes(subscriber_email, created_at DESC);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Only app admins (user_roles.admin) can read/write notes
CREATE POLICY "Admins can read admin notes"
  ON public.admin_notes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert admin notes"
  ON public.admin_notes FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete admin notes"
  ON public.admin_notes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on admin notes"
  ON public.admin_notes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Pricing tier convenience column on subscribers (founding vs standard)
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'standard';