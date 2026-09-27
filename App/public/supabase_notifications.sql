-- Benza Bullion v53: cloud watchlist + Web Push subscriptions
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metal text not null check (metal in ('gold','silver','platinum','palladium','copper')),
  direction text not null check (direction in ('higher','lower')),
  target numeric not null check (target > 0),
  enabled boolean not null default true,
  is_triggered boolean not null default false,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metal, direction)
);

create table if not exists public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.price_alerts enable row level security;
alter table public.notification_subscriptions enable row level security;

drop policy if exists "Users manage own price alerts" on public.price_alerts;
create policy "Users manage own price alerts" on public.price_alerts for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "Users manage own push subscriptions" on public.notification_subscriptions;
create policy "Users manage own push subscriptions" on public.notification_subscriptions for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant select, insert, update, delete on public.price_alerts to authenticated;
grant select, insert, update, delete on public.notification_subscriptions to authenticated;
