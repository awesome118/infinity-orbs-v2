import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  REDIS_SAFE_SET_MAX_BYTES,
  serializeBoundedLeaderboard,
  serializeBoundedRedisLog,
} from '../src/server/redis-bounds.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('large player saves use byte-bounded UTF-8 chunks below the Redis request ceiling', () => {
  const game = source('src/server/game.ts');
  const playerSave = source('src/server/player-save.ts');
  assert.match(playerSave, /PLAYER_SAVE_CHUNK_BYTES = 48 \* 1024/);
  assert.match(playerSave, /PLAYER_SAVE_INLINE_BYTES = 48 \* 1024/);
  assert.match(playerSave, /PLAYER_SAVE_MAX_CHUNKS = 192/);
  assert.match(playerSave, /new TextEncoder\(\)\.encode\(serialized\)/);
  assert.match(playerSave, /await redis\.set\(chunkKeys\[index\], chunks\[index\]\)/);
  assert.doesNotMatch(game, /txn\.set\(playerKey, serializePlayerStateForRedis\(nextState\)\)/);
});

test('player save chunks are verified and the manifest is swapped atomically', () => {
  const game = source('src/server/game.ts');
  const playerSave = source('src/server/player-save.ts');
  assert.match(playerSave, /__ioPlayerSaveManifest: 1/);
  assert.match(playerSave, /export async function readStoredPlayerSave/);
  assert.match(playerSave, /redis\.mGet\(keys\.slice\(offset, offset \+ 8\)\)/);
  assert.match(playerSave, /playerSaveChecksum\(joined\) !== manifest\.checksum/);
  assert.match(game, /txn\.set\(playerKey, writePlan\.storedValue\)/);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, latestRaw\)/);
  assert.match(game, /discardPlayerSaveWritePlan\(writePlan\)/);
});

test('legacy inline saves remain readable and the next oversized save migrates safely', () => {
  const game = source('src/server/game.ts');
  const playerSave = source('src/server/player-save.ts');
  assert.match(playerSave, /if \(storedValue == null\) return null/);
  assert.match(playerSave, /if \(!manifest\) return storedValue/);
  assert.match(game, /createPlayerSaveWritePlan\(userId, serializePlayerStateForRedis\(nextState\)\)/);
  assert.match(game, /playerSaveProjection\(saves\[index\]\)/);
});

test('payment grants and refunds also use the chunked save protocol', () => {
  const game = source('src/server/game.ts');
  assert.ok((game.match(/txn\.set\(pkey, writePlan\.storedValue\)/g) ?? []).length >= 2);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, storedRaw\)/);
});

test('diagnostic and activation logs are bounded by count and UTF-8 serialized size', () => {
  const game = source('src/server/game.ts');
  for (const limit of [
    'PLAYER_SPY_LOG_LIMIT = 160',
    'SAVE_DEBUG_LOG_LIMIT = 180',
    'GLOBAL_BOOSTER_DEBUG_LOG_LIMIT = 120',
    'GLOBAL_BOOSTER_ACTIVATION_LOG_LIMIT = 180',
  ]) assert.ok(game.includes(limit), limit);
  assert.ok((game.match(/serializeBoundedRedisLog\(entries\)/g) ?? []).length >= 5);
  assert.doesNotMatch(game, /700_000/);
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


test('achievement claims and admin Booster grants use the shared chunked player-save protocol', () => {
  const social = source('src/server/social.ts');
  const debug = source('src/server/debug.ts');
  assert.match(social, /readStoredPlayerSave\(user\(\), storedRaw\)/);
  assert.match(social, /createPlayerSaveWritePlan\(user\(\), serializePlayerStateForRedis\(state\)\)/);
  assert.match(social, /txn\.set\(playerKey, writePlan\.storedValue\)/);
  assert.match(debug, /readStoredPlayerSave\(id, storedRaw\)/);
  assert.match(debug, /createPlayerSaveWritePlan\(/);
  assert.match(debug, /txn\.set\(playerKey, writePlan\.storedValue\)/);
  assert.doesNotMatch(social, /txn\.set\(playerKey, JSON\.stringify\(state\)\)/);
  assert.doesNotMatch(debug, /txn\.set\(playerKey, JSON\.stringify\(state\)\)/);
});

test('diagnostic and leaderboard Redis values stay below the request-size ceiling', () => {
  const oversizedLogs = Array.from({ length: 80 }, (_, timestamp) => ({
    timestamp,
    event: 'oversized-debug-record',
    details: '🪐'.repeat(8_000),
  }));
  const logJson = serializeBoundedRedisLog(oversizedLogs);
  assert.ok(new TextEncoder().encode(logJson).byteLength <= REDIS_SAFE_SET_MAX_BYTES);
  const retainedLogs = JSON.parse(logJson) as Array<{ timestamp: number; truncated?: boolean }>;
  assert.equal(retainedLogs.at(-1)?.timestamp, 79);
  assert.ok(retainedLogs.some(entry => entry.truncated));

  const oversizedBoard = Array.from({ length: 5_000 }, (_, index) => ({
    username: 'player-' + index,
    value: index,
    rolls: index * 100,
  }));
  const boardJson = serializeBoundedLeaderboard(oversizedBoard);
  assert.ok(new TextEncoder().encode(boardJson).byteLength <= REDIS_SAFE_SET_MAX_BYTES);
  const retainedBoard = JSON.parse(boardJson) as Array<{ username: string }>;
  assert.equal(retainedBoard[0]?.username, 'player-0');
  assert.ok(retainedBoard.length < oversizedBoard.length);
});
