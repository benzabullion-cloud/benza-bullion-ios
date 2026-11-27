alter table public.community_comments alter column author_id drop not null;
create function public.community_remove_comment(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
  select author_id into owner_id from public.community_comments where id=target for update;
  if auth.uid() is null or owner_id is null or
     (owner_id <> auth.uid() and not benza_community_private.is_moderator()) then
    raise exception 'Comment unavailable';
  end if;
  if exists(select 1 from public.community_comments where parent_comment_id=target) then
    update public.community_comments set author_id=null, body='Comment removed' where id=target;
    delete from public.community_comment_flags where comment_id=target;
  else
    delete from public.community_comments where id=target;
  end if;
end;
$$;
revoke all on function public.community_remove_comment(uuid) from public, anon;
grant execute on function public.community_remove_comment(uuid) to authenticated;

create function benza_community_private.prune_removed_comment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.community_comments where id=old.parent_comment_id for update;
  delete from public.community_comments p where p.id=old.parent_comment_id and p.author_id is null
    and not exists(select 1 from public.community_comments c where c.parent_comment_id=p.id);
  return null;
end;
$$;
create trigger community_prune_empty_placeholder after delete on public.community_comments
for each row when (old.parent_comment_id is not null)
execute function benza_community_private.prune_removed_comment();
