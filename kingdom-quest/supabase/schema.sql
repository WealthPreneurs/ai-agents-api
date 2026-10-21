-- ============================================================
-- Kingdom Quest — family accounts, progress, journal, rewards
-- Separate Supabase project from the WealthPreneurs dashboard.
-- Safe to re-run.
--
-- Account model: only a parent/guardian has a Supabase auth login.
-- Children are profiles under that parent (no email, no password, no
-- public identity). Every row is scoped to auth.uid() = parent_id.
-- Content (the 365 daily nodes) is shipped as static JSON, not stored here.
-- ============================================================

create extension if not exists pgcrypto;

-- 1. PARENTS
-- One row per guardian account; id = Supabase auth user id.
create table if not exists parents (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  -- Verifiable parental consent (COPPA). Nothing for a child is stored before this is set.
  consent_given_at timestamptz,
  consent_method text check (consent_method in ('card_check','signed_form','video_call','gov_id')),
  -- Separate opt-in for sending reflection text to the AI badge service.
  ai_reflection_consent boolean not null default false,
  created_at timestamptz default now()
);

-- 2. CHILD PROFILES
create table if not exists child_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  age_band text not null check (age_band in ('7-9','10-12')),
  avatar jsonb not null default '{}'::jsonb,
  -- Accessibility and comfort settings, applied on every device.
  settings jsonb not null default '{
    "tts": true, "captions": true, "color_mode": "standard",
    "text_size": "large", "reduce_motion": false, "daily_minutes_cap": 20
  }'::jsonb,
  start_date date not null default current_date,
  created_at timestamptz default now()
);
create index if not exists child_profiles_parent_idx on child_profiles(parent_id);

-- 3. CHECKPOINT PROGRESS (one row per child per day node)
-- There is deliberately no streak column. Progress only ever grows.
create table if not exists checkpoint_progress (
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  day smallint not null check (day between 1 and 365),
  story_done boolean not null default false,
  gem_done boolean not null default false,
  quiz_done boolean not null default false,
  prayer_done boolean not null default false,
  quiz_first_try_correct smallint check (quiz_first_try_correct between 0 and 3),
  completed_at timestamptz,
  primary key (child_id, day)
);

-- 4. DIVINE BLUEPRINT JOURNAL
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  day smallint check (day between 1 and 365),
  kind text not null check (kind in ('reflection','answered_prayer','strength','gratitude','free')),
  prompt text,
  choice text,                      -- tap answer from reflection_choices
  body text check (char_length(body) <= 2000),
  drawing_path text,                -- Supabase Storage path for a drawing/photo
  voice_path text,                  -- Supabase Storage path for a voice note
  -- The parent dashboard shows only shared entries (and safety flags).
  -- This is a UI choice, not a security boundary: the parent owns the
  -- account and keeps the COPPA right to review all of their child's data.
  shared_with_parent boolean not null default false,
  -- Set by the safety screen (self-harm, abuse, danger). Always visible to the parent.
  safety_flag text check (safety_flag in ('none','check_in','urgent')) default 'none',
  analyzed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists journal_child_idx on journal_entries(child_id, created_at desc);

-- 5. TRAIT SIGNALS (evidence behind Identity Badges)
-- Every badge is explainable: each signal points at the entry it came from.
create table if not exists trait_signals (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  trait_id text not null,           -- content/catalog.json traits[].id
  source text not null check (source in ('day_completion','reflection_ai','reflection_choice','parent_affirmation')),
  confidence numeric(3,2) check (confidence between 0 and 1),
  realm smallint check (realm between 1 and 52),
  created_at timestamptz default now()
);
create index if not exists trait_signals_child_idx on trait_signals(child_id, trait_id);

-- 6. IDENTITY BADGES
create table if not exists badge_awards (
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  badge_id text not null,           -- content/catalog.json identity_badges[].id
  awarded_at timestamptz default now(),
  evidence jsonb not null default '[]'::jsonb,  -- trait_signal ids + short quotes
  primary key (child_id, badge_id)
);

-- 7. KINGDOM BUILDER WALLET, INVENTORY, AND VILLAGE
create table if not exists wallets (
  child_id uuid primary key references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  light_stones integer not null default 0 check (light_stones >= 0),
  materials jsonb not null default '{}'::jsonb   -- { "cedar_wood": 3, ... }
);

-- Append-only ledger; the wallet is a cache of its sum.
create table if not exists stone_ledger (
  id bigserial primary key,
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('checkpoint','realm_chest','milestone','badge','purchase','gift')),
  day smallint,
  created_at timestamptz default now()
);

create table if not exists village_items (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  item_id text not null,
  grid_x smallint not null,
  grid_y smallint not null,
  rotation smallint not null default 0 check (rotation in (0,90,180,270)),
  placed_at timestamptz default now()
);

-- 8. REST & RESTORE (grace mechanic, no penalties)
create table if not exists rest_restore_events (
  id bigserial primary key,
  child_id uuid not null references child_profiles(id) on delete cascade,
  parent_id uuid not null references parents(id) on delete cascade,
  days_away smallint not null,
  path_chosen text check (path_chosen in ('catch_up','jump_to_today','recap')),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- ROW-LEVEL SECURITY: a parent sees and writes only their family.
-- Badge awards and safety flags are written by the API (service role),
-- so families can read them but not insert/alter them.
-- ------------------------------------------------------------
alter table parents enable row level security;
drop policy if exists "parent owns self" on parents;
create policy "parent owns self" on parents for all
  using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['child_profiles','checkpoint_progress','journal_entries',
                           'village_items','rest_restore_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "family rows" on %I', t);
    execute format('create policy "family rows" on %I for all
                    using (parent_id = auth.uid()) with check (parent_id = auth.uid())', t);
  end loop;

  foreach t in array array['trait_signals','badge_awards','wallets','stone_ledger']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "family reads" on %I', t);
    execute format('create policy "family reads" on %I for select using (parent_id = auth.uid())', t);
  end loop;
end $$;

-- A child row must belong to the same parent as the row that references it.
create or replace function kq_check_child_parent() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from child_profiles c where c.id = new.child_id and c.parent_id = new.parent_id) then
    raise exception 'child % does not belong to parent %', new.child_id, new.parent_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['checkpoint_progress','journal_entries','trait_signals','badge_awards',
                           'wallets','stone_ledger','village_items','rest_restore_events']
  loop
    execute format('drop trigger if exists kq_child_parent on %I', t);
    execute format('create trigger kq_child_parent before insert or update on %I
                    for each row execute function kq_check_child_parent()', t);
  end loop;
end $$;
