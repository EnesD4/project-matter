-- Run this in the Supabase SQL Editor if bank_accounts / plaid_items are not created yet.
-- https://supabase.com/dashboard/project/rsapdgkmvihaboouwvwv/sql

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null unique,
  access_token text not null,
  institution_id text,
  institution_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plaid_items_user_id_idx on public.plaid_items (user_id);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plaid_account_id text not null,
  name text not null default 'Linked account',
  official_name text,
  type text not null default 'depository',
  subtype text,
  mask text,
  institution text,
  balance numeric not null default 0,
  available_balance numeric,
  iso_currency text default 'USD',
  min_payment numeric,
  apr numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plaid_account_id)
);

create index if not exists bank_accounts_user_id_idx on public.bank_accounts (user_id);

alter table public.plaid_items enable row level security;
alter table public.bank_accounts enable row level security;

drop policy if exists "bank_accounts_select_own" on public.bank_accounts;
drop policy if exists "bank_accounts_insert_own" on public.bank_accounts;
drop policy if exists "bank_accounts_update_own" on public.bank_accounts;
drop policy if exists "bank_accounts_delete_own" on public.bank_accounts;

create policy "bank_accounts_select_own"
  on public.bank_accounts for select
  using (auth.uid() = user_id);

create policy "bank_accounts_insert_own"
  on public.bank_accounts for insert
  with check (auth.uid() = user_id);

create policy "bank_accounts_update_own"
  on public.bank_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bank_accounts_delete_own"
  on public.bank_accounts for delete
  using (auth.uid() = user_id);
