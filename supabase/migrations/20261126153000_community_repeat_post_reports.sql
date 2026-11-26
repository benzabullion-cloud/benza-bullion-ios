-- Keep report history while allowing a fresh report once the previous one is resolved.
alter table public.community_reports
  alter column post_id set not null,
  alter column reporter_id set not null,
  add column id uuid not null default gen_random_uuid(),
  drop constraint community_reports_pkey,
  add primary key (id);

create unique index community_reports_one_pending
  on public.community_reports (post_id, reporter_id) where resolved_at is null;
