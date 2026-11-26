grant delete on public.community_blocks to authenticated;
create policy community_delete_own_block on public.community_blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- Blocked profiles are hidden by RLS. Return only display names for the caller's own blocks.
create function public.benza_community_blocked_collectors()
returns table (blocked_id uuid, display_name text)
language sql stable security definer set search_path = ''
as $$
  select b.blocked_id, coalesce(p.display_name, 'Collector')
  from public.community_blocks b
  left join public.community_profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by p.display_name, b.blocked_id
$$;

revoke all on function public.benza_community_blocked_collectors() from public, anon, authenticated;
grant execute on function public.benza_community_blocked_collectors() to authenticated;

-- Preserve resolved flags and allow a fresh report after a moderator dismisses one.
-- Keep both foreign-key columns non-null after replacing the original primary key.
alter table public.community_comment_flags
  alter column comment_id set not null,
  alter column reporter_id set not null,
  add column id uuid not null default gen_random_uuid(),
  drop constraint community_comment_flags_pkey,
  add primary key (id);

create unique index community_comment_flags_one_pending
  on public.community_comment_flags (comment_id, reporter_id) where resolved_at is null;
