-- Migration 0020: leave_room — lobby cleanup + host transfer surfacing
--
-- Changes vs 0011:
--   1. Return type widened from `void` to `TABLE(room_deleted, new_host_id)`
--      so supabase-js callers can decide whether to toast "Lobby closed" or
--      re-fetch the room.
--   2. Explicit host-transfer + solo-human-deletion semantics are unchanged
--      from 0011; we just report them in the return row.
--   3. The "0 humans remaining" check now filters on `user_id IS NOT NULL`.
--      The 0011 version used `left_at IS NULL` alone — that was correct when
--      leaves in `lobby` state hard-deleted the seat, but the new contract
--      ("count active humans") is clearer and matches the spec.
--   4. Defensive: even though every FK into `rooms(id)` declares
--      `ON DELETE CASCADE` (audited against 0001 + 0007), we DELETE the
--      child tables explicitly before the room row so a future FK change
--      can't silently turn a solo-leave into an error.
--
-- Cascade audit (2026-04-22):
--   - room_seats.room_id        → rooms(id) ON DELETE CASCADE  (0001:70)
--   - room_messages.room_id     → rooms(id) ON DELETE CASCADE  (0001:101)
--   - turn_events.room_id       → rooms(id) ON DELETE CASCADE  (0001:84)
--   - games.room_id             → rooms(id) ON DELETE CASCADE  (0007:20)
--   - rooms.current_game_id     → games(id) ON DELETE SET NULL (0007:70)
--
-- Idempotency:
--   Postgres disallows changing a function's return type via
--   `CREATE OR REPLACE`; we DROP first so this migration is re-runnable.

drop function if exists public.leave_room(uuid);

create function public.leave_room(p_room_id uuid)
returns table (
  room_deleted boolean,
  new_host_id  uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_was_host  boolean;
  v_state     room_state;
  v_new_host  uuid;
  v_humans    int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select state, (host_id = v_uid)
    into v_state, v_was_host
    from rooms
   where id = p_room_id
   for update;

  -- Room vanished (e.g. a concurrent leaver already deleted it): treat as
  -- idempotent success. The client wanted to leave; it's gone.
  if v_state is null then
    room_deleted := true;
    new_host_id  := null;
    return next;
    return;
  end if;

  -- Active-state leave: flip the seat to AI so the in-progress game keeps
  -- running. No host transfer, no room deletion — unchanged from 0011.
  if v_state = 'active' then
    update room_seats
       set left_at      = now(),
           is_ai        = true,
           is_connected = false,
           arch_id      = coalesce(arch_id, 'default')
     where room_id = p_room_id
       and user_id = v_uid
       and left_at is null;

    room_deleted := false;
    new_host_id  := null;
    return next;
    return;
  end if;

  -- Non-active states (lobby / post_game / countdown / finished / archived):
  -- hard-delete the seat. Subsequent seat counts only see real humans.
  delete from room_seats
   where room_id = p_room_id
     and user_id = v_uid
     and left_at is null;

  -- Count remaining active humans (user_id IS NOT NULL excludes AI seats;
  -- the leaver's seat has just been deleted above).
  select count(*) into v_humans
    from room_seats
   where room_id = p_room_id
     and user_id is not null
     and left_at is null;

  -- Last human out of a lobby: delete the room. Explicit child-table deletes
  -- are redundant with the existing ON DELETE CASCADE chain but harden the
  -- RPC against future schema changes where a new child table forgets the
  -- cascade clause.
  if v_humans = 0 and v_state = 'lobby' then
    delete from room_messages where room_id = p_room_id;
    delete from turn_events   where room_id = p_room_id;
    delete from games         where room_id = p_room_id;
    delete from room_seats    where room_id = p_room_id;
    delete from rooms         where id      = p_room_id;

    room_deleted := true;
    new_host_id  := null;
    return next;
    return;
  end if;

  -- Host left with humans still in the room: transfer to the lowest seat_idx
  -- human whose seat is still active. The departing seat is already gone so
  -- the SELECT below can't pick the leaver.
  if v_was_host then
    select user_id into v_new_host
      from room_seats
     where room_id = p_room_id
       and user_id is not null
       and left_at is null
     order by seat_idx asc
     limit 1;

    if v_new_host is not null then
      update rooms set host_id = v_new_host where id = p_room_id;
    end if;

    room_deleted := false;
    new_host_id  := v_new_host;
    return next;
    return;
  end if;

  -- Non-host leaving a non-empty lobby: nothing else to do.
  room_deleted := false;
  new_host_id  := null;
  return next;
  return;
end $$;

revoke all on function public.leave_room(uuid) from public;
grant execute on function public.leave_room(uuid) to authenticated;

notify pgrst, 'reload schema';
