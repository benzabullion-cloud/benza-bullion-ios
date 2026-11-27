create table public.community_mentions (
  comment_id uuid references public.community_comments on delete cascade,
  collector_id uuid references public.community_profiles on delete cascade,
  label text not null,
  id bigint generated always as identity primary key,
  unique(comment_id, collector_id)
);
create index community_mentions_recipient on public.community_mentions(collector_id);
alter table public.community_mentions enable row level security;
revoke all on public.community_mentions from public, anon, authenticated;
grant select on public.community_mentions to anon, authenticated;
create policy read_mentions on public.community_mentions for select using (
  not benza_community_private.is_blocked(collector_id) and exists (
    select 1 from public.community_comments c where c.id=comment_id and c.author_id is not null
      and not benza_community_private.is_blocked(c.author_id))
);

create function public.community_mention_candidates(prefix text)
returns table(id uuid, display_name text) language sql stable security invoker set search_path='' as $$
  select p.id,p.display_name from public.community_profiles p
  where p.id<>auth.uid() and not benza_community_private.is_blocked(p.id)
    and starts_with(lower(p.display_name),lower(prefix))
  order by p.display_name limit 5
$$;

-- Keep the comment insert under the caller's ordinary publication and reply policies.
create function public.community_post_with_mentions(post uuid,parent uuid,message text,targets uuid[])
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform set_config('benza.mention_targets',to_json(targets)::text,true);
  insert into public.community_comments(post_id,parent_comment_id,author_id,body)
    values(post,parent,auth.uid(),message);
  perform set_config('benza.mention_targets','[]',true);
end;
$$;
create function benza_community_private.save_comment_mentions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.community_mentions(comment_id,collector_id,label)
    select new.id,p.id,p.display_name from public.community_profiles p
    where p.id in (select value::uuid from jsonb_array_elements_text(
      coalesce(nullif(current_setting('benza.mention_targets',true),''),'[]')::jsonb))
      and p.id<>new.author_id and not benza_community_private.is_blocked(p.id)
      and strpos(new.body,'@'||p.display_name)>0;
  return new;
end;
$$;
create trigger community_save_mentions after insert on public.community_comments
for each row execute function benza_community_private.save_comment_mentions();
revoke all on function public.community_mention_candidates(text),public.community_post_with_mentions(uuid,uuid,text,uuid[]) from public,anon;
grant execute on function public.community_mention_candidates(text),public.community_post_with_mentions(uuid,uuid,text,uuid[]) to authenticated;

create or replace function public.community_personal_activity()
returns table (actor uuid, kind text, caption text, occurred_at timestamptz, post_id uuid)
language sql stable security invoker set search_path = '' as $$
  select follower_id, 'follow'::text, null::text, created_at, null::uuid
  from public.community_follows where followed_id = auth.uid() and created_at is not null
  union all
  select l.user_id, 'like', left(p.caption, 80), l.created_at, p.id
  from public.community_likes l join public.community_posts p on p.id = l.post_id
  where p.author_id = auth.uid() and p.status = 'approved'
    and l.user_id <> auth.uid() and l.created_at is not null
  union all
  select c.author_id,'mention',left(c.body,80),c.created_at,c.post_id
  from public.community_mentions m join public.community_comments c on c.id=m.comment_id
  join public.community_posts p on p.id=c.post_id
  where m.collector_id=auth.uid() and c.author_id is not null and p.status='approved'
    and not benza_community_private.is_blocked(p.author_id)
$$;
