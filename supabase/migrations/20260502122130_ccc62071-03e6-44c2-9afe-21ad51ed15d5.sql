-- One-shot backfill: strip self-referrals from existing analytics rows.
-- Idempotent — running twice is a no-op.

-- 1. sessions.landing_referrer_domain
WITH owned AS (
  SELECT
    id AS site_id,
    org_id,
    lower(regexp_replace(domain, '^www\.', '')) AS root
  FROM public.sites
  WHERE domain IS NOT NULL AND domain <> ''
)
UPDATE public.sessions s
SET landing_referrer_domain = NULL
FROM owned o
WHERE s.org_id = o.org_id
  AND s.landing_referrer_domain IS NOT NULL
  AND (
    lower(regexp_replace(s.landing_referrer_domain, '^www\.', '')) = o.root
    OR lower(s.landing_referrer_domain) LIKE '%.' || o.root
  );

-- 2. pageviews.referrer_domain
WITH owned AS (
  SELECT
    org_id,
    lower(regexp_replace(domain, '^www\.', '')) AS root
  FROM public.sites
  WHERE domain IS NOT NULL AND domain <> ''
)
UPDATE public.pageviews p
SET referrer_domain = NULL
FROM owned o
WHERE p.org_id = o.org_id
  AND p.referrer_domain IS NOT NULL
  AND (
    lower(regexp_replace(p.referrer_domain, '^www\.', '')) = o.root
    OR lower(p.referrer_domain) LIKE '%.' || o.root
  );

-- 3. traffic_daily — collapse self-referral source aggregates into 'direct'.
-- We move the value into the existing 'direct' row (or create one) and
-- delete the offending row, so the dashboard immediately reads clean data.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT td.id, td.org_id, td.date, td.metric, td.dimension, td.value
    FROM public.traffic_daily td
    JOIN public.sites s ON s.org_id = td.org_id
    WHERE td.metric = 'sessions_by_source'
      AND td.dimension IS NOT NULL
      AND s.domain IS NOT NULL
      AND (
        lower(regexp_replace(td.dimension, '^www\.', '')) = lower(regexp_replace(s.domain, '^www\.', ''))
        OR lower(td.dimension) LIKE '%.' || lower(regexp_replace(s.domain, '^www\.', ''))
      )
  LOOP
    -- Try to merge into the existing 'direct' row for this org/date
    UPDATE public.traffic_daily
    SET value = value + rec.value
    WHERE org_id = rec.org_id AND date = rec.date AND metric = 'sessions_by_source' AND dimension = 'direct';

    IF NOT FOUND THEN
      -- No 'direct' row yet — convert this one in place
      UPDATE public.traffic_daily
      SET dimension = 'direct'
      WHERE id = rec.id;
    ELSE
      -- Successfully merged — drop the duplicate
      DELETE FROM public.traffic_daily WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;