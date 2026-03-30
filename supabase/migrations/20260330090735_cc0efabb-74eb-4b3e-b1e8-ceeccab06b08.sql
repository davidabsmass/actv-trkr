-- Fix labels for Book In-Office form (Avada) where field_key is numeric and field_label matches the key
-- Based on data analysis: 28=Name, 29=Email, 30=Phone, 31=Company/Doctor, 32=Quantity
UPDATE public.lead_fields_flat
SET field_label = CASE field_key
  WHEN '28' THEN 'Name'
  WHEN '29' THEN 'Email'
  WHEN '30' THEN 'Phone'
  WHEN '31' THEN 'Company'
  WHEN '32' THEN 'Quantity'
  ELSE field_label
END
WHERE lead_id IN (
  SELECT id FROM public.leads WHERE form_id = '5e5b0b68-b3a3-4af0-9084-40c683838d7f' AND status <> 'trashed'
)
AND field_key IN ('28', '29', '30', '31', '32')
AND (field_label IS NULL OR field_label = field_key);