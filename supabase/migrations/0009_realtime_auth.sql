-- Migration 0009: authorize Realtime private-channel subscriptions via
-- RLS on realtime.messages.
--
-- Topic conventions (T16):
--   room:{room_id}   -- lobby / chat / presence
--   game:{game_id}   -- game state / turn events / dice
--
-- Private channels are opt-in on the client (config.private = true);
-- the dashboard flag "Allow public access" must be off for these
-- policies to be the only gate. Without these policies, every
-- subscribe on a private channel returns CHANNEL_ERROR.

-- =============================================================
-- room:{room_id}
-- Active seats (left_at IS NULL) can read AND write broadcasts/presence.
-- Past seats lose the ability to send into the room channel when they
-- leave; that's intentional.
-- =============================================================
create policy "realtime: read room channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.room_seats rs
       where 'room:' || rs.room_id::text = (select realtime.topic())
         and rs.user_id = auth.uid()
         and rs.left_at is null
    )
  );

create policy "realtime: write room channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.room_seats rs
       where 'room:' || rs.room_id::text = (select realtime.topic())
         and rs.user_id = auth.uid()
         and rs.left_at is null
    )
  );

-- =============================================================
-- game:{game_id}
-- Read: anyone ever seated in the parent room. That lets a player
-- whose seat went AI continue to watch the game finish.
-- Write: only active seats in the parent room.
-- =============================================================
create policy "realtime: read game channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1
        from public.games g
        join public.room_seats rs on rs.room_id = g.room_id
       where 'game:' || g.id::text = (select realtime.topic())
         and rs.user_id = auth.uid()
    )
  );

create policy "realtime: write game channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1
        from public.games g
        join public.room_seats rs on rs.room_id = g.room_id
       where 'game:' || g.id::text = (select realtime.topic())
         and rs.user_id = auth.uid()
         and rs.left_at is null
    )
  );
