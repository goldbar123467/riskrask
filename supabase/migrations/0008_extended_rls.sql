-- Migration 0008: RLS for games, and rewrite the v3-multiplayer-facing
-- read policies to use the SECURITY DEFINER helpers from 0006.
--
-- Why rewrite rooms + room_seats here: the 0003 policies encode their
-- membership check as an `exists (select 1 from room_seats ...)`
-- subquery that re-applies the same policy, producing unbounded
-- recursion (PostgreSQL will re-run the RLS policy on the inner table
-- and eventually stack-overflow or return zero rows under some plan
-- shapes). The helper functions bypass RLS inside a definer context,
-- breaking the cycle. This matches §1.2 of the build guide, which
-- lists rooms / room_seats / turn_events / room_messages as all
-- needing policy adjustments for v3.
--
-- Profiles / saves / admin_actions / reserved_usernames are unchanged.

-- =============================================================
-- rooms
-- Replace the recursive "seats member read" policy with a helper-based
-- one. Past members also get read access so post-game history remains
-- visible in a user's own rooms list.
-- =============================================================
drop policy if exists "rooms: seats member read" on rooms;

create policy "rooms: room member read"
  on rooms for select
  to authenticated
  using (public.was_room_member(id));

-- =============================================================
-- room_seats
-- Replace the self-referential "seats member read" policy. Past
-- members can still see the seat list of rooms they played in.
-- =============================================================
drop policy if exists "room_seats: seats member read" on room_seats;

create policy "room_seats: room member read"
  on room_seats for select
  to authenticated
  using (public.was_room_member(room_id));

-- =============================================================
-- games
-- =============================================================
alter table games enable row level security;

-- Past or current members of the room can read every game for that room.
create policy "games: room member read"
  on games for select
  to authenticated
  using (public.was_room_member(room_id));

-- No client INSERT/UPDATE/DELETE policies: service_role (edge functions)
-- is the only write path, and it bypasses RLS.

-- =============================================================
-- turn_events
-- Replace the 0003 SELECT policy with one that uses the helper.
-- =============================================================
drop policy if exists "turn_events: seats member read" on turn_events;

create policy "turn_events: room member read"
  on turn_events for select
  to authenticated
  using (public.was_room_member(room_id));

-- =============================================================
-- room_messages
-- Replace the 0003 SELECT policy (widen to past members) and ADD an
-- INSERT policy for active seats. send_chat (0012) is the intended
-- write path, but the policy must allow it; send_chat is SECURITY
-- DEFINER and will work either way.
-- =============================================================
drop policy if exists "room_messages: seats member read" on room_messages;

create policy "room_messages: room member read"
  on room_messages for select
  to authenticated
  using (public.was_room_member(room_id));

create policy "room_messages: active seat insert"
  on room_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_room_member(room_id)
  );
