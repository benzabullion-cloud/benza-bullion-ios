alter table public.community_profiles
  add column avatar_style text not null default 'initials'
    check (avatar_style in ('initials','gold','silver','platinum','palladium','copper')),
  add column avatar_initials text not null default ''
    check (avatar_initials ~ '^[[:alnum:]]{0,3}$');
grant insert (avatar_style, avatar_initials), update (avatar_style, avatar_initials)
  on public.community_profiles to authenticated;

alter table public.community_moderators add column review_alerts_since timestamptz;
grant update (review_alerts_since) on public.community_moderators to authenticated;
create policy community_moderator_own_alert_preference on public.community_moderators
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create function public.benza_pending_community_review_alerts()
returns table (user_id uuid, post_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.id
  from public.community_moderators m
  cross join lateral (
    select post.id, post.created_at
    from public.community_posts post
    where post.status = 'pending' and post.created_at >= greatest(m.review_alerts_since, now() - interval '1 day')
      and post.author_id <> m.user_id
      and (post.item_type = 'Discussion' or exists (
        select 1 from storage.objects o where o.bucket_id = 'bullion-community' and o.name = post.photo_path
      ))
      and not exists (
        select 1 from public.notification_events n
        where n.user_id = m.user_id and n.event_type = 'community_review' and n.event_key = post.id::text
      )
    order by post.created_at, post.id limit 3
  ) p
  where m.review_alerts_since is not null and exists (
    select 1 from public.notification_subscriptions s where s.user_id = m.user_id and s.enabled
  )
  order by p.created_at, p.id limit 24;
$$;
revoke all on function public.benza_pending_community_review_alerts() from public, anon, authenticated;
grant execute on function public.benza_pending_community_review_alerts() to service_role;
