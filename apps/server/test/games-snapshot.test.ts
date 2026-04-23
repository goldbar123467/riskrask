import { describe, expect, it } from 'bun:test';
import { GameSnapshotWriter } from '../src/persistence/games';

function makeFakeClient(log: unknown[]) {
  return {
    from(_table: string) {
      return {
        update(row: unknown) {
          return {
            eq(_col: string, _val: string) {
              log.push(row);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as never;
}

describe('GameSnapshotWriter', () => {
  it('coalesces rapid queue calls into one write', async () => {
    const log: unknown[] = [];
    const client = makeFakeClient(log);
    const writer = new GameSnapshotWriter(client, { debounceMs: 10 });
    for (let i = 0; i < 5; i++) {
      writer.queue({
        gameId: 'g1',
        state: { i },
        turnNumber: i,
        turnPhase: 'attack',
        lastHash: `h${i}`,
      });
    }
    await writer.flush('g1');
    expect(log.length).toBe(1);
    expect((log[0] as { turn_number: number }).turn_number).toBe(4);
  });

  it('writeNow bypasses debounce', async () => {
    const log: unknown[] = [];
    const client = makeFakeClient(log);
    const writer = new GameSnapshotWriter(client, { debounceMs: 10_000 });
    await writer.writeNow({
      gameId: 'g1',
      state: {},
      turnNumber: 1,
      turnPhase: 'reinforce',
      lastHash: 'h',
    });
    expect(log.length).toBe(1);
    writer.shutdown();
  });
});
