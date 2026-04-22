-- Migration 0016: optional rooms.name + list_my_rooms RPC.
--
-- Adds an optional human-friendly `name` column on rooms (falls back to
-- `code` in the UI when NULL), extends `create_room` with a 4th parameter
-- to set it at insert time, and introduces `list_my_rooms()` so the lobby
-- can render a "rooms I'm in" tab without scraping the public list.
--
-- Idempotent: safe to re-run. `drop constraint if exists` guards the
-- check constraint; `create or replace function` handles both RPCs.
-- PostgREST is poked at the end so the new `create_room` signature and
-- `list_my_rooms` are exposed without a server restart.

-- =============================================================
-- rooms.name column + length check
-- =============================================================
alter table rooms add column if not exists name text;

alter table rooms drop constraint if exists rooms_name_len_ck;
alter table rooms add constraint rooms_name_len_ck
  check (name is null or length(trim(name)) between 1 and 80);

-- =============================================================
-- create_room (re-defined with optional p_name)
--
-- Everything else matches 0011: visibility/max_players guards, default
-- settings merge, host seat insert. The 4th parameter is trimmed; an
-- empty or whitespace-only value stores NULL so the UI can fall back to
-- the generated room code.
-- =============================================================
create or replace function public.create_room(
  p_visibility  text  default 'public',
  p_max_players int   default 6,
  p_settings    jsonb default '{}'::jsonb,
  p_name        text  default null
)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_room rooms;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility: %', p_visibility using errcode = '22023';
  end if;
  if p_max_players not between 2 and 6 then
    raise exception 'max_players must be 2..6' using errcode = '22023';
  end if;

  insert into rooms (visibility, max_players, host_id, settings, name)
  values (
    p_visibility,
    p_max_players,
    v_uid,
    -- Preserve the column default keys even when caller sends overrides.
    jsonb_build_object(
      'phase_timer_sec',    90,
      'postgame_pause_sec', 30,
      'countdown_sec',      300,
      'dice_mode',          'classic'
    ) || coalesce(p_settings, '{}'::jsonb),
    v_name
  )
  returning * into v_room;

  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready)
  values (v_room.id, 0, v_uid, false, false);

  return v_room;
end $$;

revoke all on function public.create_room(text, int, jsonb, text) from public;
grant execute on function public.create_room(text, int, jsonb, text) to authenticated;

-- =============================================================
-- list_my_rooms
-- Rooms the caller currently holds an active seat in, any state / any
-- visibility. `my_seat_idx` is the caller's seat, `seat_count` is the
-- total active seats in that room. Most-recent rooms first, capped at
-- 50.
-- =============================================================
create or replace function public.list_my_rooms()
returns table (
  id           uuid,
  code         text,
  name         text,
  state        room_state,
  visibility   text,
  max_players  int,
  host_id      uuid,
  created_at   timestamptz,
  seat_count   int,
  my_seat_idx  int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.code,
    r.name,
    r.state,
    r.visibility,
    r.max_players,
    r.host_id,
    r.created_at,
    (
      select count(*)::int
        from room_seats s2
       where s2.room_id = r.id
         and s2.left_at is null
    ) as seat_count,
    s.seat_idx as my_seat_idx
  from rooms r
  join room_seats s on s.room_id = r.id
  where s.user_id = auth.uid()
    and s.left_at is null
  order by r.created_at desc
  limit 50
$$;

revoke all on function public.list_my_rooms() from public;
grant execute on function public.list_my_rooms() to authenticated;

-- =============================================================
-- Force a PostgREST schema reload so the new create_room signature
-- and list_my_rooms are immediately callable via supabase.rpc().
-- =============================================================
notify pgrst, 'reload schema';
