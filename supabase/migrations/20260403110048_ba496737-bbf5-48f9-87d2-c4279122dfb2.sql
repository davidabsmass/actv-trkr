ALTER TABLE public.orgs ADD COLUMN billing_exempt boolean NOT NULL DEFAULT false;

UPDATE public.orgs SET billing_exempt = true WHERE id IN (
  '8e02f31e-32a8-4843-8595-f2cc7cc216c6',
  '28e03fb0-64d2-4253-9a27-7f78d186a6fb',
  'e719d7e5-eb55-4506-a990-57e0aa4771e0'
);