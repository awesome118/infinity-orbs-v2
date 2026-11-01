import { redis } from './devvit-mock.js';

const LARGE_VALUE_CHUNK_PREFIX = 'io:large-value-chunk:v1:';
const LARGE_VALUE_CHUNK_BYTES = 48 * 1024;
const LARGE_VALUE_INLINE_BYTES = 48 * 1024;
const LARGE_VALUE_MAX_CHUNKS = 192;
const LARGE_VALUE_MAX_BYTES = 8 * 1024 * 1024;
// Previous releases used 64 KiB character chunks and a 192 KiB inline threshold.
// Retain these bounds only when reading their manifests.
const LEGACY_LARGE_VALUE_CHUNK_CHARS = 64 * 1024;
const LEGACY_LARGE_VALUE_INLINE_CHARS = 192 * 1024;
const LEGACY_LARGE_VALUE_MAX_CHARS = LEGACY_LARGE_VALUE_CHUNK_CHARS * 128;
const LARGE_VALUE_RETIRED_TTL_SECONDS = 10 * 60;

type LargeValueManifest = {
  __ioLargeValueManifest: 1;
  namespaceHash: string;
  token: string;
  chunkCount: number;
  /** UTF-16 code-unit length, compatible with existing manifests. */
  length: number;
  /** Present on new byte-bounded manifests; absent on legacy manifests. */
  byteLength?: number;
  checksum: string;
};

export type RedisLargeValueWritePlan = {
  storedValue: string;
  chunkKeys: string[];
};

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function checksum(value: string): string {
  return hashText(value);
}

function secureLargeValueToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure Redis chunk identifiers are unavailable.');
}

function parseLargeValueManifest(
  namespaceKey: string,
  raw: string | null | undefined,
): LargeValueManifest | null {
  if (typeof raw !== 'string' || !raw.startsWith('{"__ioLargeValueManifest":1')) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const byteLength = value.byteLength === undefined ? undefined : Number(value.byteLength);
    const manifest: LargeValueManifest = {
      __ioLargeValueManifest: 1,
      namespaceHash: String(value.namespaceHash ?? ''),
      token: String(value.token ?? ''),
      chunkCount: Number(value.chunkCount),
      length: Number(value.length),
      ...(byteLength === undefined ? {} : { byteLength }),
      checksum: String(value.checksum ?? ''),
    };
    const validLength = Number.isSafeInteger(manifest.length) &&
      manifest.length > 0 && manifest.length <= LARGE_VALUE_MAX_BYTES;
    const validLegacySize = manifest.byteLength === undefined &&
      manifest.length > LEGACY_LARGE_VALUE_INLINE_CHARS &&
      manifest.length <= LEGACY_LARGE_VALUE_MAX_CHARS;
    const validByteSize = manifest.byteLength !== undefined &&
      Number.isSafeInteger(manifest.byteLength) &&
      manifest.byteLength > LARGE_VALUE_INLINE_BYTES &&
      manifest.byteLength <= LARGE_VALUE_MAX_BYTES;
    if (
      manifest.namespaceHash !== hashText(namespaceKey) ||
      !/^[a-zA-Z0-9-]{8,120}$/.test(manifest.token) ||
      !Number.isSafeInteger(manifest.chunkCount) ||
      manifest.chunkCount < 1 ||
      manifest.chunkCount > LARGE_VALUE_MAX_CHUNKS ||
      !validLength ||
      !(validLegacySize || validByteSize) ||
      !/^[a-f0-9]{8}$/.test(manifest.checksum)
    ) {
      throw new Error('Invalid large-value manifest.');
    }
    return manifest;
  } catch (error) {
    console.error('[Redis Large Value] Invalid chunk manifest:', error);
    throw new Error('A large shared-data record could not be read safely.');
  }
}

function chunkKeysFor(namespaceKey: string, manifest: LargeValueManifest): string[] {
  return Array.from(
    { length: manifest.chunkCount },
    (_, index) =>
      LARGE_VALUE_CHUNK_PREFIX +
      manifest.namespaceHash +
      ':' +
      manifest.token +
      ':' +
      String(index).padStart(3, '0'),
  );
}

/**
 * Store large JSON/text values in small immutable records. The caller atomically
 * swaps the small manifest pointer inside its existing WATCH/MULTI transaction.
 * Legacy inline strings remain readable without a migration window.
 */
export async function createRedisLargeValueWritePlan(
  namespaceKey: string,
  serialized: string,
): Promise<RedisLargeValueWritePlan> {
  const serializedBytes = new TextEncoder().encode(serialized);
  if (serializedBytes.byteLength <= LARGE_VALUE_INLINE_BYTES) {
    return { storedValue: serialized, chunkKeys: [] };
  }
  if (serializedBytes.byteLength > LARGE_VALUE_MAX_BYTES) {
    throw new Error('Shared data exceeds the supported 8 MiB logical size; no changes were written.');
  }

  const chunks: string[] = [];
  const decoder = new TextDecoder();
  for (let offset = 0; offset < serializedBytes.length;) {
    let end = Math.min(serializedBytes.length, offset + LARGE_VALUE_CHUNK_BYTES);
    // Keep each Redis SET under the byte ceiling and never split a UTF-8 sequence.
    if (end < serializedBytes.length) {
      while (end > offset && (serializedBytes[end] & 0xc0) === 0x80) end -= 1;
    }
    if (end <= offset) throw new Error('Shared data contains an invalid UTF-8 chunk boundary.');
    chunks.push(decoder.decode(serializedBytes.subarray(offset, end)));
    offset = end;
  }
  if (chunks.length < 1 || chunks.length > LARGE_VALUE_MAX_CHUNKS) {
    throw new Error('Shared data requires too many Redis records; no changes were written.');
  }

  const token = secureLargeValueToken();
  const namespaceHash = hashText(namespaceKey);
  const manifest: LargeValueManifest = {
    __ioLargeValueManifest: 1,
    namespaceHash,
    token,
    chunkCount: chunks.length,
    length: serialized.length,
    byteLength: serializedBytes.byteLength,
    checksum: checksum(serialized),
  };
  const chunkKeys = chunkKeysFor(namespaceKey, manifest);

  try {
    // Eight independent SETs stay below the platform's per-request limit
    // while avoiding a serial round trip for every 48 KiB record.
    for (let offset = 0; offset < chunks.length; offset += 8) {
      await Promise.all(
        chunks.slice(offset, offset + 8).map((chunk, localIndex) =>
          redis.set(chunkKeys[offset + localIndex], chunk),
        ),
      );
    }
  } catch (error) {
    await discardRedisLargeValueWritePlan({ storedValue: '', chunkKeys });
    throw error;
  }

  return {
    storedValue: JSON.stringify(manifest),
    chunkKeys,
  };
}

export async function readRedisLargeValue(
  namespaceKey: string,
  storedValue: unknown,
): Promise<string | null> {
  if (storedValue == null) return null;
  if (typeof storedValue !== 'string') {
    throw new Error('A shared-data record has an unsupported Redis value type.');
  }
  const manifest = parseLargeValueManifest(namespaceKey, storedValue);
  if (!manifest) return storedValue;

  const keys = chunkKeysFor(namespaceKey, manifest);
  const chunks: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 8) {
    const values = await redis.mGet(keys.slice(offset, offset + 8));
    if (!Array.isArray(values)) {
      throw new Error('A shared-data chunk batch could not be read.');
    }
    for (const value of values) {
      if (typeof value !== 'string') {
        throw new Error('A shared-data chunk is missing; refusing to overwrite the record.');
      }
      chunks.push(value);
    }
  }

  const joined = chunks.join('');
  if (
    joined.length !== manifest.length ||
    (manifest.byteLength !== undefined && new TextEncoder().encode(joined).byteLength !== manifest.byteLength) ||
    checksum(joined) !== manifest.checksum
  ) {
    throw new Error('A shared-data record failed its length/checksum validation.');
  }
  return joined;
}

/** Keep old chunks readable briefly for requests that fetched the prior pointer. */
export async function retireRedisLargeValue(
  namespaceKey: string,
  previousStoredValue: unknown,
): Promise<void> {
  const manifest = parseLargeValueManifest(
    namespaceKey,
    typeof previousStoredValue === 'string' ? previousStoredValue : null,
  );
  if (!manifest) return;
  const keys = chunkKeysFor(namespaceKey, manifest);
  for (let offset = 0; offset < keys.length; offset += 8) {
    await Promise.all(
      keys.slice(offset, offset + 8).map(async key => {
        try {
          if (typeof redis.expire === 'function') {
            await redis.expire(key, LARGE_VALUE_RETIRED_TTL_SECONDS);
          } else {
            const value = await redis.get(key);
            if (typeof value === 'string') {
              await redis.set(key, value, {
                expiration: new Date(Date.now() + LARGE_VALUE_RETIRED_TTL_SECONDS * 1_000),
              });
            }
          }
        } catch (error) {
          console.warn('[Redis Large Value] Previous chunk could not be retired; its TTL may need cleanup:', error);
        }
      }),
    );
  }
}

/** Remove chunks written for a manifest that lost its WATCH/EXEC race. */
export async function discardRedisLargeValueWritePlan(
  plan: RedisLargeValueWritePlan,
): Promise<void> {
  for (let offset = 0; offset < plan.chunkKeys.length; offset += 8) {
    await Promise.all(
      plan.chunkKeys.slice(offset, offset + 8).map(async key => {
        try {
          await redis.del(key);
        } catch (error) {
          console.warn('[Redis Large Value] Uncommitted chunk could not be removed:', key, error);
        }
      }),
    );
  }
}
