-- Migration 0019: terminal-state RPC for finished games.
--
-- `end_game(room_id, winner_user_id)` atomically flips the room row into
-- the terminal `finished` state and closes the games row pointed at by
-- `rooms.current_game_id`. `winner_user_id` is nullable because an AI can
-- win the game, in which case the seat has no associated profile id.
--
-- Security posture
-- ----------------
-- SECURITY DEFINER (bypasses RLS on writes) with `search_path = public`.
-- EXECUTE is granted ONLY to `service_role` — this is an authoritative
-- server-side call; no end-user code path should ever invoke it directly.
-- Clients discover game termination through the WS `game_over` frame and
-- the `rooms.state` reconnect-fallback read.
--
-- Idempotency
-- -----------
-- Guarded on `rooms.state != 'finished'`: a duplicate call is a no-op.
-- The `games` UPDATE is scoped to `rooms.current_game_id`; if that row
-- is already `ended` the UPDATE is still a zero-effect write.
--
-- NOTIFY pgrst forces PostgREST to pick up the new function without a
-- server restart.

create or replace function public.end_game(
  p_room_id        uuid,
  p_winner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
begin
  update rooms
     set state       = 'finished',
         winner_id   = p_winner_user_id,
         finished_at = now()
   where id = p_room_id
     and state <> 'finished'
  returning current_game_id into v_game_id;

  if v_game_id is not null then
    update games
       set status         = 'ended',
           winner_user_id = p_winner_user_id,
           ended_at       = now()
     where id = v_game_id;
  end if;
end $$;

revoke all on function public.end_game(uuid, uuid) from public;
grant execute on function public.end_game(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
