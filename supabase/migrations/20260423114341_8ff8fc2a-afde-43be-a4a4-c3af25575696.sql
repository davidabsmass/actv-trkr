-- Remove synthetic "Connection Test" pageviews and any related session/event rows.
DELETE FROM public.events
WHERE session_id LIKE 'test_%'
   OR visitor_id LIKE 'test_%'
   OR session_id = 'test'
   OR visitor_id = 'test'
   OR target_text = 'Connection Test';

DELETE FROM public.sessions
WHERE session_id LIKE 'test_%'
   OR visitor_id LIKE 'test_%'
   OR session_id = 'test'
   OR visitor_id = 'test';

DELETE FROM public.pageviews
WHERE event_id LIKE 'test_%'
   OR session_id LIKE 'test_%'
   OR visitor_id LIKE 'test_%'
   OR session_id = 'test'
   OR visitor_id = 'test'
   OR title = 'Connection Test';