-- Make client-logos bucket public so PDF reports can render the logo via <img src>
update storage.buckets set public = true where id = 'client-logos';

-- Public read policy for client-logos (logos are non-sensitive brand assets)
drop policy if exists "Public read on client-logos" on storage.objects;
create policy "Public read on client-logos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'client-logos');

-- Dedupe report_custom_templates: keep newest row per (user_id, org_id)
delete from public.report_custom_templates a
using public.report_custom_templates b
where a.user_id = b.user_id
  and a.org_id = b.org_id
  and a.created_at < b.created_at;

-- Add unique constraint so save/load always touch the same row
alter table public.report_custom_templates
  drop constraint if exists report_custom_templates_user_org_unique;
alter table public.report_custom_templates
  add constraint report_custom_templates_user_org_unique unique (user_id, org_id);