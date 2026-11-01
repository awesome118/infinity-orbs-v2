import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCombatState, getEnemyForDungeonDepth } from '../src/shared/combat.js';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('new Combat runs initialize against a normal, non-boss room', () => {
  const state = createCombatState();
  assert.equal(state.depth, 1);
  assert.equal(getEnemyForDungeonDepth(state.dungeonId, state.depth).boss, false);
});

test('Combat snapshots and mutations use the shared chunk-manifest protocol', () => {
  const combat = source('src/server/combat.ts');
  assert.match(combat, /createRedisLargeValueWritePlan, readRedisLargeValue, retireRedisLargeValue, discardRedisLargeValueWritePlan/);
  assert.match(combat, /async function readCombatStateValue\(key:string\)/);
  assert.match(combat, /readRedisLargeValue\(key,previousStoredValue\)/);
  assert.match(combat, /createRedisLargeValueWritePlan\(key,JSON\.stringify\(s\)\)/);
  assert.match(combat, /txn\.set\(key,writePlan\.storedValue\)/);
  assert.match(combat, /retireRedisLargeValue\(key,previousStoredValue\)/);
  assert.match(combat, /discardRedisLargeValueWritePlan\(writePlan\)/);
  assert.doesNotMatch(combat, /txn\.set\(key,JSON\.stringify\(s\)\)/);
});

test('Arena writes both player combat records through chunk manifests atomically', () => {
  const combat = source('src/server/combat.ts');
  assert.match(combat, /readRedisLargeValue\(ownKey, ownStoredRaw\)/);
  assert.match(combat, /readRedisLargeValue\(opponentKey, opponentStoredRaw\)/);
  assert.match(combat, /createRedisLargeValueWritePlan\(ownKey,JSON\.stringify\(ownState\)\)/);
  assert.match(combat, /createRedisLargeValueWritePlan\(opponentKey,JSON\.stringify\(opponentState\)\)/);
  assert.match(combat, /txn\.set\(ownKey,ownWritePlan\.storedValue\)/);
  assert.match(combat, /txn\.set\(opponentKey,opponentWritePlan\.storedValue\)/);
  assert.match(combat, /retireRedisLargeValue\(ownKey,ownStoredRaw\)/);
  assert.match(combat, /retireRedisLargeValue\(opponentKey,opponentStoredRaw\)/);
});

test('the global game-ban registry reads legacy inline JSON and writes bounded chunk manifests', () => {
  const game = source('src/server/game.ts');
  assert.match(game, /readRedisLargeValue\(GAME_BANS_KEY, storedValue\)/);
  assert.match(game, /readRedisLargeValue\(GAME_BANS_KEY, previousStoredValue\)/);
  assert.match(game, /createRedisLargeValueWritePlan\(GAME_BANS_KEY, JSON\.stringify\(bans\)\)/);
  assert.match(game, /txn\.set\(GAME_BANS_KEY, writePlan\.storedValue\)/);
  assert.match(game, /retireRedisLargeValue\(GAME_BANS_KEY, previousStoredValue\)/);
  assert.match(game, /discardRedisLargeValueWritePlan\(writePlan\)/);
  assert.doesNotMatch(game, /txn\.set\(GAME_BANS_KEY, JSON\.stringify\(bans\)\)/);
});
