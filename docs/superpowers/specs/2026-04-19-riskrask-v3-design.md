# Riskrask v3 — Design

**Date:** 2026-04-19
**Author:** Claude (autonomous, per user directive)
**Status:** approved (autonomous mode — user delegated all design decisions)

## 1. Problem statement

`riskindex-v2-mobile.html` is a single 3,914-line HTML file. It contains a full Risk-like game, a Cold War aesthetic, and a sophisticated AI personality system (Archetypes, Personas, Voices, Rep, Grudges, Goals, Plans, Moods, Books, Rules, Regret, Band, Persist). It works, but:

- All state lives in one file and in `localStorage`. There is no type safety, no test coverage, no module boundaries.
- The client is fully authoritative: it rolls its own dice, computes reinforcements, and resolves combat locally. This is fine for solo but is an open cheat surface for multiplayer.
- There is no way to share a game, watch one, or run an admin view.

v3 is a ground-up rewrite in TypeScript that keeps the visual identity and the AI system but moves to a proper monorepo with server-authoritative state, share codes, multiplayer, and an admin panel.

## 2. Non-goals

- Real-money mechanics, matchmaking ELO/ranked ladder, or monetization.
- Native mobile builds. The web client must remain mobile-friendly, but no Capacitor/React Native.
- A new game design. We are porting mechanics 1:1 (same territories, same combat math, same AI catalog).
- Migrating existing v2 `localStorage` saves. v2 is frozen; v3 starts fresh.

## 3. Stack decisions

All decisions are final and made autonomously.

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` | One language across engine/client/server. |
| Package manager + runtime | Bun (workspaces, scripts, server runtime) | User requested Bun. Fast installs, native TS, native test runner, `bun serve` for prod. |
| Client bundler | Vite 5 | User requested Vite. Fast HMR, Rollup output. |
| Client framework | React 18 + TypeScript | Mature, fits the component model for SVG map + panels. No SSR needed. |
| Visual direction | **"Command Console"** — full-bleed dark app, single hot accent, muted faction palette (USA slate-blue, RUS signal-red, CHN amber, EU sage). Space Grotesk / JetBrains Mono / Inter. See `design/mockups/command-console.html` + screenshot. This supersedes v2's amber/crimson theater palette. |
| Client routing | React Router v6 | Only three routes (`/`, `/play/:roomId`, `/replay/:id`). |
| Client state | Zustand for local UI state; TanStack Query for server state + cache; a single WebSocket "game room" store subscribed via a custom hook | Avoids Redux boilerplate; WebSocket pushes feed Zustand; TanStack Query handles lobby/list/save codes. |
| Styling | Tailwind CSS + a small `theme.css` for the CSS variables already used in v2 | Preserves the Cold War palette (`--amber`, `--crimson`, `--sapphire`, etc.). Utility classes for everything new. No runtime CSS-in-JS. |
| Animation | Framer Motion for enter/exit, CSS keyframes for the existing pulse/shimmer effects | Keeps the look. |
| Map rendering | SVG React components with `react-zoom-pan-pinch` for mobile | v2 already uses SVG; no reason to switch to canvas/WebGL. |
| Server runtime | Bun 1.x | User requested. |
| Server framework | Hono (HTTP) + Hono's built-in WebSocket adapter on Bun | Hono runs natively on Bun, has typed routes, supports WebSockets, and is ~5KB. |
| Wire format | JSON with zod schemas shared via `packages/shared` | Same types on both ends. |
| Database | Supabase Postgres | User requested. Realtime + Auth come free. |
| Realtime | Supabase Realtime Postgres CDC for canonical room state; Supabase Broadcast for ephemeral events (dice animations, chat, cursor presence) | Matches the spec. Uses what's already in the Supabase stack. |
| Auth | Supabase Auth, email+password (email is optional — we use a synthetic `{username}@riskrask.local` email when the user opts out, and store the real username in `profiles`) | Satisfies the "username+password, optional email" requirement without writing a custom auth system. |
| Bot protection | Cloudflare Turnstile on signup and room creation | User requested. |
| Admin auth | Cloudflare Access on `admin.riskrask.com` | User requested. Separate from player login. |
| CDN / static hosting | Cloudflare Pages for `www.riskrask.com` and `admin.riskrask.com` | User requested. |
| Worker edge | Cloudflare Workers for rate limits (signup, room create, reconnect) + save-code URL shortener | User requested. |
| Game server hosting | Bun on Fly.io (one region primary + regions added as needed). Not Cloudflare — WebSocket Durable Objects were considered but rejected: we want one long-lived Bun process per room with in-memory state, reconciled to Postgres on each committed turn. Fly.io gives us that cheaply and supports WebSockets. | The existing v2 engine is mutable per-tick; reshaping it for DOs is more work than renting a small VM. |
| Test runner | Bun's built-in test runner for `packages/engine`, `packages/ai`, and `apps/server`; Vitest for `apps/web` and `apps/admin` (Vitest is the Vite-native choice and has better React Testing Library integration). | Mixed-runner is intentional — use each where it's strongest. |
| E2E | Playwright (chromium + mobile-chrome projects) | Covers the visual golden paths. |
| Linter / formatter | Biome (single binary, replaces ESLint + Prettier) | Fast. One config. |
| CI | GitHub Actions: typecheck, lint, unit, build, playwright headless | Table stakes. |

### 3.1 UI layout (Command Console)

The player client is a single full-bleed `grid-template-areas` app. Desktop target; mobile collapses the dossier into a bottom sheet.

```
┌──────┬────────────────────────────────────────────────┬──────────────┐
│brand │                topbar (56px)                   │              │
├──────┼────────────────────────────────────────────────┤              │
│      │                                                │              │
│ rail │                  stage (map)                   │   dossier    │
│(72px)│                                                │   (380px)    │
│      │                                                │              │
├──────┼────────────────────────────────────────────────┴──────────────┤
│      │                    statusbar (48px)                           │
└──────┴───────────────────────────────────────────────────────────────┘
```

- **Brand** (72×56): rotated-square logo mark.
- **Topbar** (right of brand): Session # · Turn · Phase · Clock · Player count · icon-buttons (mute, settings, exit).
- **Rail** (72px left column): vertical nav — MAP / ARMY / INTEL / DIPL / LOG / HELP.
- **Stage**: the map in its own SVG. Four corner HUDs (theatre / coordinates / legend / selected-callout), a phase-tab bar at top-center (Draft · Deploy · Attack · Fortify · End), and a zoom control at bottom-right. Map renders on top of `world.svg` landmass outline.
- **Dossier** (380px right column): scrollable sections — Commander card, phase hero (big headline + readouts + progress + Confirm/Cancel), Powers list with per-player chip+name+territories+armies+bar (me row subtly highlighted), Intel feed (last 4 turn events).
- **Statusbar**: LINK (connection), TICK (turn counter), LAT (ping), WINDOW (timer deadline in the "hot" accent), build tag.

### 3.2 Phase vocabulary

UI labels map to engine phases:

| UI label | Engine phase | Notes |
|---|---|---|
| 01 Draft | `reinforce` (card-trade step) | Optional; auto-skipped if no trade-in is possible |
| 02 Deploy | `reinforce` (placement step) | Pays armies onto owned territories |
| 03 Attack | `attack` | Single-roll or blitz |
| 04 Fortify | `fortify` | One move per turn |
| 05 End | `end-turn` dispatch | Confirm & advance |

Setup-phase screens (claim + initial placement) render outside the Console shell and drop into the shell once the game is live.

## 4. Repository layout

```
/
├── apps/
│   ├── web/                  # Vite + React player client
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── components/
│   │   │   ├── map/          # SVG territory components
│   │   │   ├── game/         # hooks that bind engine state to UI
│   │   │   ├── net/          # WebSocket client + reconnect
│   │   │   ├── store/        # Zustand stores
│   │   │   └── theme/
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── admin/                # Vite + React admin dashboard
│   │   └── src/
│   └── server/               # Bun + Hono game server
│       ├── src/
│       │   ├── http/         # REST endpoints
│       │   ├── ws/           # WebSocket room handlers
│       │   ├── rooms/        # in-memory room registry
│       │   ├── auth/         # Supabase JWT verification
│       │   ├── persistence/  # Supabase client + turn log writes
│       │   └── index.ts
│       └── Dockerfile
├── packages/
│   ├── engine/               # Pure game logic — no I/O, no DOM, no network
│   │   ├── src/
│   │   │   ├── board.ts      # CONTINENTS, TERR_DATA, ADJ_PAIRS
│   │   │   ├── state.ts      # GameState + actions
│   │   │   ├── combat.ts     # dice + resolve
│   │   │   ├── reinforce.ts
│   │   │   ├── fortify.ts
│   │   │   ├── cards.ts
│   │   │   ├── victory.ts
│   │   │   ├── rng.ts        # seedable RNG (server injects seed)
│   │   │   └── hash.ts       # state hash for desync detection
│   │   └── test/
│   ├── ai/                   # AI decision system (port of v2)
│   │   ├── src/
│   │   │   ├── arch.ts       # Archetype catalog
│   │   │   ├── persona.ts    # Weighted scoring + softmax
│   │   │   ├── voice.ts      # Narration packs
│   │   │   ├── rep.ts
│   │   │   ├── grudge.ts
│   │   │   ├── goal.ts
│   │   │   ├── plan.ts
│   │   │   ├── mood.ts
│   │   │   ├── book.ts       # Opening books
│   │   │   ├── rule.ts       # Mechanical asymmetry
│   │   │   ├── regret.ts
│   │   │   ├── band.ts       # Rubber-band
│   │   │   └── index.ts      # orchestrator: takeTurn(state, playerId) → Action[]
│   │   └── test/
│   └── shared/               # Types + zod schemas + constants shared everywhere
│       ├── src/
│       │   ├── protocol.ts   # WebSocket message discriminated unions
│       │   ├── saves.ts      # schema_version, save migrations
│       │   ├── saveCode.ts   # alphabet + regex + parse/format
│       │   └── types.ts
│       └── index.ts
├── supabase/
│   ├── migrations/           # numbered SQL
│   ├── functions/            # edge functions
│   │   ├── create-save/
│   │   ├── load-save/
│   │   └── generate-room-code/
│   ├── seed.sql
│   └── config.toml
├── infra/
│   └── cloudflare/
│       ├── workers/
│       │   ├── rate-limit/
│       │   └── save-redirect/
│       └── wrangler.toml
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── scripts/                  # dev convenience scripts
├── biome.json
├── bun.lockb
├── bunfig.toml
├── package.json              # workspaces: apps/*, packages/*
├── tsconfig.base.json
└── .github/workflows/ci.yml
```

## 5. Engine design (`packages/engine`)

The engine is **pure, deterministic, and reentrant**. It runs unchanged in the browser (solo mode), on the Bun server (authoritative multiplayer), and in Vitest/Bun-test (unit tests).

### 5.1 Core types

```ts
type TerritoryName = string; // nominal
type PlayerId = string & { __brand: "PlayerId" };

interface GameState {
  schemaVersion: 1;              // bump on any shape change
  seed: string;                  // RNG seed (server-generated in MP)
  rngCursor: number;             // monotonic — each die advances it
  turn: number;                  // 0-indexed absolute turn counter
  currentPlayerIdx: number;
  phase: Phase;                  // "setup-claim" | "setup-reinforce" | "reinforce" | "attack" | "fortify" | "done"
  players: PlayerState[];
  territories: Record<TerritoryName, TerritoryState>;
  deck: Card[];
  discard: Card[];
  tradeCount: number;            // for progressive trade-in values
  log: LogEntry[];
  pendingMove?: PendingMove;     // mid-attack move state
  pendingForcedTrade?: ForcedTrade;
  winner?: PlayerId;
}
```

Every mutation is a reducer: `apply(state, action) → { next: GameState; effects: Effect[] }`. Effects are serializable descriptions of animations/sounds the UI should play (`"dice-roll"`, `"territory-captured"`, etc.) — they never mutate state.

### 5.2 Action catalog

Exhaustive discriminated union — if you add an action you must add a case:

- `claim-territory` (setup)
- `setup-reinforce`
- `reinforce` (main reinforcement phase)
- `trade-cards`
- `attack` (single roll) / `attack-blitz` (roll-until-done)
- `move-after-capture`
- `end-attack-phase`
- `fortify`
- `end-turn`
- `concede`

### 5.3 RNG

`packages/engine/src/rng.ts` exposes a `mulberry32`-style seedable PRNG. The solo client generates a seed at game start; the server generates it server-side in multiplayer. Every die roll increments `state.rngCursor`; replays and desync detection depend on cursor equality.

### 5.4 Hash

`hashState(state)` returns a 16-char hex hash of `{turn, phase, players, territories, tradeCount, rngCursor}`. Players send the hash with each action in MP; mismatch triggers a resync.

### 5.5 Save migrations

`packages/shared/src/saves.ts` owns an ordered registry of migrations:

```ts
const migrations = [
  { from: 1, to: 2, run: (s) => ({ ...s, /* added rep matrix */ }) },
  { from: 2, to: 3, run: (s) => ({ ...s, /* added personality goals */ }) },
];
export function migrate(raw: unknown): GameState { /* walks registry until schemaVersion === CURRENT */ }
```

Any load path calls `migrate()` before handing state to the engine. A save created at v1 is playable at vN forever.

## 6. AI design (`packages/ai`)

Direct port of the v2 `Arch`, `Persona`, `Voice`, `Rep`, `Grudge`, `Goal`, `Plan`, `Mood`, `Book`, `Rule`, `Regret`, `Band`, `Persist` modules. The port is **structurally faithful** — same personalities, same weights, same voice packs — but:

- All modules export pure functions of `(state, playerId) → decision`.
- The orchestrator `takeTurn(state, playerId): Action[]` plays an entire AI turn and returns the action list. This is what the server calls when a human times out.
- Persistence (`Persist` in v2) becomes `profiles.arch_stats` JSONB in Postgres instead of `localStorage`.

## 7. Networking / multiplayer

### 7.1 Roles

- **Solo mode** runs the engine in the browser. No server, no network. Saves use the share-code path.
- **Multiplayer mode** uses the Bun server as the single source of truth. The server owns the `GameState`, runs the RNG, and broadcasts deltas.

### 7.2 WebSocket protocol

One WebSocket per room. Messages are zod-validated discriminated unions.

Client → server:

```ts
type ClientMsg =
  | { t: "join"; roomId: string; jwt: string }
  | { t: "intent"; roomId: string; action: Action; clientHash: string }
  | { t: "chat"; roomId: string; text: string }
  | { t: "heartbeat" };
```

Server → client:

```ts
type ServerMsg =
  | { t: "welcome"; room: RoomInfo; state: GameState; you: PlayerId }
  | { t: "applied"; action: Action; next: GameState; effects: Effect[]; hash: string; serverTurn: number }
  | { t: "rejected"; reason: string; action: Action }
  | { t: "chat"; from: PlayerId; text: string; ts: number }
  | { t: "timer"; playerId: PlayerId; deadlineMs: number; bankMs: number }
  | { t: "ai-takeover"; playerId: PlayerId; reason: "timeout" | "disconnect" }
  | { t: "game-over"; winner: PlayerId; finalState: GameState }
  | { t: "error"; code: string; detail?: string };
```

Clients render optimistically only for obviously-safe actions (card trade preview); all board-state changes are applied after the server's `applied` message.

### 7.3 Turn timer

Server enforces. 90s base + 15s rollover bank per player. When the current player's deadline expires:

1. Mark them inactive for this turn.
2. Hand control to `packages/ai.takeTurn(state, playerId)` with the player's personality (if they set one) or a neutral `dilettante` fallback.
3. Broadcast `ai-takeover` so clients show a subtle indicator.
4. If the player reconnects mid-turn, they reclaim control only on the next turn — we don't yank the AI mid-decision.

### 7.4 Disconnect handling

- ≤30s: room pauses that player's timer, shows "reconnecting" dot.
- >30s: AI takes over (same path as timeout).
- Indefinite: player can reconnect any time in the room's lifetime. If only AIs + 1 human remain, the game finishes normally and still records the result.

### 7.5 Desync detection

Each `applied` message carries the server's `hash`. Clients compute their own hash post-apply and send it on their next `intent`. Mismatch → server sends a full-state snapshot instead of a delta.

## 8. Data model (Supabase Postgres)

```sql
-- Users (managed by Supabase Auth) — we add a profiles side-table.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     citext unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  created_at   timestamptz not null default now(),
  banned       boolean not null default false,
  arch_stats   jsonb not null default '{}'::jsonb,
  player_stats jsonb not null default '{}'::jsonb
);

-- Share-code saves
create table saves (
  code            text primary key check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  state_json      jsonb not null,
  schema_version  int  not null,
  owner_id        uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz, -- null for account-linked saves; 30 days for anonymous
  last_loaded_at  timestamptz,
  load_count      int not null default 0
);
create index saves_owner_idx on saves (owner_id) where owner_id is not null;
create index saves_expires_idx on saves (expires_at) where expires_at is not null;

-- Rooms
create type room_state as enum ('lobby', 'active', 'finished', 'archived');
create table rooms (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null, -- 6-char invite code, same alphabet
  state          room_state not null default 'lobby',
  visibility     text not null check (visibility in ('public','private')),
  max_players    int  not null check (max_players between 2 and 6),
  host_id        uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  current_state  jsonb,      -- last committed GameState (nullable while lobby)
  schema_version int  not null default 1,
  winner_id      uuid references profiles(id),
  settings       jsonb not null default '{}'::jsonb
);
create index rooms_state_idx on rooms (state);
create index rooms_vis_state_idx on rooms (visibility, state) where state in ('lobby','active');

create table room_seats (
  room_id    uuid references rooms(id) on delete cascade,
  seat_idx   int  not null,
  user_id    uuid references profiles(id),
  is_ai      boolean not null default false,
  arch_id    text,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (room_id, seat_idx)
);

-- Turn log — one row per applied action, for replay + desync debugging
create table turn_events (
  room_id        uuid references rooms(id) on delete cascade,
  seq            bigint not null,
  turn           int  not null,
  actor_id       uuid,
  action         jsonb not null,
  resulting_hash text not null,
  server_ts      timestamptz not null default now(),
  primary key (room_id, seq)
);
create index turn_events_room_ts_idx on turn_events (room_id, server_ts);

-- Chat
create table room_messages (
  id        bigint generated always as identity primary key,
  room_id   uuid not null references rooms(id) on delete cascade,
  user_id   uuid references profiles(id),
  text      text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index room_messages_room_idx on room_messages (room_id, created_at desc);

-- Admin audit log
create table admin_actions (
  id        bigint generated always as identity primary key,
  admin_id  uuid not null,
  action    text not null,
  target    jsonb,
  created_at timestamptz not null default now()
);

-- Reserved words / bad username blocklist
create table reserved_usernames (username citext primary key);
```

RLS policies:

- `profiles`: user can read/update their own row; all authenticated users can read `{id, username, display_name}` (no sensitive cols).
- `saves`: owner can read/delete their own; anonymous saves are readable by anyone who knows the `code` (passed server-side via edge function, never a direct SELECT from the client).
- `rooms`, `room_seats`, `turn_events`, `room_messages`: all writes go through the Bun server using the service role. Clients can SELECT only rooms they're seated in. Realtime subscriptions are filtered by `room_id`.
- `admin_actions`: only the admin role can read/write.

## 9. Save codes

### 9.1 Alphabet & format

`SAVE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"` — 31 chars, Crockford-style, excludes `0 O 1 I L`. 8 chars → 31^8 ≈ 8.5 × 10¹¹ keyspace. Collision probability at 10⁶ saves ≈ 1.2 × 10⁻⁶ — trivial with a retry loop.

`SAVE_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/`. Case-insensitive input normalizes to uppercase; display formats as `XXXX-XXXX` for readability.

### 9.2 Generation

Server-side only — Postgres function called by the `create-save` edge function:

```sql
create or replace function generate_save_code() returns text
language plpgsql volatile as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  attempt  text;
  tries    int := 0;
begin
  loop
    attempt := '';
    for i in 1..8 loop
      attempt := attempt || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from saves where code = attempt) then
      return attempt;
    end if;
    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate unique save code';
    end if;
  end loop;
end $$;
```

### 9.3 URL loading

`https://riskrask.com/?save=XXXXXXXX` auto-loads on mount: decode → fetch via edge function → migrate → hand to engine. No auth required; anonymous saves are public-by-code. Account-linked saves require the owner's JWT (returned-to-owner UI shows the code only to the owner).

### 9.4 TTL sweep

A Supabase scheduled function runs nightly: `DELETE FROM saves WHERE expires_at < now()`. Anonymous saves default `expires_at = now() + interval '30 days'`. Account saves have `expires_at = null`.

## 10. Auth + signup

- Supabase Auth with email+password provider.
- Frontend `/signup` form takes `{username, password, email?, turnstile_token}`.
- If `email` is omitted, server generates `{username}@anon.riskrask.local` and stores `email_is_synthetic: true` in profile metadata. Passwords still hash the same way.
- Server verifies Turnstile token before creating the user.
- ToS blurb (from user's spec, condensed): "Be respectful. One account per person. No real-money stakes. We may ban for cheating, abuse, or ToS violations."
- Username is immutable after signup. Display name is editable.

## 11. Admin panel

- Deployed separately at `admin.riskrask.com` from `apps/admin`.
- Cloudflare Access enforces SSO (Google/GitHub/email-OTP as configured in CF). There is no password form.
- The admin app talks to the same Bun server but hits `/admin/*` routes gated by CF Access (the server verifies the `Cf-Access-Jwt-Assertion` header against CF's JWKS).
- Views:
  - **Dashboard:** concurrent players, active rooms, avg turn time (24h), disconnect rate (24h), AI-fallback rate (24h) — all backed by `turn_events` aggregates.
  - **Room list:** filter by state; click → **Room detail** (current board render, full turn log, chat log, **End Room** button).
  - **Users:** search, ban/unban, rename (display name only), session history.
  - **Balance:** per-personality win rate, game length histogram, per-continent flip rate.
  - **Audit log:** reverse-chron feed of `admin_actions`.

## 12. Replay + analytics

- Replay URL: `/replay/:roomId`. Loads `turn_events` in order and plays them through the engine client-side. No server involvement.
- Analytics are derived queries over `turn_events` + `rooms`. Exposed via admin only.
- No third-party analytics SDK. Server logs structured JSON to stdout; Fly.io captures it.

## 13. Error handling

- All server responses use `{ ok: true, data } | { ok: false, code, detail? }`. `code` is a stable enum (`e.g. SAVE_NOT_FOUND, SAVE_EXPIRED, ROOM_FULL, ACTION_INVALID, RATE_LIMITED, TURNSTILE_FAILED`).
- WebSocket errors emit `{ t: "error", code }` on the same socket — we never close the socket for a single bad frame.
- Client renders friendly messages from a code → string map. Unknown codes fall back to "Something went wrong — please retry."

## 14. Testing strategy

- **Engine:** exhaustive unit tests on every reducer. Known starting states + action sequences → expected resulting state + hash. Includes a "random-play" fuzz test (seeded) that runs 1,000 full games and asserts no invariant violations.
- **AI:** per-module tests (Persona softmax is deterministic given seed + weights), plus a golden-file test for each Archetype's turn on a fixed state.
- **Shared (saves):** every migration has a round-trip test (`migrate(v1 save) === expected v2 state`). CI fails if `CURRENT_SCHEMA_VERSION` bumps without a new migration entry.
- **Server:** integration tests that spin up an in-memory room, accept actions over an in-process WebSocket pair, and assert correct broadcasts.
- **Web:** Vitest + React Testing Library for hooks and components. Playwright for three golden flows: solo game start → win, save → reload from URL, multiplayer 2-human room with AI fallback.

## 15. Release plan

Staging Supabase project + Fly.io staging app + `staging.riskrask.com`. Prod is a separate Supabase project + Fly.io prod app + `riskrask.com`. Database migrations are applied to staging first, run against CI'd golden saves, then promoted.

## 16. Out of scope (v3)

- Spectator mode (replay covers it).
- Friend lists / DMs.
- Tournament bracket UI.
- i18n (English only).
- Mobile app stores.

## 17. Open assumptions (recorded, not blocking)

- Territories, adjacencies, and continent bonuses are copied 1:1 from v2. If v2 had any off-by-one or typo, it's frozen in v3 unless a test flags it.
- The v2 AI softmax temperature and weight constants are ported verbatim. Tuning is a post-launch concern.
- The starting-armies table (`{3:35, 4:30, 5:25, 6:20}`) stays. Two-player Risk is not supported in v3 either.
