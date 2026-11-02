import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginServerRequest,
  estimateKnownRedisStorage,
  getServerMonitorSnapshot,
  recordRedisOperation,
  recordUpgradeBatchDiagnostic,
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


test('upgrade batch diagnostics distinguish server acceptance, partial purchase, rejection, and client rollback', () => {
  const before = getServerMonitorSnapshot();

  recordUpgradeBatchDiagnostic({
    stage: 'server-accepted',
    username: 'shadow_fen',
    requestId: 'upgrade-diag-accepted-test',
    upgradeIds: ['speed'],
    status: 200,
    durationMs: 8,
    purchasedCount: 1,
  });
  recordUpgradeBatchDiagnostic({
    stage: 'server-partial',
    username: 'shadow_fen',
    requestId: 'upgrade-diag-partial-test',
    upgradeIds: ['speed', 'luck'],
    status: 200,
    durationMs: 11,
    purchasedCount: 1,
    message: 'Need more Coins for luck.',
  });
  recordUpgradeBatchDiagnostic({
    stage: 'server-rejected',
    username: 'shadow_fen',
    requestId: 'upgrade-diag-rejected-test',
    upgradeIds: ['criticalDividend'],
    status: 400,
    durationMs: 3,
    errorCode: 'INVALID_BATCH_IDS',
    message: 'Batch contained an unsupported upgrade.',
  });
  recordUpgradeBatchDiagnostic({
    stage: 'client-rollback',
    username: 'shadow_fen',
    requestId: 'upgrade-diag-rollback-test',
    upgradeIds: ['speed'],
    status: 503,
    durationMs: 3200,
    errorCode: 'PLAYER_MUTATION_QUEUED',
    message: 'Your action is queued and will retry automatically.',
  });

  const after = getServerMonitorSnapshot();
  assert.equal(after.upgradeBatches.serverAttempts - before.upgradeBatches.serverAttempts, 3);
  assert.equal(after.upgradeBatches.serverAccepted - before.upgradeBatches.serverAccepted, 1);
  assert.equal(after.upgradeBatches.serverPartial - before.upgradeBatches.serverPartial, 1);
  assert.equal(after.upgradeBatches.serverRejected - before.upgradeBatches.serverRejected, 1);
  assert.equal(after.upgradeBatches.clientRollbacks - before.upgradeBatches.clientRollbacks, 1);
  assert.ok(after.upgradeBatches.averageServerDurationMs >= 0);

  const partial = after.events.find(event => event.details?.requestId === 'upgrade-diag-partial-test');
  assert.ok(partial);
  assert.equal(partial?.details?.stage, 'server-partial');
  assert.equal(partial?.details?.purchasedCount, 1);
  assert.match(partial?.message ?? '', /Need more Coins for luck/);

  const rejected = after.events.find(event => event.details?.requestId === 'upgrade-diag-rejected-test');
  assert.ok(rejected);
  assert.equal(rejected?.details?.errorCode, 'INVALID_BATCH_IDS');

  const rollback = after.events.find(event => event.details?.requestId === 'upgrade-diag-rollback-test');
  assert.ok(rollback);
  assert.equal(rollback?.details?.stage, 'client-rollback');
});


test('storage estimate includes the payload represented by active chunked player-save manifests', async () => {
  const userId = 'chunked-monitor-user';
  const manifest = JSON.stringify({
    __ioPlayerSaveManifest: 1,
    token: 'playersave-test-token-1234',
    chunkCount: 4,
    length: 256 * 1024,
    checksum: 'deadbeef',
    projection: { username: 'ChunkedTester' },
  });
  const values: Record<string, string> = {
    ['player:' + userId]: manifest,
  };
  const fakeRedis = {
    hGetAll: async (key: string) => key === 'io:player-registry'
      ? { [userId]: JSON.stringify({ username: 'ChunkedTester' }) }
      : {},
    mGet: async (keys: string[]) => keys.map(key => values[key] ?? null),
  };

  const estimate = await estimateKnownRedisStorage(fakeRedis);
  const playerSaves = estimate.groups.find(group => group.label === 'Player saves');
  assert.ok(playerSaves);
  assert.ok(playerSaves.bytes >= 256 * 1024);
  assert.equal(playerSaves.records, 5); // manifest plus four active chunks
  assert.match(estimate.note, /Retired chunk generations/);
});
