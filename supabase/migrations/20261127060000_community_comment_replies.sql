alter table public.community_comments
  add column parent_comment_id uuid references public.community_comments(id) on delete set null;
create index community_comments_parent on public.community_comments(parent_comment_id)
  where parent_comment_id is not null;
grant insert (parent_comment_id) on public.community_comments to authenticated;

create function benza_community_private.check_comment_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.community_comments parent
    where parent.id = new.parent_comment_id and parent.post_id = new.post_id
      and not benza_community_private.is_blocked(parent.author_id)
  ) then
    raise exception 'Reply target unavailable' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger community_validate_comment_parent before insert on public.community_comments
for each row when (new.parent_comment_id is not null)
execute function benza_community_private.check_comment_parent();
