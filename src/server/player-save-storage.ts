import { redis } from './devvit-mock.js';
import { CODEX_STORAGE_VERSION } from '../shared/collection-storage.js';
import type { PlayerState } from '../shared/game.js';

const PLAYER_SAVE_CHUNK_PREFIX = 'io:player-save-chunk:';
const PLAYER_SAVE_CHUNK_CHARS = 64 * 1024;
const PLAYER_SAVE_INLINE_CHARS = 192 * 1024;
const PLAYER_SAVE_MAX_CHUNKS = 128;
const PLAYER_SAVE_MAX_CHARS = PLAYER_SAVE_CHUNK_CHARS * PLAYER_SAVE_MAX_CHUNKS;

type PlayerSaveManifest = {
  __ioPlayerSaveManifest: 1;
  token: string;
  chunkCount: number;
  length: number;
  checksum: string;
  projection: {
    username?: string; lastSeenAt?: number; level?: number; xp?: number;
    totalRolls?: number; highestRarity?: number; coins?: number; shards?: number;
  };
};

export type PlayerSaveWritePlan = { storedValue: string; chunkKeys: string[] };

function createPlayerSaveToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return 'playersave-' + cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return 'playersave-' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure player-save identifiers are unavailable.');
}

export function serializePlayerStateForRedis(state: PlayerState): string {
  const persistedState = state.collectionStorageVersion === CODEX_STORAGE_VERSION
    ? Object.fromEntries(Object.entries(state).filter(([field]) => field !== 'collection'))
    : state;
  return JSON.stringify(persistedState);
}

const PLAYER_SAVE_CHUNK_PREFIX = 'io:player-save-chunk:';
const PLAYER_SAVE_CHUNK_CHARS = 64 * 1024;
const PLAYER_SAVE_INLINE_CHARS = 192 * 1024;
const PLAYER_SAVE_MAX_CHUNKS = 128;
const PLAYER_SAVE_MAX_CHARS = PLAYER_SAVE_CHUNK_CHARS * PLAYER_SAVE_MAX_CHUNKS;
type PlayerSaveManifest = {
  __ioPlayerSaveManifest: 1;
  token: string;
  chunkCount: number;
  length: number;
  checksum: string;
  projection: {
    username?: string; lastSeenAt?: number; level?: number; xp?: number;
    totalRolls?: number; highestRarity?: number; coins?: number; shards?: number;
  };
};
type PlayerSaveWritePlan = { storedValue: string; chunkKeys: string[] };

function playerSaveChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function parsePlayerSaveManifest(raw: string | null | undefined): PlayerSaveManifest | null {
  if (typeof raw !== 'string' || !raw.startsWith('{"__ioPlayerSaveManifest":1')) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const projection = value.projection && typeof value.projection === 'object' && !Array.isArray(value.projection)
      ? value.projection as PlayerSaveManifest['projection'] : {};
    const token = String(value.token ?? '');
    const chunkCount = Number(value.chunkCount);
    const length = Number(value.length);
    const checksum = String(value.checksum ?? '');
    if (!/^[a-zA-Z0-9-]{8,120}$/.test(token) ||
        !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > PLAYER_SAVE_MAX_CHUNKS ||
        !Number.isSafeInteger(length) || length < 1 || length > PLAYER_SAVE_MAX_CHARS ||
        !/^[a-f0-9]{8}$/.test(checksum)) throw new Error('Invalid player-save manifest.');
    return { __ioPlayerSaveManifest: 1, token, chunkCount, length, checksum, projection };
  } catch (error) {
    console.error('[Player Save] Invalid chunk manifest:', error);
    throw new Error('Your Infinity Orbs save index could not be read safely.');
  }
}
function playerSaveChunkKey(userId: string, token: string, index: number): string {
  return PLAYER_SAVE_CHUNK_PREFIX + userId + ':' + token + ':' + index;
}
export async function readStoredPlayerSave(userId: string, storedValue: string | null | undefined): Promise<string | null> {
  if (storedValue == null) return null;
  const manifest = parsePlayerSaveManifest(storedValue);
  if (!manifest) return storedValue;
  const keys = Array.from({ length: manifest.chunkCount }, (_, index) => playerSaveChunkKey(userId, manifest.token, index));
  const chunks: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 8) {
    const batch = await redis.mGet(keys.slice(offset, offset + 8));
    if (batch.length !== Math.min(8, keys.length - offset) || batch.some(value => typeof value !== 'string')) {
      throw new Error('Your Infinity Orbs save is missing a data chunk. No changes were applied.');
    }
    chunks.push(...batch as string[]);
  }
  const joined = chunks.join('');
  if (joined.length !== manifest.length || playerSaveChecksum(joined) !== manifest.checksum) {
    throw new Error('Your Infinity Orbs save failed its integrity check. No changes were applied.');
  }
  return joined;
}
export async function createPlayerSaveWritePlan(userId: string, serialized: string): Promise<PlayerSaveWritePlan> {
  if (serialized.length <= PLAYER_SAVE_INLINE_CHARS) return { storedValue: serialized, chunkKeys: [] };
  if (serialized.length > PLAYER_SAVE_MAX_CHARS) {
    throw new Error('Player save exceeds the supported 8 MiB logical size. No changes were written.');
  }
  const token = createPlayerSaveToken();
  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length;) {
    let end = Math.min(serialized.length, offset + PLAYER_SAVE_CHUNK_CHARS);
    if (end < serialized.length && serialized.charCodeAt(end - 1) >= 0xd800 && serialized.charCodeAt(end - 1) <= 0xdbff) end -= 1;
    chunks.push(serialized.slice(offset, end));
    offset = end;
  }
  if (chunks.length > PLAYER_SAVE_MAX_CHUNKS) throw new Error('Player save requires too many Redis records. No changes were written.');
  const chunkKeys = chunks.map((_, index) => playerSaveChunkKey(userId, token, index));
  let written = 0;
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      await redis.set(chunkKeys[index], chunks[index]);
      written += 1;
    }
  } catch (error) {
    for (const keyName of chunkKeys.slice(0, written)) await redis.del(keyName).catch(() => undefined);
    throw error;
  }
  let projection: PlayerSaveManifest['projection'] = {};
  try {
    const state = JSON.parse(serialized) as Partial<PlayerState>;
    projection = {
      ...(typeof state.username === 'string' ? { username: state.username.slice(0, 100) } : {}),
      ...(Number.isFinite(state.lastSeenAt) ? { lastSeenAt: Number(state.lastSeenAt) } : {}),
      ...(Number.isFinite(state.level) ? { level: Number(state.level) } : {}),
      ...(Number.isFinite(state.xp) ? { xp: Number(state.xp) } : {}),
      ...(Number.isFinite(state.totalRolls) ? { totalRolls: Number(state.totalRolls) } : {}),
      ...(Number.isFinite(state.highestRarity) ? { highestRarity: Number(state.highestRarity) } : {}),
      ...(Number.isFinite(state.coins) ? { coins: Number(state.coins) } : {}),
      ...(Number.isFinite(state.shards) ? { shards: Number(state.shards) } : {}),
    };
  } catch { /* chunk bytes remain authoritative; the projection is for admin lists only */ }
  const manifest: PlayerSaveManifest = {
    __ioPlayerSaveManifest: 1, token, chunkCount: chunks.length,
    length: serialized.length, checksum: playerSaveChecksum(serialized), projection,
  };
  return { storedValue: JSON.stringify(manifest), chunkKeys };
}
export async function discardPlayerSaveWritePlan(plan: PlayerSaveWritePlan): Promise<void> {
  for (const keyName of plan.chunkKeys) await redis.del(keyName).catch(() => undefined);
}
const PLAYER_SAVE_RETIRED_CHUNK_TTL_MS = 10 * 60_000;
export async function cleanupPreviousPlayerSave(userId: string, previousRaw: string | null | undefined): Promise<void> {
  const previous = parsePlayerSaveManifest(previousRaw);
  if (!previous) return;
  const expiration = new Date(Date.now() + PLAYER_SAVE_RETIRED_CHUNK_TTL_MS);
  for (let index = 0; index < previous.chunkCount; index += 1) {
    const keyName = playerSaveChunkKey(userId, previous.token, index);
    try {
      const chunk = await redis.get(keyName);
      if (typeof chunk === 'string') await redis.set(keyName, chunk, { expiration });
    } catch (error) {
      console.warn('[Player Save] Previous chunk could not be retired; it remains readable:', error);
    }
  }
}
export function playerSaveProjection(raw: string | null | undefined): Partial<PlayerState> | null {
  if (raw == null) return null;
  const manifest = parsePlayerSaveManifest(raw);
  return manifest ? manifest.projection as Partial<PlayerState> : parseStoredJson<Partial<PlayerState>>(raw);
}
