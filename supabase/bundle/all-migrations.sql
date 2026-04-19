-- riskrask v3 schema bundle
-- Generated 2026-04-19T21:34:10Z from supabase/migrations/000{1..4}_*.sql
-- Paste into Supabase SQL Editor (https://supabase.com/dashboard/project/wzcwlsaduxmpkbywpvaw/sql/new) and run.
-- Idempotent: safe to re-run.


-- =====================================================================
-- 0001_init.sql
-- =====================================================================
-- Migration 0001: Initial schema
-- Tables: profiles, saves, rooms, room_seats, turn_events, room_messages,
--         admin_actions, reserved_usernames

-- Enable citext extension for case-insensitive text comparisons
create extension if not exists citext;

-- =============================================================
-- profiles
-- =============================================================
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext unique not null
                 check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  created_at   timestamptz not null default now(),
  banned       boolean not null default false,
  arch_stats   jsonb not null default '{}'::jsonb,
  player_stats jsonb not null default '{}'::jsonb
);

-- =============================================================
-- saves  (share-code saves)
-- =============================================================
create table saves (
  code            text primary key
                    check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  state_json      jsonb not null,
  schema_version  int  not null,
  owner_id        uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,           -- null = account-linked; 30d = anonymous
  last_loaded_at  timestamptz,
  load_count      int not null default 0
);

create index saves_owner_idx   on saves (owner_id)   where owner_id is not null;
create index saves_expires_idx on saves (expires_at) where expires_at is not null;

-- =============================================================
-- rooms
-- =============================================================
create type room_state as enum ('lobby', 'active', 'finished', 'archived');

create table rooms (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null
                   check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  state          room_state not null default 'lobby',
  visibility     text not null check (visibility in ('public', 'private')),
  max_players    int  not null check (max_players between 2 and 6),
  host_id        uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  current_state  jsonb,
  schema_version int  not null default 1,
  winner_id      uuid references profiles(id),
  settings       jsonb not null default '{}'::jsonb
);

create index rooms_state_idx     on rooms (state);
create index rooms_vis_state_idx on rooms (visibility, state)
  where state in ('lobby', 'active');

-- =============================================================
-- room_seats
-- =============================================================
create table room_seats (
  room_id   uuid references rooms(id) on delete cascade,
  seat_idx  int  not null,
  user_id   uuid references profiles(id),
  is_ai     boolean not null default false,
  arch_id   text,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (room_id, seat_idx)
);

-- =============================================================
-- turn_events  (full action log for replay + desync debug)
-- =============================================================
create table turn_events (
  room_id        uuid references rooms(id) on delete cascade,
  seq            bigint not null,
  turn           int  not null,
  actor_id       uuid,
  action         jsonb not null,
  resulting_hash text not null,
  server_ts      timestamptz not null default now(),
  primary key (room_id, seq)
);

create index turn_events_room_ts_idx on turn_events (room_id, server_ts);

-- =============================================================
-- room_messages  (in-game chat)
-- =============================================================
create table room_messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references rooms(id) on delete cascade,
  user_id    uuid references profiles(id),
  text       text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

create index room_messages_room_idx on room_messages (room_id, created_at desc);

-- =============================================================
-- admin_actions  (audit log)
-- =============================================================
create table admin_actions (
  id         bigint generated always as identity primary key,
  admin_id   uuid not null,
  action     text not null,
  target     jsonb,
  created_at timestamptz not null default now()
);

-- =============================================================
-- reserved_usernames  (blocklist)
-- =============================================================
create table reserved_usernames (
  username citext primary key
);


-- =====================================================================
-- 0002_save_code_fn.sql
-- =====================================================================
-- Migration 0002: generate_save_code() function + auto-fill trigger

-- =============================================================
-- generate_save_code()
-- Generates a unique 8-character save code from the 31-char
-- Crockford alphabet (excludes 0, O, 1, I, L).
-- Retries up to 10 times on collision before raising.
-- =============================================================
create or replace function generate_save_code()
returns text
language plpgsql volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  attempt  text;
  tries    int := 0;
begin
  loop
    attempt := '';
    for i in 1..8 loop
      attempt := attempt || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (select 1 from saves where code = attempt) then
      return attempt;
    end if;

    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate unique save code after 10 attempts';
    end if;
  end loop;
end $$;

-- =============================================================
-- generate_room_code()
-- Same logic but produces a 6-character room invite code.
-- =============================================================
create or replace function generate_room_code()
returns text
language plpgsql volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  attempt  text;
  tries    int := 0;
begin
  loop
    attempt := '';
    for i in 1..6 loop
      attempt := attempt || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (select 1 from rooms where code = attempt) then
      return attempt;
    end if;

    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate unique room code after 10 attempts';
    end if;
  end loop;
end $$;

-- =============================================================
-- Trigger: auto-fill saves.code on INSERT when NULL
-- =============================================================
create or replace function saves_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code := generate_save_code();
  end if;
  return new;
end $$;

create trigger saves_auto_code
  before insert on saves
  for each row
  when (new.code is null)
  execute function saves_before_insert();

-- =============================================================
-- Trigger: auto-fill rooms.code on INSERT when NULL
-- =============================================================
create or replace function rooms_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code := generate_room_code();
  end if;
  return new;
end $$;

create trigger rooms_auto_code
  before insert on rooms
  for each row
  when (new.code is null)
  execute function rooms_before_insert();


-- =====================================================================
-- 0003_rls.sql
-- =====================================================================
-- Migration 0003: Row-Level Security policies

-- All writes to rooms/room_seats/turn_events/room_messages go through
-- the Bun server using the service role key (bypasses RLS).
-- These policies govern direct client access.

-- =============================================================
-- profiles
-- =============================================================
alter table profiles enable row level security;

-- Any authenticated user can read the public columns of any profile.
create policy "profiles: authenticated read"
  on profiles for select
  to authenticated
  using (true);

-- Users can update only their own row.
create policy "profiles: own row update"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users can insert their own profile row (triggered on signup).
create policy "profiles: own row insert"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

-- =============================================================
-- saves
-- =============================================================
alter table saves enable row level security;

-- Owners can read, update (e.g., rename), and delete their own saves.
create policy "saves: owner full access"
  on saves for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Anonymous saves (owner_id IS NULL) are not directly readable by
-- clients — access goes through the load-save edge function using
-- the service role. No client SELECT policy for anonymous saves.

-- =============================================================
-- rooms
-- =============================================================
alter table rooms enable row level security;

-- Clients may select rooms they are seated in.
create policy "rooms: seats member read"
  on rooms for select
  to authenticated
  using (
    exists (
      select 1 from room_seats
      where room_seats.room_id = rooms.id
        and room_seats.user_id = auth.uid()
        and room_seats.left_at is null
    )
  );

-- All writes via service role (Bun server) — no client write policies.

-- =============================================================
-- room_seats
-- =============================================================
alter table room_seats enable row level security;

create policy "room_seats: seats member read"
  on room_seats for select
  to authenticated
  using (
    exists (
      select 1 from room_seats rs2
      where rs2.room_id = room_seats.room_id
        and rs2.user_id = auth.uid()
        and rs2.left_at is null
    )
  );

-- =============================================================
-- turn_events
-- =============================================================
alter table turn_events enable row level security;

create policy "turn_events: seats member read"
  on turn_events for select
  to authenticated
  using (
    exists (
      select 1 from room_seats
      where room_seats.room_id = turn_events.room_id
        and room_seats.user_id = auth.uid()
    )
  );

-- =============================================================
-- room_messages
-- =============================================================
alter table room_messages enable row level security;

create policy "room_messages: seats member read"
  on room_messages for select
  to authenticated
  using (
    exists (
      select 1 from room_seats
      where room_seats.room_id = room_messages.room_id
        and room_seats.user_id = auth.uid()
    )
  );

-- =============================================================
-- admin_actions
-- =============================================================
alter table admin_actions enable row level security;

-- Only accessible via service role (Bun admin routes). No client policies.

-- =============================================================
-- reserved_usernames
-- =============================================================
alter table reserved_usernames enable row level security;

-- Authenticated clients may read reserved names to show validation feedback.
create policy "reserved_usernames: authenticated read"
  on reserved_usernames for select
  to authenticated
  using (true);


-- =====================================================================
-- 0004_save_helpers.sql
-- =====================================================================
-- Migration 0004: Helper RPC functions for edge functions
-- These are called by Supabase edge functions via the service role.

-- =============================================================
-- create_save_with_expiry()
-- Inserts a new save row, letting the trigger assign the code.
-- Returns the generated code and expires_at.
-- anonymous saves (p_owner_id IS NULL): expires in 30 days.
-- owner-linked saves (p_owner_id NOT NULL): never expire.
-- =============================================================
create or replace function create_save_with_expiry(
  p_state_json     jsonb,
  p_schema_version int,
  p_owner_id       uuid default null
)
returns table (code text, expires_at timestamptz)
language plpgsql volatile
security definer
as $$
declare
  v_expires_at timestamptz;
  v_code       text;
begin
  -- Anonymous saves expire after 30 days; owner saves are permanent.
  if p_owner_id is null then
    v_expires_at := now() + interval '30 days';
  else
    v_expires_at := null;
  end if;

  insert into saves (state_json, schema_version, owner_id, expires_at)
  values (p_state_json, p_schema_version, p_owner_id, v_expires_at)
  returning saves.code into v_code;

  return query select v_code, v_expires_at;
end $$;

