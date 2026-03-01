
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_plain text;

-- Update RLS: key_plain should only be readable by org members
-- The existing policies already restrict by org membership, so no new policy needed.
-- But let's ensure the column is included in existing access patterns.
