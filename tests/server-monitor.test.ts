import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginServerRequest,
  estimateKnownRedisStorage,
  getServerMonitorSnapshot,
  recordRedisOperation,
} from '../src/server/server-monitor.js';

test('server monitor turns roll requests into human-readable feed entries', () => {
  const actor = 'ServerMonitorTester' + Date.now().toString(36);
  let finish: (() => void) | undefined;
  let statusCode = 200;

  beginServerRequest(
    'POST',
    '/api/roll',
    actor,
    () => statusCode,
    (event, callback) => {
      assert.equal(event, 'finish');
      finish = callback;
    },
  );
  assert.equal(typeof finish, 'function');
  finish?.();

  const snapshot = getServerMonitorSnapshot();
  const entry = snapshot.events.find(event => event.actor === 'u/' + actor);
  assert.ok(entry);
  assert.match(entry.message, new RegExp('Received orb roll from u/' + actor));
  assert.equal(entry.status, 200);
  assert.ok(snapshot.metrics.requestsLastMinute >= 1);
});

test('server monitor records errors and excludes its own polling endpoint', () => {
  const before = getServerMonitorSnapshot();
  let finish: (() => void) | undefined;
  beginServerRequest('GET', '/api/dev/server-monitor', 'MonitorAdmin', () => 200, (_event, callback) => {
    finish = callback;
  });
  finish?.();
  const after = getServerMonitorSnapshot();
  assert.equal(after.events.length, before.events.length);
  assert.equal(after.metrics.requestsLastMinute, before.metrics.requestsLastMinute);
});

test('Redis instrumentation contributes to a rolling operation-rate metric', () => {
  recordRedisOperation('get');
  recordRedisOperation('hGetAll');
  recordRedisOperation('not-a-redis-command');
  const snapshot = getServerMonitorSnapshot();
  assert.ok(snapshot.metrics.peakRedisOperationsPerSecond >= 2);
  assert.ok(snapshot.metrics.redisCapacityPercent >= 0);
  assert.equal(snapshot.limits.redisCommandsPerSecond, 40_000);
});

test('storage estimate breaks down indexed player, combat, registry, and shared values', async () => {
  const values: Record<string, string> = {
    'player:monitor-test-user': JSON.stringify({ username: 'MonitorTester', coins: 123 }),
    'infinity-orbs:combat:monitor-test-user': JSON.stringify({ depth: 7, inventory: [] }),
    'io:leaderboard': JSON.stringify([{ username: 'MonitorTester', value: 12 }]),
    'io:save-debug:v1': JSON.stringify([]),
  };
  const fakeRedis = {
    hGetAll: async (key: string) => key === 'io:player-registry'
      ? { 'monitor-test-user': JSON.stringify({ username: 'MonitorTester' }) }
      : {},
    mGet: async (keys: string[]) => keys.map(key => values[key] ?? null),
  };

  const estimate = await estimateKnownRedisStorage(fakeRedis);
  assert.equal(estimate.partial, true);
  assert.equal(estimate.playerCount, 1);
  assert.ok(estimate.knownBytes > 0);
  assert.ok(estimate.knownPercent >= 0);
  assert.ok(estimate.groups.some(group => group.label === 'Player saves' && group.records === 1));
  assert.ok(estimate.groups.some(group => group.label === 'Combat saves' && group.records === 1));
  assert.ok(estimate.groups.some(group => group.label === 'Player registry' && group.records === 1));
  assert.match(estimate.note, /Lower-bound estimate/);
});
