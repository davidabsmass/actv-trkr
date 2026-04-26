-- H-5: drop plain-text PII from orders, add salted hash for de-duplication.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email_hash text;
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_hash ON public.orders (org_id, customer_email_hash) WHERE customer_email_hash IS NOT NULL;

-- Null out any historical raw PII captured by older plugin versions.
UPDATE public.orders
SET customer_email = NULL, customer_name = NULL
WHERE customer_email IS NOT NULL OR customer_name IS NOT NULL;