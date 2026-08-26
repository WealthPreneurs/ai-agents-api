-- ============================================================
-- WealthPreneurs AI Worker Dashboard — Phase 1 schema
-- Run this in the Supabase SQL editor on a fresh project.
-- ============================================================

-- 1. CLIENTS
-- id is the SAME as the Supabase auth user id — one client per login.
create table if not exists clients (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  owner_email text,
  subscription_status text default 'trialing',
  created_at timestamptz default now()
);

alter table clients enable row level security;

create policy "clients can view own row"
  on clients for select
  using (id = auth.uid());

create policy "clients can update own row"
  on clients for update
  using (id = auth.uid());

-- Auto-create a client row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.clients (id, owner_email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. CLIENT MEMORY
-- Key/value brand context, scoped per client.
create table if not exists client_memory (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  memory_key text not null,
  memory_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table client_memory enable row level security;

create policy "clients manage own memory"
  on client_memory for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid());


-- 3. WORKER RUNS
-- Every AI-generated draft. Make.com inserts rows here; this app updates
-- status on approve/edit/reject; Make.com's execute scenario reads back
-- rows where status = 'approved'.
create table if not exists worker_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  worker_key text not null default 'social_media_manager',
  triggered_at timestamptz default now(),
  raw_output jsonb not null default '{}'::jsonb,
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','edited','rejected','executed','failed')),
  approved_at timestamptz,
  action_result jsonb
);

alter table worker_runs enable row level security;

create policy "clients manage own worker runs"
  on worker_runs for all
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create index if not exists idx_worker_runs_client_status
  on worker_runs (client_id, status);


-- ============================================================
-- Optional: seed a sample pending draft for testing the UI
-- (replace the client_id with a real user id after you sign up once,
-- then run this manually — do not run before a user exists)
-- ============================================================
-- insert into worker_runs (client_id, worker_key, raw_output, status)
-- values (
--   'PASTE-YOUR-USER-ID-HERE',
--   'social_media_manager',
--   '{"platform":"facebook","body":"Sample draft post for testing the approval queue.","link_url":""}',
--   'pending_approval'
-- );
