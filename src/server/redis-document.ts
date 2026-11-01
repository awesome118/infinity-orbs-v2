import { redis } from './devvit-mock.js';

const REDIS_DOCUMENT_CHUNK_PREFIX = 'io:document-chunk:';
export const REDIS_DOCUMENT_CHUNK_CHARS = 64 * 1024;
export const REDIS_DOCUMENT_INLINE_CHARS = 192 * 1024;
export const REDIS_DOCUMENT_MAX_CHUNKS = 256;
export const REDIS_DOCUMENT_MAX_CHARS = REDIS_DOCUMENT_CHUNK_CHARS * REDIS_DOCUMENT_MAX_CHUNKS;
const REDIS_DOCUMENT_RETIRED_TTL_MS = 10 * 60_000;

interface RedisDocumentManifest {
  __ioRedisDocumentManifest: 1;
  token: string;
  chunkCount: number;
  length: number;
  checksum: string;
}
export interface RedisDocumentWritePlan {
  storedValue: string;
  chunkKeys: string[];
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createDocumentToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure Redis document identifiers are unavailable.');
}

function parseManifest(raw: string | null | undefined): RedisDocumentManifest | null {
  if (typeof raw !== 'string' || !raw.startsWith('{"__ioRedisDocumentManifest":1')) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = String(parsed.token ?? '');
    const chunkCount = Number(parsed.chunkCount);
    const length = Number(parsed.length);
    const digest = String(parsed.checksum ?? '');
    if (!/^[a-zA-Z0-9-]{8,120}$/.test(token) ||
        !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > REDIS_DOCUMENT_MAX_CHUNKS ||
        !Number.isSafeInteger(length) || length < 1 || length > REDIS_DOCUMENT_MAX_CHARS ||
        !/^[a-f0-9]{8}$/.test(digest)) {
      throw new Error('Invalid Redis document manifest.');
    }
    return { __ioRedisDocumentManifest: 1, token, chunkCount, length, checksum: digest };
  } catch (error) {
    console.error('[Redis Document] Invalid chunk manifest:', error);
    throw new Error('A shared game-data index could not be read safely.');
  }
}

function chunkKey(documentKey: string, token: string, index: number): string {
  return REDIS_DOCUMENT_CHUNK_PREFIX + encodeURIComponent(documentKey) + ':' + token + ':' + index;
}

export async function readRedisDocument(
  documentKey: string,
  storedValue: string | null | undefined,
): Promise<string | null> {
  if (storedValue == null) return null;
  const manifest = parseManifest(storedValue);
  if (!manifest) return storedValue;
  const keys = Array.from(
    { length: manifest.chunkCount },
    (_, index) => chunkKey(documentKey, manifest.token, index),
  );
  const chunks: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 8) {
    const expected = Math.min(8, keys.length - offset);
    const batch = await redis.mGet(keys.slice(offset, offset + 8));
    if (batch.length !== expected || batch.some(value => typeof value !== 'string')) {
      throw new Error('A shared game-data record is missing a required chunk. No changes were applied.');
    }
    chunks.push(...batch as string[]);
  }
  const joined = chunks.join('');
  if (joined.length !== manifest.length || checksum(joined) !== manifest.checksum) {
    throw new Error('A shared game-data record failed its integrity check. No changes were applied.');
  }
  return joined;
}

export async function createRedisDocumentWritePlan(
  documentKey: string,
  serialized: string,
): Promise<RedisDocumentWritePlan> {
  if (serialized.length <= REDIS_DOCUMENT_INLINE_CHARS) {
    return { storedValue: serialized, chunkKeys: [] };
  }
  if (serialized.length > REDIS_DOCUMENT_MAX_CHARS) {
    throw new Error('Shared game data exceeds the supported 16 MiB logical size. No changes were written.');
  }
  const token = createDocumentToken();
  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length;) {
    let end = Math.min(serialized.length, offset + REDIS_DOCUMENT_CHUNK_CHARS);
    if (end < serialized.length && serialized.charCodeAt(end - 1) >= 0xd800 &&
        serialized.charCodeAt(end - 1) <= 0xdbff) end -= 1;
    chunks.push(serialized.slice(offset, end));
    offset = end;
  }
  if (chunks.length > REDIS_DOCUMENT_MAX_CHUNKS) {
    throw new Error('Shared game data requires too many Redis chunks. No changes were written.');
  }
  const chunkKeys = chunks.map((_, index) => chunkKey(documentKey, token, index));
  let written = 0;
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      await redis.set(chunkKeys[index], chunks[index]);
      written += 1;
    }
  } catch (error) {
    await Promise.all(chunkKeys.slice(0, written).map(key => redis.del(key).catch(() => undefined)));
    throw error;
  }
  const manifest: RedisDocumentManifest = {
    __ioRedisDocumentManifest: 1,
    token,
    chunkCount: chunks.length,
    length: serialized.length,
    checksum: checksum(serialized),
  };
  return { storedValue: JSON.stringify(manifest), chunkKeys };
}

export async function discardRedisDocumentWritePlan(plan: RedisDocumentWritePlan): Promise<void> {
  if (plan.chunkKeys.length) {
    await Promise.all(plan.chunkKeys.map(key => redis.del(key).catch(() => undefined)));
  }
}

export async function cleanupPreviousRedisDocument(
  documentKey: string,
  previousValue: string | null | undefined,
): Promise<void> {
  const previous = parseManifest(previousValue);
  if (!previous) return;
  const expiration = new Date(Date.now() + REDIS_DOCUMENT_RETIRED_TTL_MS);
  for (let index = 0; index < previous.chunkCount; index += 1) {
    const key = chunkKey(documentKey, previous.token, index);
    try {
      const chunk = await redis.get(key);
      if (typeof chunk === 'string') await redis.set(key, chunk, { expiration });
    } catch (error) {
      console.warn('[Redis Document] Previous chunk could not be retired; it remains readable:', error);
    }
  }
}
