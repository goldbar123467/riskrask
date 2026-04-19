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
