# Multiplayer Build-Out — Orchestration Overview

_Orchestrator: Mara Volkov (`persona.json`). Integration branch: `claude/multiplayer-subagent-build-dGa5z`._

## Mission

Deliver the remaining multiplayer features listed in `todo.md` → "Track F
follow-on (client + chat + tick)". The server-side foundation shipped in Sprint
2 (14 new files, 50 server tests). What is still open:

- Web client: real `ws.ts`, `protocol.ts` re-export, `useRoomDispatcher`, `Lobby.tsx`, `/lobby` + `/play/:roomId` routes.
- Server polish: chat persistence via `send_chat` RPC, `welcome` → `lastSeq` delta replay, `Database.Functions` types for room RPCs.
- Integration test covering the 2-human + AI-fallback flow end-to-end.

## Sub-agent roster (Opus 4.7, isolated worktrees)

| Agent | Scope                                                                                           | Branch                                   | Depends on |
| ----- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- |
| A     | Web WS client + protocol bridge + `useRoomDispatcher` + tests                                   | `claude/mp-agent-a-ws-client`            | —          |
| B     | `Lobby.tsx`, `/lobby` + `/play/:roomId` routing, `Play.tsx` dispatcher swap, room REST in api.ts | `claude/mp-agent-b-lobby-routing`        | A          |
| C     | Server chat persistence + welcome delta + `Database.Functions` types                            | `claude/mp-agent-c-server-polish`        | —          |
| D     | End-to-end multiplayer integration test (server-driven, real WS) + Playwright stub              | `claude/mp-agent-d-e2e`                  | A, B, C    |

A + C are independent and run in parallel. B depends on A's API surface. D
depends on all three.

## Gate pipeline (QA between sections)

Each gate must pass **before** the next agent is dispatched:

```
Gate 1  (A + C merged)
   ├── bun run typecheck      → 7/7 green
   ├── bun run test           → all existing tests + new ones pass
   ├── bun run lint           → 0 errors
   └── bun run scripts/smoke.ts → 982 actions, 0 errors, winner ≤ turn 20
   └── filter-test: NO REGRESSION in solo tests. If any existing test fails, the
                    agent's PR is rejected and a patch loop is opened.

Gate 2  (B merged)
   ├── [Gate 1 checks]
   └── filter-test: Lobby renders, no runtime React errors, routes resolve.

Gate 3  (D merged, full pipeline)
   ├── [Gate 1 checks]
   └── filter-test: integration test passes end-to-end.
```

## Guardrails every implementer follows

1. **Touch the smallest number of files.** No drive-by refactors.
2. **Do not break solo.** `apps/web/src/test/solo-playthrough.test.ts` must stay green.
3. **Zod at the boundary.** Incoming WS messages validate with `ServerMsgSchema` from `@riskrask/shared`; no `as ServerMsg`.
4. **Engine stays pure.** No I/O, no `Date.now()`, in `packages/engine` or `packages/ai`.
5. **Run typecheck + test + lint before reporting done.** If anything red, patch the author's own diff; do not hand a broken PR back.
6. **Scope-prefix commits** (`web:`, `server:`, `shared:`, `mp:`, `test:`, `docs:`).

## Success criteria (end of sprint)

- `bun run typecheck` 7/7 green.
- `bun run test` — **≥ 340 tests** (baseline 310 + ~30 new).
- `bun run lint` 0 errors.
- A human can navigate `/` → `/lobby`, create a room, copy a code, a second
  browser joins, both ready, host launches, `/play/:roomId` loads for both
  clients, and turn 1 plays. (Manual — full Playwright requires a Supabase
  test-JWT helper not yet in place.)
- Integration test drives a full 2-human + 1 AI turn loop with one human
  going AFK and AI fallback taking over.

## Known non-goals

- Tick edge function (`pg_cron`) — deferred to multi-instance deployment sprint.
- Playwright 2-browser scenario — stubbed with `.fixme()` pending JWT helper.
- Auth signup route with Turnstile — still open from original Track F Task 1.
