-- Migration 0003: Row-Level Security policies

-- All writes to rooms/room_seats/turn_events/room_messages go through
-- the Bun server using the service role key (bypasses RLS).
-- These policies govern direct client access.

-- =============================================================
-- profiles
-- =============================================================
alter table profiles enable row level security;

-- Any authenticated user can read the public columns of any profile.
create policy "profiles: authenticated read"
  on profiles for select
  to authenticated
  using (true);

-- Users can update only their own row.
create policy "profiles: own row update"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users can insert their own profile row (triggered on signup).
create policy "profiles: own row insert"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

-- =============================================================
-- saves
-- =============================================================
alter table saves enable row level security;

-- Owners can read, update (e.g., rename), and delete their own saves.
create policy "saves: owner full access"
  on saves for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Anonymous saves (owner_id IS NULL) are not directly readable by
-- clients — access goes through the load-save edge function using
-- the service role. No client SELECT policy for anonymous saves.

-- =============================================================
-- rooms
-- =============================================================
alter table rooms enable row level security;

-- Clients may select rooms they are seated in.
create policy "rooms: seats member read"
  on rooms for select
  to authenticated
  using (
    exists (
      select 1 from room_seats
      where room_seats.room_id = rooms.id
        and room_seats.user_id = auth.uid()
        and room_seats.left_at is null
    )
  );

-- All writes via service role (Bun server) — no client write policies.

-- =============================================================
-- room_seats
-- =============================================================
alter table room_seats enable row level security;

create policy "room_seats: seats member read"
  on room_seats for select
  to authenticated
  using (
    exists (
      select 1 from room_seats rs2
      where rs2.room_id = room_seats.room_id
        and rs2.user_id = auth.uid()
        and rs2.left_at is null
    )
  );

-- =============================================================
-- turn_events
-- =============================================================
alter table turn_events enable row level security;

create policy "turn_events: seats member read"
  on turn_events for select
  to authenticated
  using (
    exists (
      select 1 from room_seats
      where room_seats.room_id = turn_events.room_id
        and room_seats.user_id = auth.uid()
    )
  );

-- =============================================================
-- room_messages
-- =============================================================
alter table room_messages enable row level security;

create policy "room_messages: seats member read"
  on room_messages for select
  to authenticated
  using (
    exists (
      select 1 from room_seats
      where room_seats.room_id = room_messages.room_id
        and room_seats.user_id = auth.uid()
    )
  );

-- =============================================================
-- admin_actions
-- =============================================================
alter table admin_actions enable row level security;

-- Only accessible via service role (Bun admin routes). No client policies.

-- =============================================================
-- reserved_usernames
-- =============================================================
alter table reserved_usernames enable row level security;

-- Authenticated clients may read reserved names to show validation feedback.
create policy "reserved_usernames: authenticated read"
  on reserved_usernames for select
  to authenticated
  using (true);
