UPDATE public.subscribers s
SET site_url = si.domain
FROM profiles p
JOIN org_users ou ON ou.user_id = p.user_id
JOIN sites si ON si.org_id = ou.org_id
WHERE p.email = s.email
AND s.site_url IS NULL
AND si.domain IS NOT NULL;