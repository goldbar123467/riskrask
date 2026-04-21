-- Migration 0005: multiplayer schema delta
-- - Ensure required extensions (pg_cron, pg_net)
-- - Extend room_state enum with post_game, countdown
-- - Prep rooms / turn_events for a separate games table (created in 0007)
-- - Add connection tracking to room_seats
-- - Install auth.users -> profiles handler (was missing from 0001/0003)

-- =============================================================
-- Extensions (idempotent; pgcrypto + citext already installed by 0001)
-- =============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;
create extension if not exists citext;

-- =============================================================
-- Extend room_state enum.
-- ALTER TYPE ... ADD VALUE is supported inside a transaction on PG 12+,
-- but the new labels cannot be referenced in the same transaction.
-- We only add them here; they are first read/written in 0011.
-- =============================================================
alter type room_state add value if not exists 'post_game' after 'active';
alter type room_state add value if not exists 'countdown' after 'post_game';

-- =============================================================
-- rooms
-- - current_game_id: will FK to games(id) in 0007.
-- - current_state: moves into games.state; drop to prevent drift.
--   (winner_id stays on rooms as a convenience readout of the last game.)
-- - settings: set a default surfacing the knobs tick/launch expect.
-- =============================================================
alter table rooms
  add column if not exists current_game_id uuid;

alter table rooms
  drop column if exists current_state;

alter table rooms
  alter column settings set default
    jsonb_build_object(
      'phase_timer_sec',    90,
      'postgame_pause_sec', 30,
      'countdown_sec',      300,
      'dice_mode',          'classic'
    );

-- Backfill settings for any pre-existing rows that still have '{}'::jsonb
-- so the tick function can rely on the keys existing.
update rooms
   set settings = jsonb_build_object(
         'phase_timer_sec',    90,
         'postgame_pause_sec', 30,
         'countdown_sec',      300,
         'dice_mode',          'classic'
       ) || coalesce(settings, '{}'::jsonb)
 where not (settings ? 'phase_timer_sec');

-- =============================================================
-- room_seats
-- - is_connected: presence-derived liveness flag
-- - last_seen_at: touched on join / ready / heartbeat
-- - is_ready: launch gate (also added by 0011; done here so the column
--             exists before any 0011 RPC runs)
-- - partial index for quick "active seats in room" lookups (the hot path)
-- =============================================================
alter table room_seats
  add column if not exists is_connected boolean     not null default true,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists is_ready     boolean     not null default false;

create index if not exists room_seats_connected_idx
  on room_seats (room_id, left_at)
  where left_at is null;

create index if not exists room_seats_user_idx
  on room_seats (user_id)
  where user_id is not null and left_at is null;

-- =============================================================
-- turn_events
-- Adds game_id column only; FK + NOT NULL + existing-row handling
-- happens in 0007 where games(id) becomes a valid target.
-- =============================================================
alter table turn_events
  add column if not exists game_id uuid;

-- =============================================================
-- auth.users -> public.profiles bridge
-- Required because the username/password flow uses supabase.auth.signUp,
-- which creates auth.users rows that must propagate into profiles.
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username     text;
  v_display_name text;
begin
  v_username := lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    'user_' || substr(new.id::text, 1, 8)
  ));
  v_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'username',
    'Player'
  );

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_display_name)
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
