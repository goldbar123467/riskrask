-- Migration 0010: AFTER INSERT / UPDATE / DELETE triggers that fan out
-- row changes to the appropriate Realtime topic.
--
-- realtime.broadcast_changes(topic, event, op, table, schema, new, old)
-- is the Supabase-provided helper that publishes a broadcast message.
-- At the observed write rate (<= a handful per second per game), this
-- stays well under Realtime throughput limits. If a hotter path ever
-- needs sub-row granularity, switch those callers to realtime.send()
-- with a hand-crafted delta.

-- =============================================================
-- rooms  -> room:{id}
-- =============================================================
create or replace function public.broadcast_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(new.id, old.id);
begin
  perform realtime.broadcast_changes(
    'room:' || v_id::text,
    tg_op, tg_op,
    tg_table_name, tg_table_schema,
    new, old
  );
  return coalesce(new, old);
end $$;

-- =============================================================
-- room_seats -> room:{room_id}
-- =============================================================
create or replace function public.broadcast_room_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid := coalesce(new.room_id, old.room_id);
begin
  perform realtime.broadcast_changes(
    'room:' || v_room::text,
    tg_op, tg_op,
    tg_table_name, tg_table_schema,
    new, old
  );
  return coalesce(new, old);
end $$;

-- =============================================================
-- room_messages -> room:{room_id}    (INSERT only; chat is append-only)
-- =============================================================
create or replace function public.broadcast_room_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'room:' || new.room_id::text,
    tg_op, tg_op,
    tg_table_name, tg_table_schema,
    new, null
  );
  return new;
end $$;

-- =============================================================
-- games -> game:{id}    (INSERT / UPDATE)
-- =============================================================
create or replace function public.broadcast_games()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(new.id, old.id);
begin
  perform realtime.broadcast_changes(
    'game:' || v_id::text,
    tg_op, tg_op,
    tg_table_name, tg_table_schema,
    new, old
  );
  return coalesce(new, old);
end $$;

-- =============================================================
-- turn_events -> game:{game_id}      (INSERT only)
-- =============================================================
create or replace function public.broadcast_turn_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'game:' || new.game_id::text,
    tg_op, tg_op,
    tg_table_name, tg_table_schema,
    new, null
  );
  return new;
end $$;

-- =============================================================
-- Wire triggers
-- =============================================================
drop trigger if exists rooms_broadcast         on rooms;
drop trigger if exists room_seats_broadcast    on room_seats;
drop trigger if exists room_messages_broadcast on room_messages;
drop trigger if exists games_broadcast         on games;
drop trigger if exists turn_events_broadcast   on turn_events;

create trigger rooms_broadcast
  after insert or update or delete on rooms
  for each row execute function public.broadcast_rooms();

create trigger room_seats_broadcast
  after insert or update or delete on room_seats
  for each row execute function public.broadcast_room_seats();

create trigger room_messages_broadcast
  after insert on room_messages
  for each row execute function public.broadcast_room_messages();

create trigger games_broadcast
  after insert or update on games
  for each row execute function public.broadcast_games();

create trigger turn_events_broadcast
  after insert on turn_events
  for each row execute function public.broadcast_turn_events();
