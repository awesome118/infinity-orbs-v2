import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('large player saves are chunked below the Redis request ceiling', () => {
  const game = source('src/server/game.ts');
  const storage = source('src/server/player-save-storage.ts');
  assert.match(storage, /PLAYER_SAVE_CHUNK_CHARS = 64 \* 1024/);
  assert.match(storage, /PLAYER_SAVE_INLINE_CHARS = 192 \* 1024/);
  assert.match(storage, /PLAYER_SAVE_MAX_CHUNKS = 128/);
  assert.match(storage, /await redis\.set\(chunkKeys\[index\], chunks\[index\]\)/);
  assert.doesNotMatch(game, /txn\.set\(playerKey, serializePlayerStateForRedis\(nextState\)\)/);
});

test('player save chunks are verified and the manifest is swapped atomically', () => {
  const game = source('src/server/game.ts');
  const storage = source('src/server/player-save-storage.ts');
  assert.match(storage, /__ioPlayerSaveManifest: 1/);
  assert.match(storage, /async function readStoredPlayerSave/);
  assert.match(storage, /redis\.mGet\(keys\.slice\(offset, offset \+ 8\)\)/);
  assert.match(storage, /playerSaveChecksum\(joined\) !== manifest\.checksum/);
  assert.match(game, /txn\.set\(playerKey, writePlan\.storedValue\)/);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, latestRaw\)/);
  assert.match(game, /discardPlayerSaveWritePlan\(writePlan\)/);
});

test('legacy inline saves remain readable and the next oversized save migrates safely', () => {
  const game = source('src/server/game.ts');
  const storage = source('src/server/player-save-storage.ts');
  assert.match(storage, /if \(storedValue == null\) return null/);
  assert.match(storage, /if \(!manifest\) return storedValue/);
  assert.match(game, /createPlayerSaveWritePlan\(userId, serializePlayerStateForRedis\(nextState\)\)/);
  assert.match(game, /playerSaveProjection\(saves\[index\]\)/);
});

test('payment grants and refunds also use the chunked save protocol', () => {
  const game = source('src/server/game.ts');
  assert.ok((game.match(/txn\.set\(pkey, writePlan\.storedValue\)/g) ?? []).length >= 2);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, storedRaw\)/);
});

test('all PlayerState mutation routes use the same chunked player-save manifest', () => {
  const storage = source('src/server/player-save-storage.ts');
  const game = source('src/server/game.ts');
  const social = source('src/server/social.ts');
  const debug = source('src/server/debug.ts');

  assert.match(storage, /export async function readStoredPlayerSave/);
  assert.match(storage, /export async function createPlayerSaveWritePlan/);
  assert.match(storage, /export async function cleanupPreviousPlayerSave/);
  assert.match(game, /readStoredPlayerSave\(safeOwnerId, raw\)/);
  assert.match(game, /playerSave: true/);
  assert.match(game, /extraPlayerSavePlans/);
  assert.match(game, /readRedisLargeValue\(GAME_BANS_KEY/);
  assert.match(game, /createRedisLargeValueWritePlan\(GAME_BANS_KEY/);
  assert.match(social, /readStoredPlayerSave\(userId, previousPointer\)/);
  assert.match(social, /createPlayerSaveWritePlan\(userId, serializePlayerStateForRedis\(state\)\)/);
  assert.match(debug, /readStoredPlayerSave\(id, raw\)/);
  assert.match(debug, /createPlayerSaveWritePlan\(id, serializePlayerStateForRedis/);
  assert.match(debug, /createPlayerSaveWritePlan\(userId, serializePlayerStateForRedis\(fresh\)\)/);
  assert.doesNotMatch(social, /txn\.set\(playerKey, JSON\.stringify\(state\)\)/);
  assert.doesNotMatch(debug, /txn\.set\(playerKey, JSON\.stringify/);
});

test('large leaderboard and admin batch documents use the shared chunk manifest', () => {
  const social = source('src/server/social.ts');
  const debug = source('src/server/debug.ts');
  const large = source('src/server/redis-large-values.ts');

  assert.match(large, /LARGE_VALUE_CHUNK_CHARS = 64 \* 1024/);
  assert.match(social, /readRedisLargeValue\(key\('leaderboard'\), legacyPointer\)/);
  assert.match(social, /createRedisLargeValueWritePlan\(leaderboardKey/);
  assert.match(social, /readRedisLargeValue\(leaderboardKey/);
  assert.match(social, /readRedisLargeValue\(GLOBAL_CHAT_KEY/);
  assert.match(social, /createRedisLargeValueWritePlan\(GLOBAL_CHAT_KEY/);
  assert.match(debug, /readRedisLargeValue\(manifestKey/);
  assert.match(debug, /createRedisLargeValueWritePlan\(manifestKey/);
  assert.match(debug, /readRedisLargeValue\(leaderboardKey/);
  assert.match(debug, /createRedisLargeValueWritePlan\(leaderboardKey/);
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
