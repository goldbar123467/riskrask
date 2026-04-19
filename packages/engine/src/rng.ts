export interface Rng {
  seed: string;
  cursor: number;
  state: number;
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: string): Rng {
  return { seed, cursor: 0, state: hash32(seed) };
}

function next(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  rng.cursor++;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(next(rng) * maxExclusive);
}

export function rollDie(rng: Rng): number {
  return nextInt(rng, 6) + 1;
}
