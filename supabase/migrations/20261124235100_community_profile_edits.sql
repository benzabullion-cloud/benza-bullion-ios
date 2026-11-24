alter table public.community_profiles add column bio text not null default ''
  check (char_length(bio) <= 160);
grant insert (bio), update (display_name, bio) on public.community_profiles to authenticated;
create policy community_edit_own_profile on public.community_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
