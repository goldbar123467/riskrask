# Self-learned — 2026-04-22 session

_Session shipped S3 (launch + turn loop + end-of-game) and S4 (lobby UX
polish) end-to-end: 4 parallel Opus 4.7 subagents in worktrees, 4 new
migrations (0018–0021), deployed to VPS + Cloudflare Workers. Below are
the lessons I actually learned, ranked by how much pain future-me saves
by remembering them._

## 1. Worktree base drift is real

`isolation: worktree` created agents on two different base commits in
the same dispatch batch. S3 Agent 2 and S4 Agent B branched from
`39e2701` (a week-old ancestor of my working HEAD), while S3 Agent 1
and S4 Agent A branched from the expected `5e8d013` / `8c7d9a8`.

The stale-base branches still cherry-picked cleanly because the files
they touched (`Room.ts`, `registry.ts`, `PlayRoom.tsx`) didn't overlap
with recent HEAD commits — but `packages/shared/src/protocol.ts`
conflicted because both agents independently added the same new
schemas. **Action:** always check `git log --oneline <agent-branch> -3`
before merging and flag stale bases. For shared files, assign ONE
owner in the prompt.

## 2. Postgres `CREATE OR REPLACE FUNCTION` does not replace across
## signatures

Adding `p_name` to `create_room` in migration 0016 created a second
overload, not a replacement. The 3-arg version was still callable for
weeks and would have silently bypassed later guards. Migration 0017
had to `DROP FUNCTION IF EXISTS public.create_room(text, int, jsonb)`
explicitly.

**Action:** whenever an RPC signature changes, the migration must
explicitly drop the old signature. Never rely on `CREATE OR REPLACE`
to handle it.

## 3. Response-shape mismatches are invisible to unit tests

The server was returning flat `{ok, rooms}` for months while the
client expected `{ok, data: {rooms}}` and all 51 web tests passed
because the fixtures defined the expected shape. `result.data.rooms`
threw at runtime inside async `useEffect` — silently swallowed.

**Action:** for any server↔client contract, add ONE integration test
that hits the real server route with a real fetch and asserts the
shape. Mocked unit tests don't catch contract drift.

## 4. "Dormant bug" pattern: features the user hasn't fully exercised

Today's session surfaced four pre-existing bugs that had never been
hit because no one had reached that point in the flow:

- `add_ai_seat` RPC whitelist had 4 stale archetype IDs for weeks
  (`default, zhukov, sun, bonaparte`) that didn't match the 9 TS
  archetype IDs.
- `GET /api/rooms/:id` never returned `host_id` since multiplayer
  landed, so `isHost` was always false and LAUNCH never rendered.
- WS router was mounted at `/` serving `/ws/:roomId`, but client
  connected to `/api/ws/:roomId` — silent 404s.
- `launch_game` RPC had a `≥ 2 seats` gate that blocked solo-host
  launches.

**Action:** before shipping a new feature layer, smoke-test the FULL
upstream pipeline (auth → create → launch → WS welcome → render) in
a real browser, not just curl.

## 5. "One more fix" is a warning sign

Tonight needed four iterative "last fix" commits before bedtime
(`29b152d` → `5e8d013` → `d17fb80` → hydrate). Each was a real bug —
not wasted work — but the pattern means we didn't do a full
end-to-end smoke test before claiming "shipped."

**Action:** at the end of a deploy pass, run the full user flow in a
browser with devtools open. "Tests green + curl shows 200" is not the
same as "it works."

## 6. Scout for function, not just for names

Scout 1 mapped the game engine, AI orchestrator, and WS surface —
returned "VictoryModal works" and "AI orchestrator works." Scout 3
went deeper (functional readiness, test counts) — still didn't catch
that the `/api/ws/:roomId` path was unreachable because he didn't
actually open a WS connection.

**Action:** readiness audits should include "connect to the real
endpoint and watch a frame land," not just "read the handler."

## 7. Stale-base cherry-pick with uncommitted worktree changes

One agent left its entire working tree unstaged ("don't push"
interpreted as "don't commit"). I had to `git add -A && git commit`
in its worktree before cherry-picking. Prompts need unambiguous
language — "commit your work in logical chunks; do not push to
origin."

## 8. Docker restart ⇒ in-memory registry wiped

In-memory `Room` instances die on every server redeploy. Rooms in DB
with `state='active'` become un-connectable unless there's a
re-hydrate path. Tonight's fix: `ensureHydrated(roomId)` in the WS
handler rebuilds the in-memory Room from the persisted games row on
first connect. Idempotent. Pattern is reusable for any stateful
in-memory subsystem backed by persistent tables.

## 9. Belt-and-suspenders on cascades is cheap

S4 Agent A audited FK cascades before the delete-room RPC. Found
every FK already had `ON DELETE CASCADE`. Added explicit
per-child-table `DELETE FROM` calls in the RPC anyway. Defense in
depth — negligible cost, protects against schema regressions.

## 10. Parallel planning during background agents is a pure win

While 3 agents ran in background, I used the time to plan S4 and
write its spec. Kept momentum. Zero token contention. Do this more.
