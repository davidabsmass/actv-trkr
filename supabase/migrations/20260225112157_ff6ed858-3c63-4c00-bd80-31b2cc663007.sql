
-- Add geo columns to pageviews table
ALTER TABLE public.pageviews ADD COLUMN country_code text;
ALTER TABLE public.pageviews ADD COLUMN country_name text;

-- Add index for aggregation queries
CREATE INDEX idx_pageviews_country_code ON public.pageviews (org_id, country_code, occurred_at);
