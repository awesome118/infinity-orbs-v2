import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CODEX_MIGRATION_BATCH_SIZE,
  CODEX_SHARD_COUNT,
  CODEX_STORAGE_VERSION,
  codexShardIndex,
  codexShardKey,
  groupCodexFields,
} from '../src/shared/collection-storage.js';

test('Codex rarity keys use stable, generation-scoped shards', () => {
  assert.equal(CODEX_STORAGE_VERSION, 1);
  assert.equal(CODEX_SHARD_COUNT, 16);
  for (const key of ['2', '3', '10', '100', '1000', '1e+100', 'Infinity']) {
    assert.equal(codexShardIndex(key), codexShardIndex(key));
    assert.ok(codexShardIndex(key) >= 0 && codexShardIndex(key) < CODEX_SHARD_COUNT);
  }
  assert.notEqual(codexShardKey('player-a', 0, 1), codexShardKey('player-b', 0, 1));
  assert.notEqual(codexShardKey('player-a', 0, 1), codexShardKey('player-a', 1, 1));
});

test('Codex updates write only changed rarity counts', () => {
  const grouped = groupCodexFields([['2', 14], ['100', 7], ['Infinity', 1]]);
  const flattened = grouped.flatMap(item => Object.entries(item.fields));
  assert.equal(flattened.length, 3);
  assert.deepEqual(Object.fromEntries(flattened), { '2': '14', '100': '7', Infinity: '1' });
  assert.ok(grouped.every(item => Object.keys(item.fields).length > 0));
  assert.ok(CODEX_MIGRATION_BATCH_SIZE <= 512);
});

test('normal player save stores Codex deltas outside the large player JSON', () => {
  const game = readFileSync(resolve(process.cwd(), 'src/server/game.ts'), 'utf8');
  const save = game.slice(game.indexOf('export async function save('), game.indexOf('\nfunction serverRandom'));
  const load = game.slice(game.indexOf('export async function loadRaw('), game.indexOf('\nfunction applyXp'));
  const payment = game.slice(game.indexOf('export async function grantPurchasedPack'), game.indexOf('export async function loadRaw'));
  assert.match(save, /pendingCodexRarityWrites/);
  assert.match(save, /txn\.hSet\(codexWriteKeys\[index\], codexWrites\[index\]\.fields\)/);
  assert.match(save, /serializePlayerStateForRedis\(nextState\)/);
  assert.match(load, /readCodexShards\(userId, generation\)/);
  assert.match(game, /ensureCodexStorageVersion\(userId, generation, state\)/);
  assert.equal((payment.match(/serializePlayerStateForRedis\(state\)/g) ?? []).length, 2);
  assert.match(load, /migrateLegacyCodex\(userId, generation, restoredCollection\)/);
  assert.match(game, /markCodexRarityWrite\(s, key\)/);
});
