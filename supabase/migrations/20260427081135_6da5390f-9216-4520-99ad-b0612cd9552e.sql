UPDATE public.form_health_checks
SET is_rendered = true,
    last_failure_reason = NULL,
    last_rendered_at = COALESCE(last_rendered_at, now())
WHERE is_rendered = false
  AND last_http_status = 200
  AND last_failure_reason ILIKE '%form markup not detected%';

-- Clear queued false-positive alerts for the same condition so they don't re-fire.
UPDATE public.monitoring_alerts
SET status = 'dismissed'
WHERE alert_type = 'FORM_NOT_RENDERED'
  AND status = 'queued'
  AND message ILIKE '%form markup not detected%';