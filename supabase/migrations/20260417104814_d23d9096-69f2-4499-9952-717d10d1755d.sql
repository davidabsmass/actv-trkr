SELECT cron.schedule(
  'detect-acquisition-anomalies-hourly',
  '0 * * * *',
  $$SELECT public.call_edge_function('detect-acquisition-anomalies', '{}'::jsonb);$$
);