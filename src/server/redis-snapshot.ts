export interface RedisSnapshotClient {
  get(key: string): Promise<string | null | undefined>;
  mGet(keys: string[]): Promise<Array<string | null | undefined>>;
  set(key: string, value: string, options?: { expiration?: Date }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface RedisSnapshotManifest {
  __ioRedisSnapshotManifest: 1;
  token: string;
  chunkCount: number;
  length: number;
  checksum: string;
}

export interface RedisSnapshotWritePlan {
  storedValue: string;
  chunkKeys: string[];
}

const INLINE_CHARS = 192 * 1024;
const CHUNK_CHARS = 64 * 1024;
const MAX_CHUNKS = 512;
const MAX_CHARS = CHUNK_CHARS * MAX_CHUNKS;
const MANIFEST_PREFIX = '{"__ioRedisSnapshotManifest":1';

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function snapshotToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function snapshotChunkKey(rootKey: string, token: string, index: number): string {
  return rootKey + ':snapshot:' + token + ':' + index;
}

function parseManifest(raw: string | null | undefined): RedisSnapshotManifest | null {
  if (typeof raw !== 'string' || !raw.startsWith(MANIFEST_PREFIX)) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Redis snapshot manifest is corrupted; refusing to replace it.');
  }
  const token = String(value.token ?? '');
  const chunkCount = Number(value.chunkCount);
  const length = Number(value.length);
  const hash = String(value.checksum ?? '');
  if (
    !/^[a-zA-Z0-9-]{8,120}$/.test(token) ||
    !Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS ||
    !Number.isSafeInteger(length) || length < 1 || length > MAX_CHARS ||
    !/^[a-f0-9]{8}$/.test(hash)
  ) {
    throw new Error('Redis snapshot manifest is invalid; refusing to replace it.');
  }
  return { __ioRedisSnapshotManifest: 1, token, chunkCount, length, checksum: hash };
}

async function deleteKeys(client: RedisSnapshotClient, keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await client.del(key);
    } catch {
      // A failed cleanup leaves an unreachable orphan, never a partial active snapshot.
    }
  }
}

export async function readRedisSnapshot(
  client: RedisSnapshotClient,
  rootKey: string,
  storedValue: string | null | undefined,
): Promise<string | null> {
  if (storedValue == null) return null;
  const manifest = parseManifest(storedValue);
  if (!manifest) return storedValue;

  const keys = Array.from(
    { length: manifest.chunkCount },
    (_, index) => snapshotChunkKey(rootKey, manifest.token, index),
  );
  const chunks: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 8) {
    const expected = Math.min(8, keys.length - offset);
    const values = await client.mGet(keys.slice(offset, offset + 8));
    if (values.length !== expected || values.some(value => typeof value !== 'string')) {
      throw new Error('Redis snapshot is missing a data chunk; no changes were applied.');
    }
    chunks.push(...values as string[]);
  }
  const joined = chunks.join('');
  if (joined.length !== manifest.length || checksum(joined) !== manifest.checksum) {
    throw new Error('Redis snapshot failed its integrity check; no changes were applied.');
  }
  return joined;
}

export async function createRedisSnapshotWritePlan(
  client: RedisSnapshotClient,
  rootKey: string,
  serialized: string,
  options: { expiration?: Date } = {},
): Promise<RedisSnapshotWritePlan> {
  if (serialized.length <= INLINE_CHARS) return { storedValue: serialized, chunkKeys: [] };
  if (serialized.length > MAX_CHARS) {
    throw new Error('Shared Redis snapshot exceeds the supported 32 MiB logical size. No changes were written.');
  }

  const token = snapshotToken();
  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length;) {
    let end = Math.min(serialized.length, offset + CHUNK_CHARS);
    if (
      end < serialized.length &&
      serialized.charCodeAt(end - 1) >= 0xd800 &&
      serialized.charCodeAt(end - 1) <= 0xdbff
    ) end -= 1;
    chunks.push(serialized.slice(offset, end));
    offset = end;
  }
  if (chunks.length > MAX_CHUNKS) {
    throw new Error('Shared Redis snapshot requires too many data chunks. No changes were written.');
  }

  const chunkKeys = chunks.map((_, index) => snapshotChunkKey(rootKey, token, index));
  let written = 0;
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      await client.set(chunkKeys[index], chunks[index], options.expiration ? { expiration: options.expiration } : undefined);
      written += 1;
    }
  } catch (error) {
    await deleteKeys(client, chunkKeys.slice(0, written));
    throw error;
  }

  const manifest: RedisSnapshotManifest = {
    __ioRedisSnapshotManifest: 1,
    token,
    chunkCount: chunks.length,
    length: serialized.length,
    checksum: checksum(serialized),
  };
  return { storedValue: JSON.stringify(manifest), chunkKeys };
}

export async function discardRedisSnapshotWritePlan(
  client: RedisSnapshotClient,
  plan: RedisSnapshotWritePlan,
): Promise<void> {
  await deleteKeys(client, plan.chunkKeys);
}

const RETIRED_SNAPSHOT_TTL_MS = 10 * 60_000;

export async function cleanupPreviousRedisSnapshot(
  client: RedisSnapshotClient,
  rootKey: string,
  previousStoredValue: string | null | undefined,
): Promise<void> {
  const previous = parseManifest(previousStoredValue);
  if (!previous) return;
  const keys = Array.from(
    { length: previous.chunkCount },
    (_, index) => snapshotChunkKey(rootKey, previous.token, index),
  );
  // Readers may have fetched the old manifest immediately before the atomic
  // root swap. Retain its chunks briefly so that in-flight reads can finish.
  const expiration = new Date(Date.now() + RETIRED_SNAPSHOT_TTL_MS);
  for (const key of keys) {
    try {
      const value = await client.get(key);
      if (typeof value === 'string') await client.set(key, value, { expiration });
    } catch {
      // An orphan is safer than invalidating a reader that still holds the old manifest.
    }
  }
}
