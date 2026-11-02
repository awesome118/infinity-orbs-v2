import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('large player saves are chunked below the Redis request ceiling', () => {
  const game = source('src/server/game.ts');
  assert.match(game, /PLAYER_SAVE_CHUNK_CHARS = 64 \* 1024/);
  assert.match(game, /PLAYER_SAVE_INLINE_CHARS = 192 \* 1024/);
  assert.match(game, /PLAYER_SAVE_MAX_CHUNKS = 128/);
  assert.match(game, /await redis\.set\(chunkKeys\[index\], chunks\[index\]\)/);
  assert.doesNotMatch(game, /txn\.set\(playerKey, serializePlayerStateForRedis\(nextState\)\)/);
});

test('player save chunks are verified and the manifest is swapped atomically', () => {
  const game = source('src/server/game.ts');
  assert.match(game, /__ioPlayerSaveManifest: 1/);
  assert.match(game, /async function readStoredPlayerSave/);
  assert.match(game, /redis\.mGet\(keys\.slice\(offset, offset \+ 8\)\)/);
  assert.match(game, /playerSaveChecksum\(joined\) !== manifest\.checksum/);
  assert.match(game, /txn\.set\(playerKey, writePlan\.storedValue\)/);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, latestRaw\)/);
  assert.match(game, /discardPlayerSaveWritePlan\(writePlan\)/);
});

test('legacy inline saves remain readable and the next oversized save migrates safely', () => {
  const game = source('src/server/game.ts');
  assert.match(game, /if \(storedValue == null\) return null/);
  assert.match(game, /if \(!manifest\) return storedValue/);
  assert.match(game, /createPlayerSaveWritePlan\(userId, serializePlayerStateForRedis\(nextState\)\)/);
  assert.match(game, /const storedSave = saves\[index\]/);
  assert.match(game, /playerSaveProjection\(typeof storedSave === 'string' \? storedSave : null\)/);
});

test('payment grants and refunds also use the chunked save protocol', () => {
  const game = source('src/server/game.ts');
  assert.ok((game.match(/txn\.set\(pkey, writePlan\.storedValue\)/g) ?? []).length >= 2);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, storedRaw\)/);
});

test('achievement claims use the canonical chunked player-save codec', () => {
  const social = source('src/server/social.ts');
  const game = source('src/server/game.ts');
  assert.match(social, /readPlayerSaveForUser\(user\(\), storedRaw\)/);
  assert.match(social, /createPlayerSaveWritePlanForUser\(user\(\), state\)/);
  assert.match(social, /cleanupPreviousPlayerSave\(user\(\), storedRaw\)/);
  assert.doesNotMatch(social, /txn\.set\(playerKey, JSON\.stringify\(state\)\)/);
  assert.match(game, /export async function readPlayerSaveForUser/);
  assert.match(game, /export async function createPlayerSaveWritePlanForUser/);
});

test('admin Global Booster grants use chunked saves and preserve idempotency receipts', () => {
  const debug = source('src/server/debug.ts');
  assert.match(debug, /readPlayerSaveForUser\(id, storedRaw\)/);
  assert.match(debug, /createPlayerSaveWritePlanForUser/);
  assert.match(debug, /txn\.set\(playerKey, writePlan\.storedValue\)/);
  assert.match(debug, /txn\.set\(receiptKey, receipt\)/);
  assert.match(debug, /cleanupPreviousPlayerSave\(id, storedRaw\)/);
  assert.doesNotMatch(debug, /txn\.set\(playerKey, JSON\.stringify\(state\)\)/);
});

test('legacy leaderboard and admin batch recipient manifests use chunked Redis records', () => {
  const social = source('src/server/social.ts');
  const debug = source('src/server/debug.ts');
  const large = source('src/server/redis-large-values.ts');
  assert.match(social, /readRedisLargeValue\(leaderboardKey, storedRaw\)/);
  assert.match(social, /createRedisLargeValueWritePlan\(leaderboardKey, serialized\)/);
  assert.match(social, /retireRedisLargeValue\(leaderboardKey, storedRaw\)/);
  assert.match(debug, /readRedisLargeValue\(leaderboardKey, storedRaw\)/);
  assert.match(debug, /createRedisLargeValueWritePlan\(leaderboardKey/);
  assert.match(debug, /readRedisLargeValue\(manifestKey, existingStored\)/);
  assert.match(debug, /createRedisLargeValueWritePlan\(manifestKey, JSON\.stringify\(manifest\)\)/);
  assert.match(debug, /retireRedisLargeValue\(manifestKey, watchedStored\)/);
  assert.match(large, /LARGE_VALUE_CHUNK_CHARS = 64 \* 1024/);
});

test('diagnostic and activation logs are bounded by count and serialized size', () => {
  const game = source('src/server/game.ts');
  for (const limit of [
    'PLAYER_SPY_LOG_LIMIT = 160',
    'SAVE_DEBUG_LOG_LIMIT = 180',
    'GLOBAL_BOOSTER_DEBUG_LOG_LIMIT = 120',
    'GLOBAL_BOOSTER_ACTIVATION_LOG_LIMIT = 180',
  ]) assert.ok(game.includes(limit), limit);
  assert.ok((game.match(/JSON\.stringify\(entries\)\.length > 700_000/g) ?? []).length >= 4);
});

test('player lock admission failures are coded, and client retries only that response', () => {
  const lock = source('src/server/player-lock.ts');
  const app = source('src/server/app.ts');
  const main = source('src/client/main.tsx');
  const combat = source('src/client/components/CombatSection.tsx');
  assert.match(lock, /throw new Error\('PLAYER_MUTATION_QUEUED'\)/);
  assert.match(app, /body\?\.error === 'PLAYER_MUTATION_QUEUED'/);
  assert.match(app, /code: 'PLAYER_MUTATION_QUEUED'/);
  assert.match(main, /errorCode === 'PLAYER_MUTATION_QUEUED'/);
  assert.match(combat, /error\.code==='PLAYER_MUTATION_QUEUED'/);
  assert.doesNotMatch(app, /The game is busy finishing another action\. Please retry\./);
});

test('transient Redis and lock contention is normalized into one retryable queue response', () => {
  const app = source('src/server/app.ts');
  const main = source('src/client/main.tsx');
  const combat = source('src/client/components/CombatSection.tsx');
  assert.match(app, /code: 'PLAYER_MUTATION_QUEUED'/);
  assert.match(app, /PLAYER_STATE_CONFLICT/);
  assert.match(app, /combat state changed repeatedly/i);
  assert.match(app, /Your action is queued and will retry automatically/);
  assert.doesNotMatch(app, /code: 'PLAYER_STATE_CONFLICT'/);
  assert.doesNotMatch(app, /MUTATION_LOCK_PREFIX|acquireMutationLock/);
  assert.match(main, /retryableQueuedMutation =/);
  assert.match(combat, /error\.code==='PLAYER_MUTATION_QUEUED'/);
});

test('unbounded shared Guild JSON is stored through an atomic chunk manifest', () => {
  const large = source('src/server/redis-large-values.ts');
  const social = source('src/server/social.ts');
  const game = source('src/server/game.ts');

  assert.match(large, /LARGE_VALUE_CHUNK_CHARS = 64 \* 1024/);
  assert.match(large, /LARGE_VALUE_INLINE_CHARS = 192 \* 1024/);
  assert.match(large, /LARGE_VALUE_MAX_CHUNKS = 128/);
  assert.match(large, /redis\.mGet\(keys\.slice\(offset, offset \+ 8\)\)/);
  assert.match(large, /checksum\(joined\) !== manifest\.checksum/);
  assert.match(social, /readRedisLargeValue\(GUILDS_KEY/);
  assert.match(social, /createRedisLargeValueWritePlan\(GUILDS_KEY/);
  assert.doesNotMatch(social, /txn\.set\(GUILDS_KEY, JSON\.stringify/);
  assert.match(game, /write\.key === 'io:guilds'/);
  assert.match(game, /extraWritePlans/);
});


test('retired player-save chunks use short metadata-only expiry instead of rewriting payloads', () => {
  const game = source('src/server/game.ts');
  assert.match(game, /PLAYER_SAVE_RETIRED_CHUNK_TTL_SECONDS = 60/);
  assert.match(game, /redis\.expire\(keyName, PLAYER_SAVE_RETIRED_CHUNK_TTL_SECONDS\)/);
  assert.doesNotMatch(game, /redis\.set\(keyName, chunk, \{ expiration \}\)/);
  assert.doesNotMatch(game, /const PLAYER_SAVE_RETIRED_CHUNK_TTL_MS = 10 \* 60_000/);
});


test('emergency diagnostic cleanup uses quota-safe DEL and never deletes player saves', () => {
  const game = source('src/server/game.ts');
  const debug = source('src/server/debug.ts');
  const ui = source('src/client/components/DevDebugModal.tsx');
  for (const fn of ['clearPaymentDebugLogs', 'clearGlobalBoosterDebugLogs', 'clearGlobalBoosterActivationLog']) {
    const start = game.indexOf('export async function ' + fn);
    assert.ok(start >= 0, fn + ' exists');
    const next = game.indexOf('\\nexport ', start + 1);
    const body = game.slice(start, next >= 0 ? next : game.length);
    assert.match(body, /redis\\.del\\(/, fn + ' uses DEL');
    assert.doesNotMatch(body, /redis\\.set\\(/, fn + ' does not use quota-gated SET');
  }
  assert.match(game, /export async function clearAllDiagnosticLogs/);
  assert.match(game, /redis\\.hKeys\\(PLAYER_REGISTRY_KEY\\)/);
  assert.match(game, /redis\\.del\\(playerSpyKey\\(userId\\)\\)/);
  const clearAllStart = game.indexOf('export async function clearAllDiagnosticLogs');
  const clearAllEnd = game.indexOf('\\nexport ', clearAllStart + 1);
  const clearAllBody = game.slice(clearAllStart, clearAllEnd >= 0 ? clearAllEnd : game.length);
  assert.doesNotMatch(clearAllBody, /playerKeyFor|playerSaveChunkKey|codexShardKey|combatKey/i);
  assert.match(debug, /debugRouter\\.post\\('\\/diagnostic-logs\\/clear-all'/);
  assert.match(ui, /Clear All Diagnostic Logs/);
  assert.match(ui, /Player saves, combat saves, Codex, leaderboards, and player progression/);
});
