-- Existing relationships have no recorded event time.
alter table public.community_follows add column created_at timestamptz;
alter table public.community_likes add column created_at timestamptz;
alter table public.community_follows alter column created_at set default now();
alter table public.community_likes alter column created_at set default now();

create function public.community_personal_activity()
returns table (actor uuid, kind text, caption text, occurred_at timestamptz, post_id uuid)
language sql stable security invoker set search_path = '' as $$
  select follower_id, 'follow'::text, null::text, created_at, null::uuid
  from public.community_follows where followed_id = auth.uid() and created_at is not null
  union all
  select l.user_id, 'like', left(p.caption, 80), l.created_at, p.id
  from public.community_likes l join public.community_posts p on p.id = l.post_id
  where p.author_id = auth.uid() and p.status = 'approved'
    and l.user_id <> auth.uid() and l.created_at is not null
$$;
revoke all on function public.community_personal_activity() from public, anon;
grant execute on function public.community_personal_activity() to authenticated;
