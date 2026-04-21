-- Migration 0007: per-game rows.
--
-- A room cycles many games. Keeping per-game identity in its own table
-- means:
--   - turn_events can scope to a single game (replay, desync debugging)
--   - rooms.current_game_id flips each cycle; historical games survive
--   - game.schema_version is bumpable without a rooms rewrite
-- state is JSONB, opaque to the DB (engine-canonical shape).

-- =============================================================
-- Status enum
-- =============================================================
create type game_status as enum ('active', 'ended', 'aborted');

-- =============================================================
-- games
-- =============================================================
create table games (
  id                     uuid primary key default gen_random_uuid(),
  room_id                uuid not null references rooms(id) on delete cascade,
  game_index             int  not null,
  status                 game_status not null default 'active',
  schema_version         int  not null default 1,
  state                  jsonb not null,
  players                jsonb not null,
  current_turn_user_id   uuid,
  current_turn_seat_idx  int,
  turn_number            int  not null default 1,
  turn_phase             text not null
                         check (turn_phase in (
                           'setup-claim',
                           'setup-reinforce',
                           'reinforce',
                           'attack',
                           'fortify',
                           'victory'
                         )),
  phase_ends_at          timestamptz,
  winner_user_id         uuid references profiles(id),
  last_hash              text,
  started_at             timestamptz not null default now(),
  ended_at               timestamptz,
  result                 jsonb,
  unique (room_id, game_index)
);

comment on column games.players is
  '[{user_id, seat_idx, color, arch_id, is_ai, eliminated, display_name, ...}]';
comment on column games.state is
  'Engine GameState. Opaque to the DB. Versioned by schema_version.';
comment on column games.last_hash is
  'SHA-256 of canonicalized state after the most recent applied move.';

create index games_room_idx
  on games (room_id);

create index games_active_phaseend_idx
  on games (status, phase_ends_at)
  where status = 'active';

create index games_room_index_desc_idx
  on games (room_id, game_index desc);

-- =============================================================
-- Back-reference from rooms to the currently active game.
-- The column was added in 0005; add the FK now that games exists.
-- =============================================================
alter table rooms
  add constraint rooms_current_game_fk
  foreign key (current_game_id) references games(id) on delete set null;

-- =============================================================
-- turn_events -> games.
-- Pre-v3 rows (if any) could not map to a game, so we delete them
-- before tightening the column. The app never wrote turn_events before
-- this migration, so in practice this is a no-op.
-- =============================================================
delete from turn_events where game_id is null;

alter table turn_events
  add constraint turn_events_game_fk
  foreign key (game_id) references games(id) on delete cascade;

alter table turn_events
  alter column game_id set not null;

create index if not exists turn_events_game_seq_idx
  on turn_events (game_id, seq);
