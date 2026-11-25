begin;

create function benza_community_private.check_community_public_text()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  public_text text;
  rejected_constraint text;
begin
  if tg_table_name = 'community_comments' then
    public_text := new.body;
    rejected_constraint := 'community_comment_content_allowed';
  else
    if tg_op = 'UPDATE' then
      if new.display_name = old.display_name and new.bio = old.bio then
        return new;
      end if;
    end if;
    public_text := new.display_name || ' ' || new.bio;
    rejected_constraint := 'community_profile_content_allowed';
  end if;

  -- Screen unambiguous abusive phrases and explicit language before publication.
  if public_text ~* '\m(kill[[:space:][:punct:]]+yourself|go[[:space:][:punct:]]+die|i[[:space:][:punct:]]+will[[:space:][:punct:]]+(kill|rape)[[:space:][:punct:]]+you|fuck(ing|er|ers)?|motherfuck(er|ers|ing)?|cunt(s)?)\M' then
    raise check_violation using message = 'Rejected by ' || rejected_constraint,
      constraint = rejected_constraint;
  end if;
  return new;
end;
$$;

revoke execute on function benza_community_private.check_community_public_text() from public;

create trigger community_comment_public_text
before insert on public.community_comments
for each row execute function benza_community_private.check_community_public_text();

create trigger community_profile_public_text
before insert or update of display_name, bio on public.community_profiles
for each row execute function benza_community_private.check_community_public_text();

commit;
