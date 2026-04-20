-- Org lifecycle status for cancellation/grace/archive system
DO $$ BEGIN
  CREATE TYPE public.org_lifecycle_status AS ENUM ('active', 'grace_period', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS status public.org_lifecycle_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_change_reason text,
  ADD COLUMN IF NOT EXISTS lifecycle_email_day25_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_email_day80_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_email_cancelled_sent_at timestamptz;

-- Backfill: every existing org starts as active (safe rollout)
UPDATE public.orgs SET status = 'active' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_orgs_status ON public.orgs(status) WHERE status <> 'active';
CREATE INDEX IF NOT EXISTS idx_orgs_grace_period_ends_at ON public.orgs(grace_period_ends_at) WHERE grace_period_ends_at IS NOT NULL;

-- Helper to flip status with audit
CREATE OR REPLACE FUNCTION public.set_org_lifecycle_status(
  p_org_id uuid,
  p_status public.org_lifecycle_status,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orgs
  SET
    status = p_status,
    status_changed_at = now(),
    status_change_reason = COALESCE(p_reason, status_change_reason),
    grace_period_ends_at = CASE
      WHEN p_status = 'grace_period' THEN COALESCE(grace_period_ends_at, now() + interval '30 days')
      WHEN p_status = 'active' THEN NULL
      ELSE grace_period_ends_at
    END,
    archived_at = CASE
      WHEN p_status = 'archived' THEN COALESCE(archived_at, now())
      WHEN p_status = 'active' THEN NULL
      ELSE archived_at
    END,
    -- Reset email markers when reactivating
    lifecycle_email_cancelled_sent_at = CASE WHEN p_status = 'active' THEN NULL ELSE lifecycle_email_cancelled_sent_at END,
    lifecycle_email_day25_sent_at = CASE WHEN p_status = 'active' THEN NULL ELSE lifecycle_email_day25_sent_at END,
    lifecycle_email_day80_sent_at = CASE WHEN p_status = 'active' THEN NULL ELSE lifecycle_email_day80_sent_at END
  WHERE id = p_org_id;
END;
$$;