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
  assert.match(game, /playerSaveProjection\(saves\[index\]\)/);
});

test('payment grants and refunds also use the chunked save protocol', () => {
  const game = source('src/server/game.ts');
  assert.ok((game.match(/txn\.set\(pkey, writePlan\.storedValue\)/g) ?? []).length >= 2);
  assert.match(game, /await cleanupPreviousPlayerSave\(userId, storedRaw\)/);
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
  assert.match(app, /body\.error === 'PLAYER_MUTATION_QUEUED'/);
  assert.match(app, /code: 'PLAYER_MUTATION_QUEUED'/);
  assert.match(main, /errorCode === 'PLAYER_MUTATION_QUEUED'/);
  assert.match(combat, /error\.code==='PLAYER_MUTATION_QUEUED'/);
  assert.doesNotMatch(app, /The game is busy finishing another action\. Please retry\./);
});

test('post-handler conflicts are not mislabeled as replay-safe queue admission', () => {
  const app = source('src/server/app.ts');
  const main = source('src/client/main.tsx');
  const combat = source('src/client/components/CombatSection.tsx');
  assert.match(app, /code: 'PLAYER_STATE_CONFLICT'/);
  assert.match(app, /Your latest saved state changed while this action was processing/);
  assert.match(main, /retryableQueuedMutation =/);
  assert.match(combat, /error\.code==='PLAYER_MUTATION_QUEUED'/);
});
