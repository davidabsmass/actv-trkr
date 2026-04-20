-- Rename the test/internal API key label so it no longer surfaces in the UI
UPDATE public.api_keys
SET label = 'Default'
WHERE label = 'Temp ingest-heartbeat validation';