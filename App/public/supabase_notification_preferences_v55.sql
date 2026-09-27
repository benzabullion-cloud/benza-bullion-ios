-- Benza Bullion v55 — notification preferences + background notification state
-- Run once in Supabase SQL Editor before deploying v55.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  price_targets boolean not null default true,
  daily_summary boolean not null default false,
  big_market_moves boolean not null default true,
  portfolio_milestones boolean not null default true,
  daily_summary_hour smallint not null default 8 check (daily_summary_hour between 0 and 23),
  big_move_percent numeric(6,2) not null default 3.00 check (big_move_percent > 0),
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences"
on public.notification_preferences
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_preferences to service_role;

-- Records successful sends so daily summaries, milestones, and market-move alerts do not repeat.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, event_key)
);

alter table public.notification_events enable row level security;
revoke all on public.notification_events from anon, authenticated;
grant select, insert, delete on public.notification_events to service_role;

-- One shared daily baseline per metal for "Big Market Moves".
create table if not exists public.market_notification_baselines (
  market_date date not null,
  metal text not null check (metal in ('gold','silver','platinum','palladium','copper')),
  baseline_price numeric(18,6) not null,
  captured_at timestamptz not null default now(),
  primary key (market_date, metal)
);

alter table public.market_notification_baselines enable row level security;
revoke all on public.market_notification_baselines from anon, authenticated;
grant select, insert, update on public.market_notification_baselines to service_role;

-- Daily portfolio values used by the morning summary to calculate change from the prior day.
create table if not exists public.portfolio_notification_baselines (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  total_value numeric(18,2) not null default 0,
  captured_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

alter table public.portfolio_notification_baselines enable row level security;
revoke all on public.portfolio_notification_baselines from anon, authenticated;
grant select, insert, update on public.portfolio_notification_baselines to service_role;

-- Make sure the background Edge Function can read the user's holdings.
grant select on public.holdings to service_role;
