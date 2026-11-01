import { redis } from './devvit-mock.js';
import { CODEX_STORAGE_VERSION } from '../shared/collection-storage.js';
import type { PlayerState } from '../shared/game.js';

const PLAYER_SAVE_CHUNK_PREFIX = 'io:player-save-chunk:';
export const PLAYER_SAVE_CHUNK_BYTES = 48 * 1024;
export const PLAYER_SAVE_INLINE_BYTES = 48 * 1024;
export const PLAYER_SAVE_MAX_CHUNKS = 192;
export const PLAYER_SAVE_MAX_BYTES = 8 * 1024 * 1024;
const PLAYER_SAVE_RETIRED_CHUNK_TTL_MS = 10 * 60_000;

type PlayerSaveProjection = {
  username?: string;
  lastSeenAt?: number;
  level?: number;
  xp?: number;
  totalRolls?: number;
  highestRarity?: number;
  coins?: number;
  shards?: number;
};

type PlayerSaveManifest = {
  __ioPlayerSaveManifest: 1;
  token: string;
  chunkCount: number;
  /** UTF-16 code-unit length, retained for compatibility with existing manifests. */
  length: number;
  byteLength?: number;
  checksum: string;
  projection: PlayerSaveProjection;
};

export type PlayerSaveWritePlan = { storedValue: string; chunkKeys: string[] };

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function securePlayerSaveToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return 'playersave-' + globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure player-save identifiers are unavailable.');
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return 'playersave-' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

export function serializePlayerStateForRedis(state: PlayerState): string {
  const persistedState = state.collectionStorageVersion === CODEX_STORAGE_VERSION
    ? Object.fromEntries(Object.entries(state).filter(([field]) => field !== 'collection'))
    : state;
  return JSON.stringify(persistedState);
}

function playerSaveChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parsePlayerSaveManifest(raw: string | null | undefined): PlayerSaveManifest | null {
  if (typeof raw !== 'string' || !raw.startsWith('{"__ioPlayerSaveManifest":1')) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const projection = value.projection && typeof value.projection === 'object' && !Array.isArray(value.projection)
      ? value.projection as PlayerSaveProjection
      : {};
    const token = String(value.token ?? '');
    const chunkCount = Number(value.chunkCount);
    const length = Number(value.length);
    const byteLength = value.byteLength === undefined ? undefined : Number(value.byteLength);
    const checksum = String(value.checksum ?? '');
    if (
      !/^[a-zA-Z0-9-]{8,120}$/.test(token) ||
      !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > PLAYER_SAVE_MAX_CHUNKS ||
      !Number.isSafeInteger(length) || length < 1 || length > PLAYER_SAVE_MAX_BYTES ||
      (byteLength !== undefined && (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > PLAYER_SAVE_MAX_BYTES)) ||
      !/^[a-f0-9]{8}$/.test(checksum)
    ) {
      throw new Error('Invalid player-save manifest.');
    }
    return { __ioPlayerSaveManifest: 1, token, chunkCount, length, byteLength, checksum, projection };
  } catch (error) {
    console.error('[Player Save] Invalid chunk manifest:', error);
    throw new Error('Your Infinity Orbs save index could not be read safely.');
  }
}

function playerSaveChunkKey(userId: string, token: string, index: number): string {
  return PLAYER_SAVE_CHUNK_PREFIX + userId + ':' + token + ':' + index;
}

export async function readStoredPlayerSave(
  userId: string,
  storedValue: string | null | undefined,
): Promise<string | null> {
  if (storedValue == null) return null;
  const manifest = parsePlayerSaveManifest(storedValue);
  if (!manifest) return storedValue;

  const keys = Array.from(
    { length: manifest.chunkCount },
    (_, index) => playerSaveChunkKey(userId, manifest.token, index),
  );
  const chunks: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 8) {
    const batch = await redis.mGet(keys.slice(offset, offset + 8));
    if (
      batch.length !== Math.min(8, keys.length - offset) ||
      batch.some(value => typeof value !== 'string')
    ) {
      throw new Error('Your Infinity Orbs save is missing a data chunk. No changes were applied.');
    }
    chunks.push(...batch as string[]);
  }

  const joined = chunks.join('');
  if (
    joined.length !== manifest.length ||
    (manifest.byteLength !== undefined && utf8ByteLength(joined) !== manifest.byteLength) ||
    playerSaveChecksum(joined) !== manifest.checksum
  ) {
    throw new Error('Your Infinity Orbs save failed its integrity check. No changes were applied.');
  }
  return joined;
}

function splitUtf8Chunks(serialized: string): string[] {
  const bytes = new TextEncoder().encode(serialized);
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  for (let offset = 0; offset < bytes.length;) {
    let end = Math.min(bytes.length, offset + PLAYER_SAVE_CHUNK_BYTES);
    // Never split a UTF-8 sequence. The first excluded byte is moved back to
    // the sequence's lead byte so the next chunk starts on a character boundary.
    if (end < bytes.length) {
      while (end > offset && (bytes[end] & 0xc0) === 0x80) end -= 1;
    }
    if (end <= offset) throw new Error('Player save contains an invalid UTF-8 chunk boundary.');
    chunks.push(decoder.decode(bytes.subarray(offset, end)));
    offset = end;
  }
  return chunks;
}

export async function createPlayerSaveWritePlan(
  userId: string,
  serialized: string,
): Promise<PlayerSaveWritePlan> {
  const byteLength = utf8ByteLength(serialized);
  if (byteLength <= PLAYER_SAVE_INLINE_BYTES) return { storedValue: serialized, chunkKeys: [] };
  if (byteLength > PLAYER_SAVE_MAX_BYTES) {
    throw new Error('Player save exceeds the supported 8 MiB logical size. No changes were written.');
  }

  const chunks = splitUtf8Chunks(serialized);
  if (chunks.length > PLAYER_SAVE_MAX_CHUNKS) {
    throw new Error('Player save requires too many Redis records. No changes were written.');
  }

  const token = securePlayerSaveToken();
  const chunkKeys = chunks.map((_, index) => playerSaveChunkKey(userId, token, index));
  let written = 0;
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      await redis.set(chunkKeys[index], chunks[index]);
      written += 1;
    }
  } catch (error) {
    await Promise.all(chunkKeys.slice(0, written).map(keyName => redis.del(keyName).catch(() => undefined)));
    throw error;
  }

  let projection: PlayerSaveProjection = {};
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
  } catch {
    // Chunk bytes remain authoritative; this projection is for admin lists only.
  }

  const manifest: PlayerSaveManifest = {
    __ioPlayerSaveManifest: 1,
    token,
    chunkCount: chunks.length,
    length: serialized.length,
    byteLength,
    checksum: playerSaveChecksum(serialized),
    projection,
  };
  return { storedValue: JSON.stringify(manifest), chunkKeys };
}

export async function discardPlayerSaveWritePlan(plan: PlayerSaveWritePlan): Promise<void> {
  await Promise.all(plan.chunkKeys.map(keyName => redis.del(keyName).catch(() => undefined)));
}

export async function cleanupPreviousPlayerSave(
  userId: string,
  previousRaw: string | null | undefined,
): Promise<void> {
  const previous = parsePlayerSaveManifest(previousRaw);
  if (!previous) return;
  const expiration = new Date(Date.now() + PLAYER_SAVE_RETIRED_CHUNK_TTL_MS);
  const ttlSeconds = Math.ceil(PLAYER_SAVE_RETIRED_CHUNK_TTL_MS / 1_000);
  for (let index = 0; index < previous.chunkCount; index += 1) {
    const keyName = playerSaveChunkKey(userId, previous.token, index);
    try {
      // Prefer changing expiry metadata over resending a legacy 64 KiB chunk
      // through SET, which could itself exceed the platform request ceiling.
      if (typeof redis.expire === 'function') {
        await redis.expire(keyName, ttlSeconds);
      } else {
        const chunk = await redis.get(keyName);
        if (typeof chunk === 'string') await redis.set(keyName, chunk, { expiration });
      }
    } catch (error) {
      console.warn('[Player Save] Previous chunk could not be retired; it remains readable:', error);
    }
  }
}

export function playerSaveProjection(raw: string | null | undefined): Partial<PlayerState> | null {
  if (raw == null) return null;
  const manifest = parsePlayerSaveManifest(raw);
  if (manifest) return manifest.projection as Partial<PlayerState>;
  try {
    return JSON.parse(raw) as Partial<PlayerState>;
  } catch {
    return null;
  }
}
