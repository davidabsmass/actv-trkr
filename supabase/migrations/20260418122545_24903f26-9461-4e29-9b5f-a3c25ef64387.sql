create table if not exists public.app_bible_reviews (
  id uuid primary key default gen_random_uuid(),
  app_version text not null,
  section_key text not null,
  reviewed_by uuid not null references auth.users(id) on delete cascade,
  reviewer_email text,
  notes text,
  reviewed_at timestamptz not null default now(),
  unique (app_version, section_key, reviewed_by)
);

alter table public.app_bible_reviews enable row level security;

create policy "Admins can view app bible reviews"
on public.app_bible_reviews
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert their own reviews"
on public.app_bible_reviews
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  and reviewed_by = auth.uid()
);

create policy "Admins can delete their own reviews"
on public.app_bible_reviews
for delete
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  and reviewed_by = auth.uid()
);

create index if not exists idx_app_bible_reviews_version on public.app_bible_reviews (app_version);