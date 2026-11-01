import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupPreviousRedisSnapshot,
  createRedisSnapshotWritePlan,
  discardRedisSnapshotWritePlan,
  readRedisSnapshot,
  type RedisSnapshotClient,
} from '../src/server/redis-snapshot.js';

function createMemoryRedis(maxSetChars = 256 * 1024) {
  const values = new Map<string, string>();
  const client: RedisSnapshotClient = {
    get: async key => values.get(key) ?? null,
    mGet: async keys => keys.map(key => values.get(key) ?? null),
    set: async (key, value) => {
      if (value.length > maxSetChars) {
        throw new Error('Redis SET request exceeded the test payload ceiling.');
      }
      values.set(key, value);
      return 'OK';
    },
    del: async key => values.delete(key),
  };
  return { client, values };
}

test('large shared snapshots are split into bounded Redis SET values and verify on read', async () => {
  const { client, values } = createMemoryRedis();
  const rootKey = 'io:test:guilds';
  const serialized = JSON.stringify({ payload: '🪐'.repeat(200_000) });
  const plan = await createRedisSnapshotWritePlan(client, rootKey, serialized);

  assert.ok(plan.chunkKeys.length > 1);
  assert.ok(plan.chunkKeys.every(key => (values.get(key)?.length ?? Infinity) <= 64 * 1024));
  assert.ok(plan.storedValue.length < 1_000);
  values.set(rootKey, plan.storedValue);

  assert.equal(await readRedisSnapshot(client, rootKey, plan.storedValue), serialized);
});

test('inline snapshots remain backward-compatible and do not create chunk records', async () => {
  const { client, values } = createMemoryRedis();
  const rootKey = 'io:test:inline';
  const serialized = JSON.stringify({ ok: true, count: 3 });
  const plan = await createRedisSnapshotWritePlan(client, rootKey, serialized);

  assert.equal(plan.storedValue, serialized);
  assert.deepEqual(plan.chunkKeys, []);
  assert.equal(await readRedisSnapshot(client, rootKey, serialized), serialized);
  assert.equal(values.size, 0);
});

test('chunk manifests fail closed when a chunk is missing or corrupted', async () => {
  const { client, values } = createMemoryRedis();
  const rootKey = 'io:test:integrity';
  const serialized = 'x'.repeat(250_000);
  const plan = await createRedisSnapshotWritePlan(client, rootKey, serialized);

  values.set(rootKey, plan.storedValue);
  values.delete(plan.chunkKeys[0]);
  await assert.rejects(
    readRedisSnapshot(client, rootKey, plan.storedValue),
    /missing a data chunk/,
  );

  const replacement = await createRedisSnapshotWritePlan(client, rootKey, serialized);
  values.set(replacement.chunkKeys[0], 'corrupt');
  await assert.rejects(
    readRedisSnapshot(client, rootKey, replacement.storedValue),
    /integrity check/,
  );
});

test('replaced snapshots and failed write plans clean up unreachable chunks', async () => {
  const { client, values } = createMemoryRedis();
  const rootKey = 'io:test:replace';
  const first = await createRedisSnapshotWritePlan(client, rootKey, 'a'.repeat(250_000));
  values.set(rootKey, first.storedValue);

  const second = await createRedisSnapshotWritePlan(client, rootKey, 'b'.repeat(250_000));
  values.set(rootKey, second.storedValue);
  await cleanupPreviousRedisSnapshot(client, rootKey, first.storedValue);
  assert.ok(first.chunkKeys.every(key => !values.has(key)));
  assert.ok(second.chunkKeys.every(key => values.has(key)));

  await discardRedisSnapshotWritePlan(client, second);
  assert.ok(second.chunkKeys.every(key => !values.has(key)));
});
