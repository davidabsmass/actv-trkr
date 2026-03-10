
-- Fix self-referral sources: set to 'direct' where source = site domain
UPDATE leads l
SET source = 'direct', medium = 'direct'
FROM sites s
WHERE l.site_id = s.id AND l.source = s.domain;

-- Fix referrer_domain self-referrals
UPDATE leads l
SET referrer_domain = NULL
FROM sites s
WHERE l.site_id = s.id AND l.referrer_domain = s.domain;
