-- Keep public.forms.is_active in sync with public.form_integrations.is_active.
-- This eliminates drift that occurred when reconciliation ran via one path but
-- the per-form upsert path didn't refresh the forms row.

CREATE OR REPLACE FUNCTION public.sync_form_is_active_from_integration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.forms
       SET is_active = NEW.is_active
     WHERE site_id = NEW.site_id
       AND provider = NEW.builder_type
       AND external_form_id = NEW.external_form_id
       AND is_active IS DISTINCT FROM NEW.is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_is_active ON public.form_integrations;
CREATE TRIGGER trg_sync_form_is_active
AFTER INSERT OR UPDATE OF is_active ON public.form_integrations
FOR EACH ROW
EXECUTE FUNCTION public.sync_form_is_active_from_integration();