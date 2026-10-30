import assert from 'node:assert/strict';
import testCase from 'node:test';
import {
  compressRedisString,
  createRedisCompressionProxy,
  decompressRedisString,
  REDIS_COMPRESSION_PREFIX,
} from '../src/server/redis-compression.js';

testCase('Redis compression round-trips large JSON strings and preserves short values', () => {
  const large = JSON.stringify({ entries: Array.from({ length: 4_000 }, (_, i) => ({ rarity: i + 2, count: 1, label: 'repeated collection record' })) });
  const compressed = compressRedisString(large);
  assert.ok(compressed.startsWith(REDIS_COMPRESSION_PREFIX));
  assert.ok(compressed.length < large.length);
  assert.equal(decompressRedisString(compressed), large);
  assert.equal(compressRedisString('small value'), 'small value');
  assert.equal(decompressRedisString('small value'), 'small value');
});

testCase('malformed compressed values are not silently rewritten', () => {
  const malformed = REDIS_COMPRESSION_PREFIX + 'not-valid-gzip';
  assert.equal(decompressRedisString(malformed), malformed);
});

testCase('Redis proxy compresses direct and transactional writes and decompresses reads', async () => {
  const values = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const client = {
    async get(key: string) { return values.get(key) ?? null; },
    async set(key: string, value: string) { values.set(key, value); return 'OK'; },
    async mGet(keys: string[]) { return keys.map(key => values.get(key) ?? null); },
    async mSet(entries: Record<string, string>) {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    async hGet(key: string, field: string) { return hashes.get(key)?.[field] ?? null; },
    async hSet(key: string, fields: Record<string, string>) {
      const current = hashes.get(key) ?? {};
      Object.assign(current, fields);
      hashes.set(key, current);
      return Object.keys(fields).length;
    },
    async hGetAll(key: string) { return hashes.get(key) ?? {}; },
    async watch() {
      return {
        async set(key: string, value: string) { values.set(key, value); return 'QUEUED'; },
        async hSet(key: string, fields: Record<string, string>) {
          const current = hashes.get(key) ?? {};
          Object.assign(current, fields);
          hashes.set(key, current);
          return 'QUEUED';
        },
        async multi() {},
        async exec() { return []; },
        async unwatch() {},
      };
    },
  };
  const redis = createRedisCompressionProxy(client);
  const large = 'collection-record/'.repeat(20_000);

  await redis.set('player:test', large);
  const raw = values.get('player:test');
  assert.ok(raw?.startsWith(REDIS_COMPRESSION_PREFIX));
  assert.equal(await redis.get('player:test'), large);
  assert.deepEqual(await redis.mGet(['player:test']), [large]);

  await redis.hSet('hash:test', { player: large });
  assert.ok(hashes.get('hash:test')?.player.startsWith(REDIS_COMPRESSION_PREFIX));
  assert.equal(await redis.hGet('hash:test', 'player'), large);
  assert.equal((await redis.hGetAll('hash:test')).player, large);

  const transaction = await redis.watch('player:test');
  await transaction.multi();
  await transaction.set('player:transaction', large);
  await transaction.hSet('hash:transaction', { player: large });
  await transaction.exec();
  assert.ok(values.get('player:transaction')?.startsWith(REDIS_COMPRESSION_PREFIX));
  assert.equal(await redis.get('player:transaction'), large);
  assert.ok(hashes.get('hash:transaction')?.player.startsWith(REDIS_COMPRESSION_PREFIX));
  assert.equal(await redis.hGet('hash:transaction', 'player'), large);
});
