create table public.community_alert_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 reply timestamptz, mention timestamptz, comment timestamptz
);
alter table public.community_alert_preferences enable row level security;
grant select,insert,update on public.community_alert_preferences to authenticated;
create policy own_preferences on public.community_alert_preferences to authenticated
 using (user_id=auth.uid()) with check (user_id=auth.uid());

alter table public.community_posts add column decision_at timestamptz;
create function benza_community_private.record_post_decision() returns trigger language plpgsql set search_path='' as $$
begin
 new.decision_at := now();
 return new;
end;
$$;
create trigger community_post_decision before update of status on public.community_posts for each row
 when (old.status is distinct from new.status and new.status in ('approved','declined'))
 execute function benza_community_private.record_post_decision();

create view public.community_interactions with (security_invoker=true) as
 select distinct on (c.id,t.recipient) c.id as comment_id,c.post_id,c.author_id as actor,p.author_id as publisher,
 t.recipient,t.kind,c.created_at as occurred_at,left(c.body,80) as caption
 from public.community_comments c join public.community_posts p on p.id=c.post_id
 left join public.community_comments parent on parent.id=c.parent_comment_id
 cross join lateral (
 select parent.author_id as recipient,'reply' as kind,1 as priority where c.parent_comment_id is not null
 union all select collector_id,'mention',2 from public.community_mentions where comment_id=c.id
 union all select p.author_id,'comment',3 where c.parent_comment_id is null
 ) t where p.status='approved' and c.author_id<>t.recipient
 order by c.id,t.recipient,t.priority;
grant select on public.community_interactions to authenticated, service_role;
create function public.community_activity_feed()
returns table(actor uuid,kind text,caption text,occurred_at timestamptz,post_id uuid,comment_id uuid)
language sql stable security invoker set search_path='' as $$
 select a.*,null::uuid from public.community_personal_activity() a where a.kind in ('like','follow')
 union all select i.actor,i.kind,i.caption,i.occurred_at,i.post_id,i.comment_id from public.community_interactions i
 where i.recipient=auth.uid() and not benza_community_private.is_blocked(i.actor) and not benza_community_private.is_blocked(i.publisher)
 union all select null::uuid,p.status,concat_ws(' · ',p.caption,p.review_reason),p.decision_at,p.id,null::uuid
 from public.community_posts p where p.author_id=auth.uid() and p.status in ('approved','declined') and p.decision_at is not null
$$;
revoke all on function public.community_activity_feed() from public,anon;
grant execute on function public.community_activity_feed() to authenticated;

create function public.benza_pending_community_activity_push()
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
 select m.user_id,'report',concat(coalesce(r.comment_id,r.post_id),':',extract(epoch from r.first_at)),r.post_id,r.comment_id,r.first_at
 from reports r join public.community_posts p on p.id=r.post_id cross join public.community_moderators m
 where p.status='approved' and r.first_at>=m.review_alerts_since
 )
 select distinct on (recipient,c.kind,key) recipient,c.kind,key,c.post_id,c.comment_id from candidates c
 where exists(select 1 from public.notification_subscriptions s where s.user_id=c.recipient and s.enabled)
 and not exists(select 1 from public.notification_events e where e.user_id=c.recipient and e.event_type='community_'||c.kind and e.event_key=key)
 order by recipient,c.kind,key,occurred_at desc limit 200
$$;
revoke all on function public.benza_pending_community_activity_push() from public,anon,authenticated;
grant execute on function public.benza_pending_community_activity_push() to service_role;
