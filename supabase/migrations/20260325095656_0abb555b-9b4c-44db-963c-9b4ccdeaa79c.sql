-- 1. Fix report_templates: restrict to authenticated users only
DROP POLICY IF EXISTS "rt_select" ON public.report_templates;
CREATE POLICY "rt_select" ON public.report_templates
  FOR SELECT TO authenticated
  USING (true);

-- 2. Fix user_input_events: restrict to owner + admin
DROP POLICY IF EXISTS "uie_select" ON public.user_input_events;
CREATE POLICY "uie_select" ON public.user_input_events
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR user_org_role(org_id) = 'admin'
  );

-- 3. Fix function search paths for email queue functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$ SELECT pgmq.send(queue_name, payload); $$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
  RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$ SELECT msg_id, read_ct, message FROM pgmq.read(queue_name, vt, batch_size); $$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$ SELECT pgmq.delete(queue_name, message_id); $$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
END;
$$;