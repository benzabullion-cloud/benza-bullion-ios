create unique index community_profiles_display_name_unique
  on public.community_profiles (lower(btrim(regexp_replace(display_name, '[[:space:]]+', ' ', 'g'))));
