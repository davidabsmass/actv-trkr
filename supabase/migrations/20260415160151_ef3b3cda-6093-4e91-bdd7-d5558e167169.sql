
CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_user_id uuid, p_function_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id AND function_name = p_function_name;
$$;
