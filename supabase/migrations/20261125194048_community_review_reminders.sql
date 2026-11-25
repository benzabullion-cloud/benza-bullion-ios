create or replace function public.benza_pending_community_review_reminders()
returns table (user_id uuid, post_ids uuid[])
language sql stable security invoker set search_path = '' as $$
  select m.user_id, array_agg(p.id order by p.created_at, p.id)
  from public.community_moderators m
  join public.notification_events initial on initial.user_id = m.user_id
    and initial.event_type = 'community_review'
    and initial.created_at <= now() - interval '1 hour'
  join public.community_posts p on p.id::text = initial.event_key
  where p.status = 'pending' and p.author_id <> m.user_id
    and p.created_at >= m.review_alerts_since
    and exists (select 1 from public.notification_subscriptions s where s.user_id = m.user_id and s.enabled)
    and not exists (select 1 from public.notification_events r where r.user_id = m.user_id
      and r.event_type = 'community_review_reminder' and r.event_key = initial.event_key)
  group by m.user_id
  order by min(initial.created_at), m.user_id limit 24;
$$;
revoke all on function public.benza_pending_community_review_reminders() from public, anon, authenticated;
grant execute on function public.benza_pending_community_review_reminders() to service_role;
