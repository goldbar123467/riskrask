# Track H — Replay + Analytics Plan

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** `/replay/:roomId` in `apps/web`; aggregate analytics in admin.

**Worktree:** `.claude/worktrees/track-h-replay`.

---

## Tasks

### Task 1: Replay fetcher

- [ ] `GET /api/rooms/:id/replay` streams `turn_events` in order. Public for `finished` rooms; private rooms require being a prior seat.
- [ ] Tests.

### Task 2: Replay player UI

- [ ] `Replay.tsx`: loads events, builds the initial state from the first `turn_events` row + `rooms.settings`, then applies actions step by step.
- [ ] Playback controls: play/pause, step forward, step back (requires state snapshots every N turns — insert snapshot rows in `turn_events` with `action: { t: 'snapshot' }`).
- [ ] Speed: 1x / 2x / 4x.

### Task 3: Desync debug view (admin)

- [ ] Admin can load any room's replay with hash-diff overlay.

### Task 4: Analytics queries

- [ ] Materialized view `mv_personality_winrates` refreshed hourly.
- [ ] `mv_game_length_histogram`.
- [ ] `mv_continent_flip_rate`.

### Task 5: Commit

```
replay: server-side turn streaming + client playback + balance MVs

- /replay/:roomId client with play/pause/step
- Periodic snapshot rows in turn_events for step-back
- Materialized views feed Balance admin page

Ref: docs/superpowers/specs/2026-04-19-riskrask-v3-design.md §12
```
