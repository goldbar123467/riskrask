-- Migration 0006: RLS helper predicates.
--
-- These functions are SECURITY DEFINER so they bypass RLS on the tables
-- they query. That is important: if they ran under the caller's RLS,
-- a membership check on room_seats from a policy ON room_seats would
-- recurse. Keeping the reads inside a definer function breaks the cycle.
--
-- search_path is pinned to public to defeat search-path attacks (the
-- CVE-2018-1058 pattern) and grants are locked down to authenticated.

-- =============================================================
-- is_room_member: currently-seated (left_at IS NULL) in the room
-- =============================================================
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from room_seats
     where room_id = p_room_id
       and user_id = auth.uid()
       and left_at is null
  );
$$;

-- =============================================================
-- is_room_host: caller is the current host of the room
-- =============================================================
create or replace function public.is_room_host(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from rooms
     where id = p_room_id
       and host_id = auth.uid()
  );
$$;

-- =============================================================
-- was_room_member: ever seated (includes left seats)
-- Needed so a player whose seat went AI can still read turn_events /
-- room_messages / games history for the rooms they played.
-- =============================================================
create or replace function public.was_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from room_seats
     where room_id = p_room_id
       and user_id = auth.uid()
  );
$$;

-- =============================================================
-- Permissions: revoke default PUBLIC, grant only to authenticated.
-- =============================================================
revoke all on function public.is_room_member(uuid)  from public;
revoke all on function public.is_room_host(uuid)    from public;
revoke all on function public.was_room_member(uuid) from public;

grant execute on function public.is_room_member(uuid)  to authenticated;
grant execute on function public.is_room_host(uuid)    to authenticated;
grant execute on function public.was_room_member(uuid) to authenticated;
