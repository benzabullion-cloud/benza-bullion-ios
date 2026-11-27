alter table public.community_alert_preferences add column likes timestamptz, add column follows timestamptz;

create or replace function public.benza_pending_community_activity_push()
returns table(user_id uuid,kind text,event_key text,post_id uuid,comment_id uuid)
language sql stable security definer set search_path='' as $$
 with collector as (
 select i.recipient,i.kind,
 case when i.kind='comment' then concat(i.post_id,':',floor(extract(epoch from i.occurred_at)/600))
 else i.comment_id::text end as key,i.post_id,i.comment_id,i.occurred_at
 from public.community_interactions i join public.community_alert_preferences pref on pref.user_id=i.recipient
 where i.occurred_at>=now()-interval '1 day' and i.occurred_at>=case i.kind when 'reply' then pref.reply when 'mention' then pref.mention else pref.comment end
 and not exists(select 1 from public.community_blocks b where
 (b.blocker_id=i.recipient and b.blocked_id in (i.actor,i.publisher)) or
 (b.blocked_id=i.recipient and b.blocker_id in (i.actor,i.publisher)))
 ), reports as (
 select post_id,null::uuid as comment_id,min(created_at) as first_at from public.community_reports where resolved_at is null group by post_id
 union all select c.post_id,c.id,min(f.created_at) from public.community_comment_flags f join public.community_comments c on c.id=f.comment_id
 where f.resolved_at is null and c.author_id is not null group by c.post_id,c.id
 ), candidates as (
 select * from collector union all
 select social.recipient,social.kind,social.key,social.post_id,null::uuid,social.created_at
 from (
   select f.followed_id as recipient,f.follower_id as actor,'follow' as kind,f.follower_id::text as key,
     null::uuid as post_id,f.created_at from public.community_follows f
   union all
   select p.author_id,l.user_id,'like',concat(l.post_id,':',l.user_id),l.post_id,l.created_at
   from public.community_likes l join public.community_posts p on p.id=l.post_id where p.status='approved'
 ) social join public.community_alert_preferences pref on pref.user_id=social.recipient
 where social.actor<>social.recipient and social.created_at>=now()-interval '1 day'
   and social.created_at>=case social.kind when 'follow' then pref.follows else pref.likes end
   and not exists(select 1 from public.community_blocks b where
      (b.blocker_id=social.actor and b.blocked_id=social.recipient) or
      (b.blocker_id=social.recipient and b.blocked_id=social.actor))
 union all
 select m.user_id,'report',concat(coalesce(r.comment_id,r.post_id),':',extract(epoch from r.first_at)),r.post_id,r.comment_id,r.first_at
 from reports r join public.community_posts p on p.id=r.post_id cross join public.community_moderators m
 where p.status='approved' and r.first_at>=m.review_alerts_since
 )
 select distinct on (recipient,c.kind,key) recipient,c.kind,key,c.post_id,c.comment_id from candidates c
 where exists(select 1 from public.notification_subscriptions s where s.user_id=c.recipient and s.enabled)
 and not exists(select 1 from public.notification_events e where e.user_id=c.recipient and e.event_type='community_'||c.kind and e.event_key=key)
 order by recipient,c.kind,key,occurred_at desc limit 200
$$;
