-- Benza Bullion — real portfolio history
-- Run once in Supabase SQL Editor before deploying the matching app ZIP.

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_start timestamptz not null,
  captured_at timestamptz not null default now(),

  total_value numeric(16,2) not null default 0,
  total_cost numeric(16,2) not null default 0,

  gold_value numeric(16,2) not null default 0,
  silver_value numeric(16,2) not null default 0,
  platinum_value numeric(16,2) not null default 0,
  palladium_value numeric(16,2) not null default 0,
  copper_value numeric(16,2) not null default 0,

  gold_price numeric(16,6) not null default 0,
  silver_price numeric(16,6) not null default 0,
  platinum_price numeric(16,6) not null default 0,
  palladium_price numeric(16,6) not null default 0,
  copper_price numeric(16,6) not null default 0,

  created_at timestamptz not null default now(),

  constraint portfolio_snapshots_user_bucket_unique
    unique (user_id, bucket_start)
);

create index if not exists portfolio_snapshots_user_time_idx
on public.portfolio_snapshots (user_id, captured_at desc);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "Users can view own portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can insert own portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can update own portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can delete own portfolio snapshots" on public.portfolio_snapshots;

create policy "Users can view own portfolio snapshots"
on public.portfolio_snapshots
for select
using (auth.uid() = user_id);

create policy "Users can insert own portfolio snapshots"
on public.portfolio_snapshots
for insert
with check (auth.uid() = user_id);

create policy "Users can update own portfolio snapshots"
on public.portfolio_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own portfolio snapshots"
on public.portfolio_snapshots
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete
on table public.portfolio_snapshots
to authenticated;
