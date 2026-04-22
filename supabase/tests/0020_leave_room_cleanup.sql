-- Smoke test for migration 0020 — leave_room cleanup + host transfer.
--
-- Run against a local Supabase instance (or the Hosted project's SQL editor)
-- after migrations 0001..0020 have applied. The script is destructive: it
-- creates and deletes rooms. Use a test/staging project only.
--
-- Each scenario wraps its assertions in DO $$ ... $$ blocks so a single run
-- can execute end-to-end. The auth.uid() calls are simulated by setting
-- `request.jwt.claims` at the session level via `set_config`.

-- =========================================================================
-- Setup helpers — create two mock auth.users + profiles pairs.
-- =========================================================================

-- Alice & Bob — avoid real email collisions by using unique UUIDs.
\set alice_id '00000000-0000-0000-0000-00000000a11ce'
\set bob_id   '00000000-0000-0000-0000-0000000000b0b'

-- Insert into auth.users first (requires superuser / service role).
insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', 'alice-test@example.test', 'authenticated', 'authenticated',
   '{"username":"alice_test","display_name":"Alice Test"}'::jsonb, now(), now()),
  (:'bob_id',   'bob-test@example.test',   'authenticated', 'authenticated',
   '{"username":"bob_test","display_name":"Bob Test"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- The on_auth_user_created trigger from 0005 should have inserted profile rows.

-- =========================================================================
-- Helper: act_as(uid) — sets auth.uid() to the given user for the session.
-- =========================================================================

create or replace function test_act_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end $$;

-- =========================================================================
-- Scenario 1 — solo human leaves a lobby → room gone
-- =========================================================================
do $$
declare
  v_room_id uuid;
  v_result  record;
  v_exists  boolean;
begin
  perform test_act_as('00000000-0000-0000-0000-00000000a11ce');
  insert into rooms (visibility, max_players, host_id, name)
    values ('public', 6, '00000000-0000-0000-0000-00000000a11ce', 'Solo')
    returning id into v_room_id;
  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready)
    values (v_room_id, 0, '00000000-0000-0000-0000-00000000a11ce', false, false);

  select * into v_result from public.leave_room(v_room_id);
  assert v_result.room_deleted = true, 'scenario 1: expected room_deleted=true';
  assert v_result.new_host_id is null,  'scenario 1: expected new_host_id=null';

  select exists(select 1 from rooms where id = v_room_id) into v_exists;
  assert v_exists = false, 'scenario 1: room row should be gone';
end $$;

-- =========================================================================
-- Scenario 2 — non-host leaves with host still present → room intact, no transfer
-- =========================================================================
do $$
declare
  v_room_id uuid;
  v_result  record;
  v_host    uuid;
begin
  perform test_act_as('00000000-0000-0000-0000-00000000a11ce');
  insert into rooms (visibility, max_players, host_id, name)
    values ('public', 6, '00000000-0000-0000-0000-00000000a11ce', 'Duo')
    returning id into v_room_id;
  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready) values
    (v_room_id, 0, '00000000-0000-0000-0000-00000000a11ce', false, false),
    (v_room_id, 1, '00000000-0000-0000-0000-0000000000b0b', false, false);

  -- Bob leaves (non-host).
  perform test_act_as('00000000-0000-0000-0000-0000000000b0b');
  select * into v_result from public.leave_room(v_room_id);
  assert v_result.room_deleted = false, 'scenario 2: expected room_deleted=false';
  assert v_result.new_host_id is null,  'scenario 2: expected new_host_id=null';

  select host_id into v_host from rooms where id = v_room_id;
  assert v_host = '00000000-0000-0000-0000-00000000a11ce', 'scenario 2: host should not change';

  -- Cleanup.
  delete from rooms where id = v_room_id;
end $$;

-- =========================================================================
-- Scenario 3 — host leaves with others remaining → host transfers to next seat
-- =========================================================================
do $$
declare
  v_room_id uuid;
  v_result  record;
  v_host    uuid;
begin
  perform test_act_as('00000000-0000-0000-0000-00000000a11ce');
  insert into rooms (visibility, max_players, host_id, name)
    values ('public', 6, '00000000-0000-0000-0000-00000000a11ce', 'Transfer')
    returning id into v_room_id;
  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready) values
    (v_room_id, 0, '00000000-0000-0000-0000-00000000a11ce', false, false),
    (v_room_id, 1, '00000000-0000-0000-0000-0000000000b0b', false, false);

  -- Alice (host) leaves.
  select * into v_result from public.leave_room(v_room_id);
  assert v_result.room_deleted = false, 'scenario 3: expected room_deleted=false';
  assert v_result.new_host_id = '00000000-0000-0000-0000-0000000000b0b',
    'scenario 3: expected host transfer to Bob';

  select host_id into v_host from rooms where id = v_room_id;
  assert v_host = '00000000-0000-0000-0000-0000000000b0b', 'scenario 3: rooms.host_id updated';

  -- Cleanup.
  delete from rooms where id = v_room_id;
end $$;

-- =========================================================================
-- Scenario 4 — active-state leave: no delete, no transfer, seat → AI
-- =========================================================================
do $$
declare
  v_room_id uuid;
  v_result  record;
  v_is_ai   boolean;
  v_exists  boolean;
begin
  perform test_act_as('00000000-0000-0000-0000-00000000a11ce');
  insert into rooms (visibility, max_players, host_id, state, name)
    values ('public', 6, '00000000-0000-0000-0000-00000000a11ce', 'active', 'ActiveLeave')
    returning id into v_room_id;
  insert into room_seats (room_id, seat_idx, user_id, is_ai, is_ready) values
    (v_room_id, 0, '00000000-0000-0000-0000-00000000a11ce', false, true),
    (v_room_id, 1, '00000000-0000-0000-0000-0000000000b0b', false, true);

  -- Alice leaves a running game.
  select * into v_result from public.leave_room(v_room_id);
  assert v_result.room_deleted = false, 'scenario 4: expected room_deleted=false';
  assert v_result.new_host_id is null,  'scenario 4: expected new_host_id=null';

  select exists(select 1 from rooms where id = v_room_id) into v_exists;
  assert v_exists = true, 'scenario 4: room must still exist';

  select is_ai into v_is_ai
    from room_seats
   where room_id = v_room_id and seat_idx = 0;
  assert v_is_ai = true, 'scenario 4: departing seat flipped to AI';

  -- Cleanup.
  delete from rooms where id = v_room_id;
end $$;

drop function if exists test_act_as(uuid);

-- Scenarios complete if no assertion failure was raised.
select 'leave_room cleanup smoke tests OK' as result;
