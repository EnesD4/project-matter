-- Sprout / MatterPro — Supabase Postgres schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/rsapdgkmvihaboouwvwv/sql).
-- Also enable Anonymous sign-ins under Authentication → Providers so guest / demo sessions can write profiles.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  app_user_id text,
  email text,
  name text not null default '',
  full_name text,
  birth_date date,
  age integer,
  is_guest boolean not null default false,
  has_completed_onboarding boolean not null default false,
  has_completed_bank_setup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;

create index if not exists profiles_app_user_id_idx on public.profiles (app_user_id);

create table if not exists public.financial_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cash_balance numeric not null default 0,
  debt numeric not null default 0,
  investment_assets numeric not null default 0,
  monthly_income numeric not null default 0,
  updated_at timestamptz not null default now()
);

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

alter table public.profiles enable row level security;
alter table public.financial_snapshots enable row level security;
alter table public.plaid_items enable row level security;
alter table public.bank_accounts enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "snapshots_select_own" on public.financial_snapshots;
drop policy if exists "snapshots_insert_own" on public.financial_snapshots;
drop policy if exists "snapshots_update_own" on public.financial_snapshots;
drop policy if exists "bank_accounts_select_own" on public.bank_accounts;
drop policy if exists "bank_accounts_insert_own" on public.bank_accounts;
drop policy if exists "bank_accounts_update_own" on public.bank_accounts;
drop policy if exists "bank_accounts_delete_own" on public.bank_accounts;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "snapshots_select_own"
  on public.financial_snapshots for select
  using (auth.uid() = user_id);

create policy "snapshots_insert_own"
  on public.financial_snapshots for insert
  with check (auth.uid() = user_id);

create policy "snapshots_update_own"
  on public.financial_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Access tokens stay server-only (service role). No client policies on plaid_items.

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists financial_snapshots_set_updated_at on public.financial_snapshots;
create trigger financial_snapshots_set_updated_at
  before update on public.financial_snapshots
  for each row execute procedure public.set_updated_at();

drop trigger if exists plaid_items_set_updated_at on public.plaid_items;
create trigger plaid_items_set_updated_at
  before update on public.plaid_items
  for each row execute procedure public.set_updated_at();

drop trigger if exists bank_accounts_set_updated_at on public.bank_accounts;
create trigger bank_accounts_set_updated_at
  before update on public.bank_accounts
  for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, full_name, is_guest)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
