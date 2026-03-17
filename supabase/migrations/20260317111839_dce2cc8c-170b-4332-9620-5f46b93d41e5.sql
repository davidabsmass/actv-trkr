
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  function_name text NOT NULL,
  cached boolean NOT NULL DEFAULT false,
  response_cache jsonb,
  metrics_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_org_fn_created ON public.ai_usage_log (org_id, function_name, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_insert" ON public.ai_usage_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "org_select" ON public.ai_usage_log FOR SELECT TO authenticated
  USING (is_org_member(org_id));
