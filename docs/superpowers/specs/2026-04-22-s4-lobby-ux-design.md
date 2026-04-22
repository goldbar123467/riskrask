# S4 — Lobby UX polish

_Author: Claude Opus 4.7 · Date: 2026-04-22 · Scope: S4_

Three small discrete improvements to the pre-launch lobby surface.
Independent of S3 mechanically — can land and deploy after S3 merges.

## Goal

Make the pre-launch lobby legible and frictionless for testing:

1. Clear visual answer to "which seat am I?" with real display names.
2. Confirm-before-leave flow; auto-delete the room when the last human
   exits a lobby; transfer host to the next human seat if a host leaves
   with others still in the room.
3. Host can LAUNCH with only themselves in the room (S3's autofill
   takes care of filling the empty seats with AI).

## Non-goals

- Kicking other players (host-action). Separate future feature.
- Changing the room-code UX, map preview, or chat.
- Mid-game leave handling — remains a concede through the engine;
  unchanged.
- Room invitations / direct-link joining. Already works via code.
- Host "close the room" button for rooms with other humans in them.
  For now only the last-human-leaves path deletes a room.

## Locked decisions

All three open questions from the brainstorm resolved in favour of
the more thorough option (user approved 2026-04-22):

1. **Display-name fallback chain:** `profiles.display_name` →
   `profiles.username` → email (from JWT `email` claim) → first 8
   chars of the user UUID.
2. **Host transfer on leave:** if host exits with ≥1 other human seat
   remaining, `rooms.host_id` transfers to the **lowest seat_idx
   human with `left_at IS NULL`**. If the leaver was the last human,
   the room is deleted regardless of host status.
3. **Modal primitive:** new inline `ConfirmDialog` component, ~40
   LOC, no external modal library. Lives at
   `apps/web/src/components/ConfirmDialog.tsx`. Reused for any future
   confirm flow.

## Data model changes

### Migration `0020_leave_room_cleanup.sql`

Rewrite `leave_room(p_room_id uuid)` RPC (originally in 0011).
Everything the old version does stays; append two new side-effects
inside the same transaction:

```
after UPDATE room_seats SET left_at = now() WHERE room_id = p_room_id
                                              AND user_id = v_uid
                                              AND left_at IS NULL:

1. If rooms.state = 'lobby' for this room, count remaining active
   humans:
       count = (SELECT COUNT(*) FROM room_seats
                 WHERE room_id = p_room_id
                   AND user_id IS NOT NULL
                   AND left_at IS NULL)

2. If count = 0:
       DELETE FROM rooms WHERE id = p_room_id;
       (cascade drops room_seats, games, chat_messages — verify CASCADE
        exists on the existing FKs before relying on it; if not, add
        explicit DELETEs in the RPC body.)
       RETURN ( room_deleted := TRUE, new_host_id := NULL ).

3. ELSE IF the leaver was the host (rooms.host_id = v_uid):
       next_host := (SELECT user_id FROM room_seats
                      WHERE room_id = p_room_id
                        AND user_id IS NOT NULL
                        AND left_at IS NULL
                      ORDER BY seat_idx ASC LIMIT 1);
       UPDATE rooms SET host_id = next_host WHERE id = p_room_id;
       RETURN ( room_deleted := FALSE, new_host_id := next_host ).

4. ELSE:
       RETURN ( room_deleted := FALSE, new_host_id := NULL ).
```

Change `leave_room`'s return type from `void` to a composite:

```sql
CREATE TYPE leave_room_result AS (
  room_deleted BOOLEAN,
  new_host_id  UUID
);
```

(Or return as a `returns table(...)` — whichever is easier to consume
from `supabase-js`. If `returns table` — PostgREST exposes it as a
1-row array; server unwraps.)

End with `NOTIFY pgrst, 'reload schema';`.

### Cascade audit

Read migrations for the FK definitions between `rooms` → `room_seats`
/ `games` / `chat_messages`. If any lack `ON DELETE CASCADE`, either
add the cascade in 0020 or do explicit DELETEs in the RPC before the
`DELETE FROM rooms`. This is a prerequisite — landing 0020 without
cascade handling means the final DELETE fails with a FK violation and
the RPC aborts.

## Server changes

- **`apps/server/src/http/rooms.ts` `POST /:id/leave`** — surface the
  new fields from `leave_room`:
  ```
  return c.json({
    ok: true,
    data: { roomDeleted: Boolean, newHostId: string | null }
  }, 200);
  ```
  Existing `data: {}` callers continue to work (ignore new fields).

- **No other server changes.** The display-name resolution happens
  client-side via the existing auth/profile API.

## Client changes

### `apps/web/src/components/ConfirmDialog.tsx` (new)

Small controlled overlay. Props:
```
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string | ReactNode;
  confirmLabel?: string;   // default "Confirm"
  cancelLabel?: string;    // default "Cancel"
  dangerous?: boolean;     // flips confirm button to danger styling
  onConfirm(): void;
  onCancel(): void;
}
```
Styled to match the existing panel / border / font-mono aesthetic.
Traps focus, ESC cancels, click-outside cancels. No portal needed —
position fixed with a backdrop div.

### `apps/web/src/net/api.ts`

Update `leaveRoom` return type from `ApiResult<Record<string, never>>`
to:
```
ApiResult<{ roomDeleted: boolean; newHostId: string | null }>
```

### `apps/web/src/routes/Lobby.tsx`

- **`ActiveRoomPanel`** — resolve `myDisplayName`:
  - Add a lightweight profile fetch on first render: `fetchMyProfile(token)` → `{ displayName, username, email }`. One-time, cached in `useAuth` store or local ref (prefer `useAuth` so other panels benefit).
  - If profile response missing `displayName`, fall back through `username` → email (from JWT `email` claim via existing `useAuth`) → `userId.slice(0,8)…`.
  - Pass `currentUserId` + seat-idx → display-name map into `SeatRow`.
- **`SeatRow`** — if `seat.userId === currentUserId`:
  - Prefix name with `(YOU) ` badge or wrap row with accent classes (`border-hot bg-hot/5`).
  - For everyone else (human), display the resolved display name instead of UUID-slice. Requires the name map or per-row profile lookup — prefer server-side enrichment on `GET /api/rooms/:id` (cheaper: one JOIN on profiles, ship the display name per seat on the detail payload). **Scope call:** server-side enrichment is cleaner; add it to the `GET /:id` select (JOIN `profiles` on `room_seats.user_id`). If that feels invasive, punt to client-side per-seat fetch (N round-trips). Default: **server-side enrichment**.
- **Header** — add a line under the room code: `Seated as #{mySeatIdx}` when `mySeat` exists.
- **Launch gate** — change `canLaunch`:
  ```
  // before
  const canLaunch = isHost && filledSeats >= 2 && allReady && room.state === 'lobby';
  // after
  const canLaunch = isHost && filledSeats >= 1 && allReady && room.state === 'lobby';
  ```
  The `allReady` clause is satisfied trivially for a solo host because
  `every((s) => s.isAi || s.ready)` over one non-AI host who hasn't
  clicked Ready is still false — verify by reading the ready-list
  logic. If solo hosts can't mark themselves ready today (ready
  toggle is gated on `!isHost`), we need either: (a) remove the
  `!isHost` clause from the ready toggle, (b) auto-mark host as
  ready when they're alone, or (c) drop `allReady` from `canLaunch`
  entirely. **Default: (c) drop `allReady`.** The host's click on
  LAUNCH is the ready signal. Update helper text:
  `"Ready up — AI will fill empty seats."`
- **Leave-confirm flow** — wrap existing `leave-btn` click:
  - Compute `soloHuman`: count seats where `userId && !isAi && left_at===null` from the seat list; `soloHuman = count === 1 && mySeat`.
  - Show `ConfirmDialog` with `title = soloHuman ? "Close this lobby?" : "Leave this room?"`, `body = soloHuman ? "You're the only player — leaving will delete the room." : "The lobby will remain open for the other players."`, `dangerous = soloHuman`.
  - On confirm → call `leaveRoom(...)`; on `data.roomDeleted === true` → toast "Lobby closed" via a simple state flag, then navigate. On `data.newHostId !== null && newHostId === currentUserId` → no special UI (shouldn't happen on your own leave). Otherwise regular leave flow.

### `apps/web/src/net/auth.ts`

Add `displayName: string | null` field to the auth store, populated
on token-set via a `/api/profile/me` fetch (new endpoint — or reuse
an existing Supabase-side query if available). Keep null-safe
fallbacks everywhere.

> **Check first:** the server may already expose `/api/profile` — grep
> before inventing. If not, add it (trivial: `SELECT display_name,
> username FROM profiles WHERE id = auth.uid()`).

## Tests

- `apps/web/src/components/ConfirmDialog.test.tsx` — open/close,
  ESC cancels, confirm/cancel buttons, backdrop-click cancels.
- `apps/web/src/routes/Lobby.test.tsx` —
  - Seat row shows `(YOU)` on the current user's seat.
  - Room header shows `Seated as #N` when the user holds a seat.
  - Solo 1-human-host sees enabled LAUNCH button.
  - Leave button → ConfirmDialog visible with the "solo / not solo"
    copy switching on the seat count.
  - Confirm with a mocked server that returns `{roomDeleted: true}`
    → navigate called.
- Migration test (in `supabase/tests/` if the test dir exists, else
  a throwaway SQL block in a review checklist):
  - Solo leave → room gone.
  - Non-host leaves with others → `new_host_id` null, room stays.
  - Host leaves with others → `new_host_id = next seat's user_id`.
  - Active-state leave (`state='active'`) → no delete, no host
    transfer (behaves like today).

## Risks

1. **FK cascade gaps.** If `games` / `chat_messages` / `room_seats`
   FKs don't cascade, DELETE room fails. Mitigate: audit first; add
   explicit DELETEs or `ALTER TABLE ... ON DELETE CASCADE` in 0020.
2. **Display name privacy.** `profiles.display_name` may be set by
   users to something they want shown; if not set, the username
   fallback exposes the canonical handle. Acceptable for MVP. Don't
   surface email.
3. **Race: two players leave simultaneously.** Both RPC calls see the
   room with 1 remaining human; one succeeds in deleting, the other
   errors on "room not found." Mitigate: server catches FK / 404
   errors from the RPC and treats them as `roomDeleted: true` from
   the client's perspective (they wanted to leave; it's gone).
4. **Host transfer to a just-left seat.** Only consider seats where
   `left_at IS NULL`. The UPDATE on the leaver's own seat happens
   BEFORE the host-transfer query, so the leaver is correctly
   excluded by the SQL.
5. **Client forgets to invalidate profile cache on sign-out.** Add
   `clearDisplayName()` to the sign-out path in `useAuth`.

## MVP implementation order

1. **Migration 0020 draft + cascade audit** — write SQL; inspect FK
   definitions; add cascade or explicit deletes if needed. Apply
   locally; run the 4 migration cases manually via the Management
   API.
2. **Server `/leave` response surface** — new `data.roomDeleted /
   newHostId` fields.
3. **Launch gate relaxation** — one-line change in Lobby.tsx; gains
   immediate solo-testing benefit. Ship standalone.
4. **Profile fetch + auth store `displayName`** — new `/api/profile/me`
   route (if none); `useAuth` store update; null-safe consumers.
5. **Server-side display-name enrichment on `GET /:id`** — add
   profile JOIN to the select.
6. **"YOU" badge + `Seated as` header** — consume enriched seats.
7. **ConfirmDialog component** — self-contained; unit-test.
8. **Leave-confirm flow** — wire ConfirmDialog into leave-btn; show
   solo-vs-multi copy; handle `roomDeleted` response with a toast
   and navigate.
9. **Tests** — Lobby.test.tsx additions; ConfirmDialog.test.tsx;
   migration smoke tests.
10. **Deploy** — migration first, then server, then web.

Sequencing note: deploy **after** S3 lands so Lobby.tsx merges stay
clean. Steps 1–2 can be done ahead (they're server/DB only, no UI
conflict). Steps 3–8 bundle into one web rebuild.
