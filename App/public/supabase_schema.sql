-- BENZA BULLION: run this once in Supabase SQL Editor
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metal text not null check (metal in ('gold','silver')),
  product text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  weight_oz numeric(12,4) not null check (weight_oz > 0),
  total_oz numeric(14,4) not null check (total_oz > 0),
  cost_basis numeric(14,2) not null check (cost_basis >= 0),
  purchase_date date,
  created_at timestamptz not null default now()
);

alter table public.holdings enable row level security;

drop policy if exists "Users can view own holdings" on public.holdings;
create policy "Users can view own holdings"
on public.holdings for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own holdings" on public.holdings;
create policy "Users can insert own holdings"
on public.holdings for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own holdings" on public.holdings;
create policy "Users can update own holdings"
on public.holdings for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own holdings" on public.holdings;
create policy "Users can delete own holdings"
on public.holdings for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.holdings to authenticated;


-- BENZA BULLION ACTIVITY / TRANSACTION HISTORY
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('buy','remove','sell','update')),
  holding_id uuid references public.holdings(id) on delete set null,
  metal text not null check (metal in ('gold','silver')),
  product text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  weight_oz numeric(12,4) not null check (weight_oz > 0),
  total_oz numeric(14,4) not null check (total_oz > 0),
  amount numeric(14,2) not null check (amount >= 0),
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

drop policy if exists "Users can view own transactions" on public.transactions;
create policy "Users can view own transactions"
on public.transactions for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
on public.transactions for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
on public.transactions for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
on public.transactions for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.transactions to authenticated;
