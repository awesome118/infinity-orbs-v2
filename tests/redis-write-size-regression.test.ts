import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('player Codex data is stored in small immutable Redis pages', () => {
  const game = source('src/server/game.ts');
  assert.match(game, /PLAYER_COLLECTION_PAGE_CHARS = 18_000/);
  assert.match(game, /PLAYER_COLLECTION_MAX_PAGES = 256/);
  assert.match(game, /playerCollectionPageId\(value\)/);
  assert.match(game, /SHA-256/);
  assert.match(game, /collectionPageIds/);
  assert.match(game, /await Promise\.all\(collectionPageWrites\.slice\(index, index \+ 4\)\.map\(page => redis\.set\(page\.key, page\.value\)\)\)/);
  assert.match(game, /loadPlayerCollectionPages\(/);
  assert.match(game, /deleteObsoletePlayerCollectionPages\(/);
  assert.doesNotMatch(game, /collectionPageWrites\.map\(page => page\.key\)/);
});

test('player save migration preserves full legacy Codex data until a successful paged save', () => {
  const game = source('src/server/game.ts');
  const social = source('src/server/social.ts');
  assert.match(game, /storedPageIdsValue != null/);
  assert.match(game, /collection: isValidCollection\(parsed\.collection\) \? parsed\.collection/);
  assert.match(game, /collectionStorageVersion: 1/);
  assert.match(game, /collection: inMemoryCollection/);
  assert.match(game, /delete copy\.collectionPageIds/);
  assert.match(social, /save\.codexChain \?\? highestCodexChain\(save\.collection\)/);
  assert.match(social, /source\.codexChain \?\? highestCodexChain\(source\.collection\)/);
});

test('Guild Redis writes serialize under a bounded document size and compact chat only', () => {
  const social = source('src/server/social.ts');
  assert.match(social, /GUILD_DOCUMENT_MAX_CHARS = 48_000/);
  assert.match(social, /function serializeGuildsForRedis\(guilds: Guild\[\]\)/);
  assert.match(social, /chat\.slice\(-12\)/);
  assert.match(social, /String\(message\.text \?\? ''\)\.slice\(0, 400\)/);
  assert.match(social, /oldestGuild\.chat\.shift\(\)/);
  assert.match(social, /Guild data has exceeded its safe storage size/);
  assert.ok((social.match(/serializeGuildsForRedis\(/g) ?? []).length >= 4);
  assert.match(social, /GUILD_DOCUMENT_COMPACTION_KEY/);
  assert.match(social, /applyGuildMigration\(GUILD_DOCUMENT_COMPACTION_KEY/);
});

test('full-batch roll path no longer rejects stored Free Rolls above 5,000', () => {
  const game = source('src/server/game.ts');
  const start = game.indexOf('export async function roll(');
  const end = game.indexOf('export async function subscribeToSubredditForReward', start);
  assert.ok(start >= 0 && end > start);
  const roll = game.slice(start, end);
  assert.doesNotMatch(roll, /freeRollActivations > 5_000/);
  assert.match(roll, /const result = await applyRolls\(/);
  assert.match(roll, /const rollCount = result\.rollCount/);
});
