
-- Trigger to auto-create default notification preferences for new org members
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_notification_preferences (user_id, channel, is_enabled)
  VALUES
    (NEW.user_id, 'in_app', true),
    (NEW.user_id, 'email', true)
  ON CONFLICT (user_id, channel) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_org_users_default_notif_prefs
  AFTER INSERT ON public.org_users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_notification_prefs();
