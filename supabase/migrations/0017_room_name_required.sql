-- Migration 0017: room name is now required at insert time.
--
-- Alters `create_room` to raise when `p_name` is NULL or whitespace-only.
-- The column stays nullable so historical rows (name IS NULL) remain valid;
-- only new inserts via this RPC must provide a trimmed, non-empty name.
-- Length bound is already enforced by the existing `rooms_name_len_ck`
-- check constraint from 0016.
--
-- Also drops the legacy 3-arg `create_room(text, int, jsonb)` overload left
-- over by 0016: `CREATE OR REPLACE FUNCTION` with an added parameter creates
-- a second overload instead of replacing the original, so callers could
-- historically bypass the new name-required guard by hitting the 3-arg
-- version. Dropping it closes that hole.
--
-- Idempotent: `create or replace function` handles re-runs. PostgREST is
-- poked at the end so the refreshed function body is picked up without a
-- server restart.

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
  if v_name is null then
    raise exception 'name required' using errcode = '22023';
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

-- Close the overload loophole (see header comment).
drop function if exists public.create_room(text, int, jsonb);

notify pgrst, 'reload schema';
