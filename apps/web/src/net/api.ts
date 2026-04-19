import type { GameState } from '@riskrask/engine';

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; code: string; detail?: string };
type ApiResult<T> = ApiOk<T> | ApiErr;

const BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', detail: String(e) };
  }
}

async function get<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 404) return { ok: false, code: 'SAVE_NOT_FOUND' };
    if (res.status === 410) return { ok: false, code: 'SAVE_EXPIRED' };
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', detail: String(e) };
  }
}

export interface SaveResponse {
  code: string;
}

export interface LoadResponse {
  state: GameState;
}

/** POST /api/saves — creates a new save and returns the 8-char code */
export function createSave(state: GameState): Promise<ApiResult<SaveResponse>> {
  return post<SaveResponse>('/saves', { state });
}

/** GET /api/saves/:code — loads a save by code */
export function loadSave(code: string): Promise<ApiResult<LoadResponse>> {
  return get<LoadResponse>(`/saves/${code}`);
}
