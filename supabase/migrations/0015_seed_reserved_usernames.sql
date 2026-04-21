-- Migration 0015: seed the reserved_usernames blocklist.
-- The client signUp path checks this table for fast feedback; the
-- profiles.username check constraint is the authoritative guard.
-- Extend freely; `on conflict ... do nothing` keeps this idempotent.

insert into reserved_usernames (username) values
  -- Operational / generic
  ('admin'), ('administrator'), ('root'), ('system'),
  ('null'), ('undefined'), ('none'),
  ('riskrask'), ('staff'), ('mod'), ('moderator'),
  ('support'), ('help'), ('contact'),
  ('anonymous'), ('guest'), ('user'), ('player'),
  ('test'), ('demo'),
  -- AI archetype display names
  ('zhukov'), ('sun'), ('bonaparte'), ('vance')
on conflict (username) do nothing;
