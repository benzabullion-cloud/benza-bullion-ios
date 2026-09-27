-- Benza Bullion: allow five tracked metals in holdings
-- Run this once in Supabase SQL Editor BEFORE adding Platinum, Palladium, or Copper.

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.holdings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%metal%'
  loop
    execute format('alter table public.holdings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.holdings
add constraint holdings_metal_check
check (metal in ('gold','silver','platinum','palladium','copper'));
