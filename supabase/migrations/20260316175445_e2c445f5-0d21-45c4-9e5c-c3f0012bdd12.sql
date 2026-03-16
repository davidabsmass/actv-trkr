ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
ADD CONSTRAINT leads_status_check
CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'booked'::text, 'junk'::text, 'trashed'::text]));