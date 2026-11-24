begin;

create schema if not exists benza_community_private;
revoke all on schema benza_community_private from public;
grant usage on schema benza_community_private to anon, authenticated;

create table public.community_profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 32)
);
create table public.community_moderators (
  user_id uuid primary key references auth.users on delete cascade
);
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_profiles on delete cascade,
  metal text not null check (metal in ('gold','silver','platinum','palladium','copper')),
  item_type text not null check (item_type in ('Coin','Round','Bar','Display')),
  caption text not null check (char_length(trim(caption)) between 3 and 280 and caption !~* '(https?://|www[.]|[[:alnum:]_.+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})'),
  photo_path text generated always as (author_id::text || '/' || id::text || '.jpg') stored,
  public_photo_path text generated always as ('published/' || author_id::text || '/' || id::text || '.jpg') stored,
  status text not null default 'pending' check (status in ('pending','approved','declined','removed')),
  created_at timestamptz not null default now(),
  review_reason text check (review_reason in ('Off topic','Privacy concern','Spam or promotion','Inappropriate content','Photo quality')),
  published_at timestamptz
);
create index community_posts_feed on public.community_posts (published_at desc, id desc) where status='approved';
create index community_posts_author on public.community_posts (author_id, created_at desc);
create table public.community_likes (
  post_id uuid references public.community_posts on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key (post_id,user_id)
);
create table public.community_follows (
  follower_id uuid references auth.users on delete cascade,
  followed_id uuid references public.community_profiles on delete cascade,
  primary key (follower_id,followed_id),
  check (follower_id<>followed_id)
);
create index community_follows_followed on public.community_follows (followed_id);
create table public.community_blocks (
  blocker_id uuid references auth.users on delete cascade,
  blocked_id uuid references public.community_profiles on delete cascade,
  primary key (blocker_id,blocked_id),
  check (blocker_id<>blocked_id)
);
create table public.community_reports (
  post_id uuid references public.community_posts on delete cascade,
  reporter_id uuid references auth.users on delete cascade,
  reason text not null check (reason in ('Off topic','Privacy concern','Spam or promotion','Inappropriate content')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (post_id,reporter_id)
);

create function benza_community_private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_moderators where user_id=auth.uid());
$$;
create function benza_community_private.is_blocked(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_blocks
    where (blocker_id=auth.uid() and blocked_id=other) or (blocked_id=auth.uid() and blocker_id=other));
$$;
revoke all on all functions in schema benza_community_private from public;
grant execute on function benza_community_private.is_blocked(uuid), benza_community_private.is_moderator() to anon,authenticated;

alter table public.community_profiles enable row level security;
alter table public.community_moderators enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_reports enable row level security;
revoke all on public.community_profiles,public.community_moderators,public.community_posts,public.community_likes,
  public.community_follows,public.community_blocks,public.community_reports from public,anon,authenticated;
grant select on public.community_profiles,public.community_posts,public.community_likes,public.community_follows to anon,authenticated;
grant insert (id,display_name) on public.community_profiles to authenticated;
grant insert (id,author_id,metal,item_type,caption), update (status,published_at,review_reason), delete on public.community_posts to authenticated;
grant insert,delete on public.community_likes,public.community_follows to authenticated;
grant select,insert on public.community_blocks to authenticated;
grant select on public.community_moderators to authenticated;
grant select,insert (post_id,reporter_id,reason),update (resolved_at) on public.community_reports to authenticated;

create policy community_visible_profiles on public.community_profiles for select to anon,authenticated using (
  id=auth.uid() or benza_community_private.is_moderator() or (
    not benza_community_private.is_blocked(id) and
    exists(select 1 from public.community_posts p where p.author_id=community_profiles.id and p.status='approved')
  )
);
create policy community_own_profile on public.community_profiles for insert to authenticated with check (id=auth.uid());
create policy community_own_moderator_membership on public.community_moderators for select to authenticated using (user_id=auth.uid());
create policy community_visible_posts on public.community_posts for select to anon,authenticated using (
  (status='approved' and not benza_community_private.is_blocked(author_id)) or author_id=auth.uid() or benza_community_private.is_moderator()
);
create policy community_pending_posts on public.community_posts for insert to authenticated with check (author_id=auth.uid() and status='pending' and published_at is null);
create policy community_mod_review on public.community_posts for update to authenticated
using (benza_community_private.is_moderator())
with check (
  benza_community_private.is_moderator() and
  (status<>'approved' or (published_at is not null and exists(select 1 from storage.objects where bucket_id='bullion-community' and name=public_photo_path)))
);
create policy community_own_post_deletion on public.community_posts for delete to authenticated using (author_id=auth.uid());

create policy community_visible_likes on public.community_likes for select to anon,authenticated using (
  not benza_community_private.is_blocked(user_id) and exists(select 1 from public.community_posts p where p.id=post_id and p.status='approved')
);
create policy community_own_like on public.community_likes for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.community_posts p where p.id=post_id and p.status='approved' and not benza_community_private.is_blocked(p.author_id))
);
create policy community_own_unlike on public.community_likes for delete to authenticated using (user_id=auth.uid());
create policy community_visible_follows on public.community_follows for select to anon,authenticated using (
  not benza_community_private.is_blocked(follower_id) and not benza_community_private.is_blocked(followed_id)
);
create policy community_own_follow on public.community_follows for insert to authenticated with check (
  follower_id=auth.uid() and not benza_community_private.is_blocked(followed_id)
);
create policy community_own_unfollow on public.community_follows for delete to authenticated using (follower_id=auth.uid());
create policy community_own_blocks on public.community_blocks for select to authenticated using (blocker_id=auth.uid());
create policy community_own_block on public.community_blocks for insert to authenticated with check (blocker_id=auth.uid());

create function benza_community_private.remove_blocked_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.community_follows
    where (follower_id=new.blocker_id and followed_id=new.blocked_id)
       or (follower_id=new.blocked_id and followed_id=new.blocker_id);
  return new;
end;
$$;
revoke all on function benza_community_private.remove_blocked_follows() from public,anon,authenticated;
create trigger community_block_removes_follows after insert on public.community_blocks
for each row execute function benza_community_private.remove_blocked_follows();

create policy community_own_report on public.community_reports for insert to authenticated with check (
  reporter_id=auth.uid() and exists(select 1 from public.community_posts p where p.id=post_id and p.status='approved' and not benza_community_private.is_blocked(p.author_id))
);
create policy community_review_reports on public.community_reports for select to authenticated using (benza_community_private.is_moderator());
create policy community_resolve_reports on public.community_reports for update to authenticated
using (benza_community_private.is_moderator()) with check (benza_community_private.is_moderator());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('bullion-community','bullion-community',false,5242880,array['image/jpeg']);
create policy community_photo_read on storage.objects for select to anon,authenticated using (
  bucket_id='bullion-community' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or ((storage.foldername(name))[1]='published' and (storage.foldername(name))[2]=auth.uid()::text)
    or benza_community_private.is_moderator()
    or exists(select 1 from public.community_posts p where p.public_photo_path=name and p.status='approved' and not benza_community_private.is_blocked(p.author_id))
  )
);
create policy community_photo_upload on storage.objects for insert to authenticated with check (
  bucket_id='bullion-community' and exists(select 1 from public.community_posts p where p.photo_path=name and p.author_id=auth.uid() and p.status='pending')
);
create policy community_published_photo_upload on storage.objects for insert to authenticated with check (
  bucket_id='bullion-community' and benza_community_private.is_moderator()
  and exists(select 1 from public.community_posts p where p.public_photo_path=name and p.status='pending')
);
create policy community_photo_cleanup on storage.objects for delete to authenticated using (
  bucket_id='bullion-community' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or ((storage.foldername(name))[1]='published' and (storage.foldername(name))[2]=auth.uid()::text)
  )
);
commit;
