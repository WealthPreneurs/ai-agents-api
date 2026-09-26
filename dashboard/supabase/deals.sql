-- ============================================================
-- Kingdom Capital Deal Engine — saved deals
-- Run this in the Supabase SQL editor. Works with or without
-- schema.sql, and is safe to re-run. Adds one table; does not touch
-- clients, client_memory, or worker_runs.
-- ============================================================

-- 4. DEALS
-- One row per evaluated opportunity. The dashboard inserts a row when the
-- Deal Engine returns a memorandum; input and result are stored as-is so the
-- memo can be re-rendered and re-run later.
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  -- Same value as clients.id: the Supabase auth user id.
  client_id uuid not null references auth.users(id) on delete cascade,
  deal_name text not null,
  deal_type text,
  verdict text not null
    check (verdict in ('GO','CONDITIONAL GO','NO-GO','AUTOMATIC REJECTION')),
  weighted_score numeric(4,2) not null,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table deals enable row level security;

drop policy if exists "clients manage own deals" on deals;
create policy "clients manage own deals"
  on deals for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create index if not exists idx_deals_client_created
  on deals (client_id, created_at desc);
