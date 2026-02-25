-- Add lead_weight to forms so different forms can contribute differently to lead counts/CVR
ALTER TABLE public.forms
ADD COLUMN lead_weight numeric NOT NULL DEFAULT 1.0;

-- Add a human-readable label for the form category
ALTER TABLE public.forms
ADD COLUMN form_category text NOT NULL DEFAULT 'lead';

COMMENT ON COLUMN public.forms.lead_weight IS 'Weight applied to submissions from this form when calculating lead totals and CVR. 1.0 = full lead, 0.5 = half, 0 = excluded.';
COMMENT ON COLUMN public.forms.form_category IS 'Category label for the form: lead, newsletter, survey, other.';