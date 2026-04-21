-- Migration 0011: room lifecycle RPCs.
--
-- All functions are SECURITY DEFINER with pinned search_path. Clients
-- invoke them via supabase.rpc(...). Each function re-checks auth.uid()
-- and its own authorization preconditions.
--
-- Writes to rooms / room_seats inside these functions bypass RLS, which
-- is why clients have no write policies on those tables.

-- =============================================================
-- create_room
-- Creates a room and seats the caller as seat 0 (host).
-- The rooms_auto_code trigger from 0002 fills rooms.code.
-- =============================================================
create or replace function public.create_room(
  p_visibility  text  default 'public',
  p_max_players int   default 6,
  p_settings    jsonb default '{}'::jsonb
)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_room rooms;
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

  insert into rooms (visibility, max_players, host_id, settings)
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
    ) || coalesce(p_settings, '{}'::jsonb)
  )
  returning * into v_room;

  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready)
  values (v_room.id, 0, v_uid, false, false);

  return v_room;
end $$;

revoke all on function public.create_room(text, int, jsonb) from public;
grant execute on function public.create_room(text, int, jsonb) to authenticated;

-- =============================================================
-- join_room
-- Joins by invite code. Idempotent for the same caller: a player who
-- is already seated and still active is returned the same row (with
-- is_connected bumped back to true).
-- =============================================================
create or replace function public.join_room(p_code text)
returns rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_room      rooms;
  v_next_seat int;
  v_count     int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select * into v_room
    from rooms
   where code = upper(p_code)
   for update;

  if v_room.id is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  if v_room.state not in ('lobby', 'post_game', 'countdown') then
    raise exception 'room not joinable (state=%)', v_room.state
      using errcode = '55000';
  end if;

  -- Reconnect an existing active seat.
  if exists (
    select 1 from room_seats
     where room_id = v_room.id
       and user_id = v_uid
       and left_at is null
  ) then
    update room_seats
       set is_connected = true,
           last_seen_at = now()
     where room_id = v_room.id
       and user_id = v_uid;
    return v_room;
  end if;

  -- Capacity check against currently-active seats.
  select count(*) into v_count
    from room_seats
   where room_id = v_room.id
     and left_at is null;

  if v_count >= v_room.max_players then
    raise exception 'room full' using errcode = '53300';
  end if;

  -- Smallest unused seat_idx in [0, max_players).
  select coalesce(min(s), 0) into v_next_seat
    from (
      select generate_series(0, v_room.max_players - 1) s
      except
      select seat_idx
        from room_seats
       where room_id = v_room.id
         and left_at is null
    ) gaps;

  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready)
  values (v_room.id, v_next_seat, v_uid, false, false);

  return v_room;
end $$;

revoke all on function public.join_room(text) from public;
grant execute on function public.join_room(text) to authenticated;

-- =============================================================
-- leave_room
-- Behavior depends on room state:
--   lobby / post_game / countdown / finished / archived:
--     delete the seat entirely (no ghost seat to block capacity).
--   active:
--     flip seat to AI (left_at, is_ai=true) so the in-progress game
--     can keep running under the tick's AI takeover.
-- Host transfer: if the departing seat held host_id, promote the
-- earliest remaining human seat. If no humans remain in a lobby, the
-- room is deleted.
-- =============================================================
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_was_host   boolean;
  v_state      room_state;
  v_new_host   uuid;
  v_remaining  int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select state, (host_id = v_uid)
    into v_state, v_was_host
    from rooms
   where id = p_room_id
   for update;

  if v_state is null then
    return;
  end if;

  if v_state = 'active' then
    update room_seats
       set left_at      = now(),
           is_ai        = true,
           is_connected = false,
           arch_id      = coalesce(arch_id, 'default')
     where room_id = p_room_id
       and user_id = v_uid
       and left_at is null;
  else
    delete from room_seats
     where room_id = p_room_id
       and user_id = v_uid
       and left_at is null;
  end if;

  if v_was_host then
    select user_id into v_new_host
      from room_seats
     where room_id = p_room_id
       and left_at is null
       and user_id is not null
     order by seat_idx asc
     limit 1;

    if v_new_host is not null then
      update rooms set host_id = v_new_host where id = p_room_id;
    end if;
  end if;

  select count(*) into v_remaining
    from room_seats
   where room_id = p_room_id
     and left_at is null;

  if v_remaining = 0 and v_state = 'lobby' then
    delete from rooms where id = p_room_id;
  end if;
end $$;

revoke all on function public.leave_room(uuid) from public;
grant execute on function public.leave_room(uuid) to authenticated;

-- =============================================================
-- set_ready
-- Toggles the caller's ready flag on their active seat.
-- =============================================================
create or replace function public.set_ready(
  p_room_id uuid,
  p_ready   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  update room_seats
     set is_ready     = p_ready,
         last_seen_at = now()
   where room_id = p_room_id
     and user_id = v_uid
     and left_at is null;
end $$;

revoke all on function public.set_ready(uuid, boolean) from public;
grant execute on function public.set_ready(uuid, boolean) to authenticated;

-- =============================================================
-- add_ai_seat (host only)
-- Slots an AI into the lowest-indexed free seat. AI seats are
-- pre-flagged ready so they don't block launch_game.
-- =============================================================
create or replace function public.add_ai_seat(
  p_room_id uuid,
  p_arch_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_next int;
  v_max  int;
  v_cnt  int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  if not public.is_room_host(p_room_id) then
    raise exception 'host only' using errcode = '42501';
  end if;
  if p_arch_id not in ('default', 'zhukov', 'sun', 'bonaparte') then
    raise exception 'unknown archetype: %', p_arch_id using errcode = '22023';
  end if;

  select max_players into v_max from rooms where id = p_room_id for update;
  if v_max is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  select count(*) into v_cnt
    from room_seats
   where room_id = p_room_id
     and left_at is null;

  if v_cnt >= v_max then
    raise exception 'room full' using errcode = '53300';
  end if;

  select coalesce(min(s), 0) into v_next
    from (
      select generate_series(0, v_max - 1) s
      except
      select seat_idx
        from room_seats
       where room_id = p_room_id
         and left_at is null
    ) gaps;

  insert into room_seats (
    room_id, seat_idx, user_id, is_ai, arch_id, is_ready
  ) values (
    p_room_id, v_next, null, true, p_arch_id, true
  );
end $$;

revoke all on function public.add_ai_seat(uuid, text) from public;
grant execute on function public.add_ai_seat(uuid, text) to authenticated;

-- =============================================================
-- launch_game (host only)
-- Preconditions:
--   - caller is host
--   - room state is lobby | post_game | countdown
--   - at least 2 active seats
--   - all active seats are ready (AI seats are always ready)
-- Effect: flips rooms.state to 'active'. The trigger in 0013 reacts to
-- that transition and calls the launch-game edge function to insert
-- the first game row.
-- =============================================================
create or replace function public.launch_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_room    rooms;
  v_seats   int;
  v_unready int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.id is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.host_id <> v_uid then
    raise exception 'host only' using errcode = '42501';
  end if;
  if v_room.state not in ('lobby', 'post_game', 'countdown') then
    raise exception 'not launchable (state=%)', v_room.state
      using errcode = '55000';
  end if;

  select count(*) into v_seats
    from room_seats
   where room_id = p_room_id
     and left_at is null;

  if v_seats < 2 then
    raise exception 'need at least 2 seats (have %)', v_seats
      using errcode = '22023';
  end if;

  select count(*) into v_unready
    from room_seats
   where room_id = p_room_id
     and left_at is null
     and not is_ready;

  if v_unready > 0 then
    raise exception '% seat(s) not ready', v_unready using errcode = '55000';
  end if;

  update rooms set state = 'active' where id = p_room_id;
end $$;

revoke all on function public.launch_game(uuid) from public;
grant execute on function public.launch_game(uuid) to authenticated;
