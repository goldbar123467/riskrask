/**
 * Unit coverage for `createGame.ts`.
 *
 * We mock the Supabase client as a hand-rolled stub that records every
 * call. `createInitialState` from the engine is exercised for real —
 * there's no value in faking it, and asserting on the resulting GameState
 * shape catches regressions in the seat→PlayerConfig bridge.
 */

import { beforeAll, describe, expect, test } from 'bun:test';

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://stub.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-stub-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'anon-stub-key';
});

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aiPlayerIdForSeat,
  insertGameRow,
  seatIdxFromAiPlayerId,
  seatsToPlayerConfigs,
  seatsToPlayersJson,
  type SeatRow,
} from '../src/rooms/createGame';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function seats6HumanPlusAi(): SeatRow[] {
  return [
    { seat_idx: 0, user_id: 'u-alice', is_ai: false, arch_id: null },
    { seat_idx: 1, user_id: 'u-bob', is_ai: false, arch_id: null },
    { seat_idx: 2, user_id: null, is_ai: true, arch_id: 'napoleon' },
    { seat_idx: 3, user_id: null, is_ai: true, arch_id: 'dilettante' },
    { seat_idx: 4, user_id: null, is_ai: true, arch_id: 'jackal' },
    { seat_idx: 5, user_id: null, is_ai: true, arch_id: 'fortress' },
  ];
}

// ---------------------------------------------------------------------------
// Supabase stub
// ---------------------------------------------------------------------------

interface RecordedCall {
  readonly table: string;
  readonly op: 'select' | 'insert' | 'update';
  readonly payload?: unknown;
  readonly filters?: Record<string, unknown>;
}

interface StubConfig {
  /** Pre-canned rows for `.select('game_index').eq('room_id',...)` */
  readonly existingGames?: Array<{ game_index: number }>;
  /** Id returned for the `insert().select().single()` chain */
  readonly insertedId?: string;
  /** Force an error on a specific op. */
  readonly failOn?: { table: 'games' | 'rooms'; op: 'select' | 'insert' | 'update' };
}

function makeStubClient(cfg: StubConfig = {}): {
  client: SupabaseClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const insertedId = cfg.insertedId ?? 'game-uuid-1';

  function selectBuilder(table: 'games' | 'rooms') {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    builder.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    };
    builder.order = () => builder;
    builder.limit = async () => {
      calls.push({ table, op: 'select', filters: { ...filters } });
      if (cfg.failOn?.table === table && cfg.failOn.op === 'select') {
        return { data: null, error: { message: 'select boom' } };
      }
      return { data: cfg.existingGames ?? [], error: null };
    };
    return builder;
  }

  function insertBuilder(table: 'games' | 'rooms', payload: unknown) {
    calls.push({ table, op: 'insert', payload });
    return {
      select: () => ({
        single: async () => {
          if (cfg.failOn?.table === table && cfg.failOn.op === 'insert') {
            return { data: null, error: { message: 'insert boom' } };
          }
          return { data: { id: insertedId }, error: null };
        },
      }),
    };
  }

  function updateBuilder(table: 'games' | 'rooms', payload: unknown) {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    builder.eq = async (col: string, val: unknown) => {
      filters[col] = val;
      calls.push({ table, op: 'update', payload, filters });
      if (cfg.failOn?.table === table && cfg.failOn.op === 'update') {
        return { data: null, error: { message: 'update boom' } };
      }
      return { data: null, error: null };
    };
    return builder;
  }

  const from = (table: string) => ({
    select: (_cols: string) => selectBuilder(table as 'games' | 'rooms'),
    insert: (payload: unknown) => insertBuilder(table as 'games' | 'rooms', payload),
    update: (payload: unknown) => updateBuilder(table as 'games' | 'rooms', payload),
  });

  const client = { from } as unknown as SupabaseClient;
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('aiPlayerIdForSeat / seatIdxFromAiPlayerId', () => {
  test('forward + inverse are consistent', () => {
    for (const i of [0, 1, 2, 3, 4, 5]) {
      expect(seatIdxFromAiPlayerId(aiPlayerIdForSeat(i))).toBe(i);
    }
  });

  test('non-ai playerId returns null', () => {
    expect(seatIdxFromAiPlayerId('user-uuid-abc')).toBeNull();
    expect(seatIdxFromAiPlayerId('seat-x-ai')).toBeNull();
  });
});

describe('seatsToPlayerConfigs', () => {
  test('humans use user_id as engine playerId; AI uses seat-derived id', () => {
    const configs = seatsToPlayerConfigs(seats6HumanPlusAi());
    expect(configs).toHaveLength(6);
    expect(configs[0]?.id).toBe('u-alice');
    expect(configs[0]?.isAI).toBe(false);
    expect(configs[1]?.id).toBe('u-bob');
    expect(configs[2]?.id).toBe('seat-2-ai');
    expect(configs[2]?.isAI).toBe(true);
    expect(configs[2]?.name).toBe('napoleon');
    expect(configs[5]?.id).toBe('seat-5-ai');
    expect(configs[5]?.name).toBe('fortress');
  });

  test('unsorted input is sorted by seat_idx before mapping', () => {
    const scrambled: SeatRow[] = [
      { seat_idx: 3, user_id: null, is_ai: true, arch_id: 'napoleon' },
      { seat_idx: 0, user_id: 'u-a', is_ai: false, arch_id: null },
      { seat_idx: 1, user_id: 'u-b', is_ai: false, arch_id: null },
    ];
    const configs = seatsToPlayerConfigs(scrambled);
    expect(configs.map((c) => c.id)).toEqual(['u-a', 'u-b', 'seat-3-ai']);
  });

  test('each config gets a palette color', () => {
    const configs = seatsToPlayerConfigs(seats6HumanPlusAi());
    for (const c of configs) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // Uniqueness is a strong signal the palette indexing is working.
    expect(new Set(configs.map((c) => c.color)).size).toBe(6);
  });
});

describe('seatsToPlayersJson', () => {
  test('produces one row per seat with player_id matching configs', () => {
    const seats = seats6HumanPlusAi();
    const configs = seatsToPlayerConfigs(seats);
    const json = seatsToPlayersJson(seats, configs) as Array<Record<string, unknown>>;
    expect(json).toHaveLength(6);
    expect(json[2]?.is_ai).toBe(true);
    expect(json[2]?.arch_id).toBe('napoleon');
    expect(json[2]?.player_id).toBe('seat-2-ai');
    expect(json[0]?.user_id).toBe('u-alice');
    expect(json[0]?.is_ai).toBe(false);
    expect(json[0]?.player_id).toBe('u-alice');
  });
});

// ---------------------------------------------------------------------------
// insertGameRow — integration-ish with the stub client
// ---------------------------------------------------------------------------

describe('insertGameRow', () => {
  const ROOM_ID = 'room-uuid-abc';

  test('inserts games row with game_index=1 on first launch', async () => {
    const { client, calls } = makeStubClient({ existingGames: [], insertedId: 'new-game-id' });
    const res = await insertGameRow(client, ROOM_ID, seats6HumanPlusAi(), 12345);

    expect(res.gameId).toBe('new-game-id');
    expect(res.state.phase).toBe('setup-claim');
    expect(res.state.players).toHaveLength(6);
    expect(res.state.seed).toBe('12345');

    // Expect: select games (count), insert games, update rooms.
    expect(calls.length).toBe(3);
    expect(calls[0]).toMatchObject({ table: 'games', op: 'select' });
    expect(calls[1]).toMatchObject({ table: 'games', op: 'insert' });
    expect(calls[2]).toMatchObject({
      table: 'rooms',
      op: 'update',
      payload: { current_game_id: 'new-game-id' },
      filters: { id: ROOM_ID },
    });

    const insertPayload = calls[1]?.payload as Record<string, unknown>;
    expect(insertPayload.room_id).toBe(ROOM_ID);
    expect(insertPayload.game_index).toBe(1);
    expect(insertPayload.status).toBe('active');
    expect(insertPayload.schema_version).toBe(1);
    expect(insertPayload.turn_number).toBe(1);
    expect(insertPayload.turn_phase).toBe('setup-claim');
    expect(Array.isArray(insertPayload.players)).toBe(true);
    expect(insertPayload.state).toBeDefined();
  });

  test('picks max(game_index)+1 when a prior game exists', async () => {
    const { client, calls } = makeStubClient({
      existingGames: [{ game_index: 4 }],
      insertedId: 'g5',
    });
    await insertGameRow(client, ROOM_ID, seats6HumanPlusAi(), 1);

    const insertPayload = calls[1]?.payload as Record<string, unknown>;
    expect(insertPayload.game_index).toBe(5);
  });

  test('throws on fewer than 2 seats', async () => {
    const { client } = makeStubClient();
    const oneSeat: SeatRow[] = [{ seat_idx: 0, user_id: 'u', is_ai: false, arch_id: null }];
    await expect(insertGameRow(client, ROOM_ID, oneSeat)).rejects.toThrow(/>= 2 seats/);
  });

  test('propagates supabase insert error', async () => {
    const { client } = makeStubClient({ failOn: { table: 'games', op: 'insert' } });
    await expect(insertGameRow(client, ROOM_ID, seats6HumanPlusAi(), 1)).rejects.toThrow(
      /games insert failed/,
    );
  });

  test('propagates rooms update error', async () => {
    const { client } = makeStubClient({
      insertedId: 'g1',
      failOn: { table: 'rooms', op: 'update' },
    });
    await expect(insertGameRow(client, ROOM_ID, seats6HumanPlusAi(), 1)).rejects.toThrow(
      /current_game_id update failed/,
    );
  });

  test('state.players mirrors seats in order (2 humans + 4 AI)', async () => {
    const { client } = makeStubClient({ existingGames: [], insertedId: 'g' });
    const { state } = await insertGameRow(client, ROOM_ID, seats6HumanPlusAi(), 99);
    expect(state.players.map((p) => p.id)).toEqual([
      'u-alice',
      'u-bob',
      'seat-2-ai',
      'seat-3-ai',
      'seat-4-ai',
      'seat-5-ai',
    ]);
    expect(state.players[2]?.isAI).toBe(true);
    expect(state.players[0]?.isAI).toBe(false);
  });
});
