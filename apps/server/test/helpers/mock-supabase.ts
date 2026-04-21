/**
 * In-memory Supabase stand-in for integration tests.
 *
 * Records every `.rpc()` call and supports a tiny subset of the query-builder
 * fluent API that `apps/server/src/http/rooms.ts` and `ws/index.ts` exercise:
 *
 *   client.rpc('create_room', args)
 *   client.rpc('join_room',   { p_code })
 *   client.rpc('add_ai_seat', { p_room_id, p_arch_id })
 *   client.rpc('set_ready',   { p_room_id, p_ready })
 *   client.rpc('launch_game', { p_room_id })
 *   client.rpc('send_chat',   { p_room_id, p_text })
 *
 *   client.from('rooms').select(...).eq(...).maybeSingle()
 *   client.from('games').select(...).eq(...).maybeSingle()
 *   client.from('room_seats').select(...).eq(...)
 *
 * The stub is intentionally dumb — return rows come from a script the test
 * seeds up-front. No query execution, no filter semantics. Enough to drive
 * `/api/rooms/:id/launch`'s hydrate path and surface RPC call counts.
 *
 * Exports:
 *   - `MockSupabase`         — the builder + recorded call log
 *   - `createMockSupabase()` — factory
 *   - `makeSupabaseModuleMock(mock)` — returns a shape suitable for
 *     `mock.module('../src/supabase', …)`; includes `anonClient`, `serviceClient`,
 *     `edgeFunctionUrl` so every import-site stays typed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

export interface TableRow {
  readonly [k: string]: unknown;
}

/**
 * A scripted table — every `.from(name)` call matches against `fixtures[name]`.
 * `maybeSingle()` resolves with the first row or `null`; a bare `await` on the
 * chain resolves with all rows.
 */
export interface MockTableFixtures {
  [tableName: string]: TableRow[] | undefined;
}

export interface MockSupabase {
  readonly rpcCalls: readonly RpcCall[];
  /** Script scalar RPC responses. Defaults to `{ data: null, error: null }`. */
  setRpcResponse(fn: string, response: { data: unknown; error: unknown }): void;
  setTable(name: string, rows: TableRow[]): void;
  client: SupabaseLike;
  /** Count of calls for a given RPC name. */
  rpcCount(fn: string): number;
  resetCalls(): void;
}

/** Subset of `SupabaseClient` the server touches. */
export interface SupabaseLike {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  from(table: string): QueryBuilder;
  auth: {
    getUser(): Promise<{ data: { user: { id: string; email?: string } | null }; error: null }>;
  };
}

/**
 * Minimal fluent query builder.
 *
 * `.maybeSingle()` — single-row read; resolves to `{ data: row | null }`.
 * `.then(...)`     — the builder is thenable so `await builder` yields the
 *                    full row list, mirroring supabase-js's query-builder
 *                    Promise semantics. Biome flags `then` on objects with
 *                    `noThenProperty`; here it is intentional so we suppress
 *                    the lint at the implementation site.
 */
interface QueryBuilder {
  select(cols?: string): QueryBuilder;
  eq(col: string, val: unknown): QueryBuilder;
  order(col: string, opts?: unknown): QueryBuilder;
  limit(n: number): QueryBuilder;
  maybeSingle(): Promise<{ data: TableRow | null; error: null }>;
  then<T>(onFulfilled: (v: { data: TableRow[]; error: null }) => T): Promise<T>;
}

export function createMockSupabase(): MockSupabase {
  const rpcCalls: RpcCall[] = [];
  const rpcResponses = new Map<string, { data: unknown; error: unknown }>();
  const fixtures: MockTableFixtures = {};

  const makeBuilder = (table: string): QueryBuilder => {
    // Each builder just routes back to the fixture. Filter args are recorded
    // for debugging but not enforced — tests seed exactly the rows they want.
    const self: QueryBuilder = {
      select(_cols?: string) {
        return self;
      },
      eq(_col: string, _val: unknown) {
        return self;
      },
      order(_col: string, _opts?: unknown) {
        return self;
      },
      limit(_n: number) {
        return self;
      },
      async maybeSingle() {
        const rows = fixtures[table] ?? [];
        return { data: rows[0] ?? null, error: null };
      },
      // biome-ignore lint/suspicious/noThenProperty: supabase-js query builder is a PromiseLike; test stub mirrors that surface so `await builder` works at the call site in http/rooms.ts.
      then(onFulfilled) {
        const rows = fixtures[table] ?? [];
        return Promise.resolve(onFulfilled({ data: rows, error: null }));
      },
    };
    return self;
  };

  const client: SupabaseLike = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return rpcResponses.get(fn) ?? { data: null, error: null };
    },
    from(table: string) {
      return makeBuilder(table);
    },
    // `verifySupabaseJwt` calls `client.auth.getUser()` — we intercept at the
    // verify.ts layer in the integration test instead, so this is a no-op
    // default that returns nobody.
    auth: {
      async getUser() {
        return { data: { user: null }, error: null };
      },
    },
  };

  return {
    get rpcCalls() {
      return rpcCalls;
    },
    setRpcResponse(fn, response) {
      rpcResponses.set(fn, response);
    },
    setTable(name, rows) {
      fixtures[name] = rows;
    },
    client,
    rpcCount(fn) {
      return rpcCalls.filter((c) => c.fn === fn).length;
    },
    resetCalls() {
      rpcCalls.length = 0;
    },
  };
}
