-- Migration 0018: widen the AI archetype whitelist to the 9 canonical IDs
-- and drop the default per-turn timer to 30 seconds.
--
-- Context
-- -------
-- `add_ai_seat` (migration 0011) was written against an early 4-archetype
-- catalogue (`default, zhukov, sun, bonaparte`). The canonical TS source of
-- truth in `packages/ai/src/arch.ts` now lists 9 IDs
-- (`dilettante, napoleon, fortress, jackal, vengeful, patient, shogun,
-- hermit, prophet`). Every client-side AI picker hands one of those 9 to
-- the RPC and fails the CHECK — the lobby AI-seat button is effectively
-- broken today. We widen the whitelist here and keep the legacy
-- `'default'` value as a silent alias for `'dilettante'` so any historical
-- `room_seats.arch_id='default'` rows still load.
--
-- Separately, S3 sets the per-turn budget to 30 s. `create_room`
-- (migration 0017) wrote 90 into the settings jsonb default; we flip that
-- literal to 30. Historical rooms keep whatever value they were created
-- with.
--
-- Idempotent: `create or replace` is safe to re-run. `NOTIFY pgrst` at the
-- end forces PostgREST to reload the schema cache without a restart.

-- ============================================================
-- add_ai_seat — widened whitelist + `'default'` alias
-- ============================================================
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
  v_arch text := p_arch_id;
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

  -- Silent alias: historical rows / legacy callers passing 'default'
  -- resolve to the canonical dilettante archetype.
  if v_arch = 'default' then
    v_arch := 'dilettante';
  end if;

  if v_arch not in (
    'dilettante', 'napoleon', 'fortress', 'jackal',
    'vengeful',   'patient',  'shogun',   'hermit', 'prophet'
  ) then
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
    p_room_id, v_next, null, true, v_arch, true
  );
end $$;

revoke all on function public.add_ai_seat(uuid, text) from public;
grant execute on function public.add_ai_seat(uuid, text) to authenticated;

-- ============================================================
-- create_room — phase_timer_sec default flips from 90 to 30.
--
-- Everything else (name-required guard from 0017, capacity/visibility
-- validation, the ordered parameter list, the RLS grants) is preserved
-- byte-for-byte. We rewrite the full function body because Postgres has
-- no "replace a literal inside a stored function" primitive; this is the
-- least-surprising option.
-- ============================================================
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
      'phase_timer_sec',    30,
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

notify pgrst, 'reload schema';
