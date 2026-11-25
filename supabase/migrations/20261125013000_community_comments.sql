create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts on delete cascade,
  author_id uuid not null references public.community_profiles on delete cascade,
  body text not null check (
    char_length(trim(body)) between 1 and 500
    and body !~* '(https?://|www[.]|[[:alnum:]_.+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})'
  ),
  created_at timestamptz not null default now()
);
create index community_comments_post_order on public.community_comments (post_id, created_at desc, id desc);
create index community_comments_author on public.community_comments (author_id);

create table public.community_comment_flags (
  comment_id uuid references public.community_comments on delete cascade,
  reporter_id uuid references auth.users on delete cascade,
  reason text not null check (reason in ('Off topic','Privacy concern','Spam or promotion','Inappropriate content')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (comment_id, reporter_id)
);
create index community_comment_flags_pending on public.community_comment_flags (created_at) where resolved_at is null;

alter table public.community_comments enable row level security;
alter table public.community_comment_flags enable row level security;
revoke all on public.community_comments, public.community_comment_flags from public, anon, authenticated;
grant select on public.community_comments to anon, authenticated;
grant insert (post_id, author_id, body), delete on public.community_comments to authenticated;
grant select, insert (comment_id, reporter_id, reason), update (resolved_at) on public.community_comment_flags to authenticated;

create policy community_read_comments on public.community_comments for select to anon, authenticated using (
  exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'approved'
      and (
        benza_community_private.is_moderator()
        or (not benza_community_private.is_blocked(p.author_id)
            and not benza_community_private.is_blocked(community_comments.author_id))
      )
  )
);
create policy community_write_comments on public.community_comments for insert to authenticated with check (
  author_id = auth.uid() and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'approved' and not benza_community_private.is_blocked(p.author_id)
  )
);
create policy community_delete_comments on public.community_comments for delete to authenticated
using (author_id = auth.uid() or benza_community_private.is_moderator());

create policy community_flag_comment on public.community_comment_flags for insert to authenticated with check (
  reporter_id = auth.uid() and exists (select 1 from public.community_comments c where c.id = comment_id)
);
create policy community_read_comment_flags on public.community_comment_flags for select to authenticated
using (benza_community_private.is_moderator());
create policy community_resolve_comment_flags on public.community_comment_flags for update to authenticated
using (benza_community_private.is_moderator()) with check (benza_community_private.is_moderator());

alter policy community_visible_profiles on public.community_profiles using (
  id = auth.uid() or benza_community_private.is_moderator() or (
    not benza_community_private.is_blocked(id) and (
      exists (select 1 from public.community_posts p where p.author_id = community_profiles.id and p.status = 'approved')
      or exists (select 1 from public.community_comments c where c.author_id = community_profiles.id)
    )
  )
);
