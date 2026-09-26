-- ============================================================
-- Kingdom Capital Deal Engine — subscriptions and usage
-- Run this in the Supabase SQL editor after deals.sql. Safe to re-run.
--
-- Both tables are written only by the AI Agents API using the Supabase
-- service role key (which bypasses row-level security). Users can read
-- their own rows but have no insert/update/delete policies, so nobody can
-- grant themselves a subscription or reset their usage from the browser.
-- ============================================================

-- 5. BILLING ACCOUNTS
-- One row per user who has started checkout. Kept in sync by the Stripe
-- webhook (POST /stripe/webhook on the API).
create table if not exists billing_accounts (
  client_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text not null default 'none',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz default now()
);

alter table billing_accounts enable row level security;

drop policy if exists "clients view own billing" on billing_accounts;
create policy "clients view own billing"
  on billing_accounts for select
  using (client_id = auth.uid());


-- 6. DEAL ENGINE USAGE
-- One row per completed evaluation, recorded by the API. Counts toward the
-- free allowance and the monthly plan limit. Separate from `deals` so that
-- deleting a saved memo doesn't give usage back.
create table if not exists deal_engine_usage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table deal_engine_usage enable row level security;

drop policy if exists "clients view own usage" on deal_engine_usage;
create policy "clients view own usage"
  on deal_engine_usage for select
  using (client_id = auth.uid());

create index if not exists idx_deal_engine_usage_client_created
  on deal_engine_usage (client_id, created_at desc);
