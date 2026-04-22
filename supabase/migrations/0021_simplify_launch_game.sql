-- Migration 0021: simplify launch_game — host can launch any time.
--
-- The old RPC (from 0011) rejected launches when any human seat wasn't
-- ready OR when fewer than 2 seats existed. With S3's server-side AI
-- autofill, the seat count always reaches max_players at launch, and the
-- product decision is: Ready/Unready is no longer a gameplay gate.
-- Host presses LAUNCH, game goes. Everyone else just waits.
--
-- Kept: auth check, room-exists check, host-only check, state gate
-- (must be lobby / post_game / countdown). Dropped: readiness check,
-- seat-count ≥ 2 check (relaxed to ≥ 1 defensive guard).
--
-- Idempotent via CREATE OR REPLACE (same signature as 0011).

create or replace function public.launch_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_room  rooms;
  v_seats int;
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

  -- Defensive floor: at least one seat must exist. Autofill (S3) is
  -- expected to populate empty seats before this RPC fires, but a caller
  -- could still reach here with zero seats if autofill was skipped.
  select count(*) into v_seats
    from room_seats
   where room_id = p_room_id
     and left_at is null;
  if v_seats < 1 then
    raise exception 'no seats' using errcode = '22023';
  end if;

  update rooms set state = 'active' where id = p_room_id;
end $$;

notify pgrst, 'reload schema';
